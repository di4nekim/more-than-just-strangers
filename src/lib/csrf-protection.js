// Browser-compatible crypto functions
const generateRandomBytes = (length) => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    // Use Web Crypto API in browser
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } else if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    // Use Node.js crypto in server environment
    try {
      const { randomBytes } = require('crypto');
      return randomBytes(length).toString('hex');
    } catch (error) {
      // Fallback if crypto module not available
      return generateFallbackToken(length);
    }
  } else {
    // Fallback for environments without crypto
    return generateFallbackToken(length);
  }
};

const generateFallbackToken = (length) => {
  // Simple fallback using Math.random (less secure but prevents errors)
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length * 2; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

class CSRFProtection {
  constructor() {
    this.tokenCache = new Map();
    this.maxTokenAge = 60 * 60 * 1000;
  }

  generateToken() {
    try {
      const token = generateRandomBytes(32);
      this.tokenCache.set(token, Date.now());
      this.cleanupExpiredTokens();
      return token;
    } catch (error) {
//       // console.warn('CSRF token generation failed, using fallback:', error.message);
      // Fallback token generation
      const token = generateFallbackToken(32);
      this.tokenCache.set(token, Date.now());
      this.cleanupExpiredTokens();
      return token;
    }
  }

  validateToken(token) {
    if (!token || typeof token !== 'string') return false;

    const timestamp = this.tokenCache.get(token);
    if (!timestamp) return false;

    if (Date.now() - timestamp > this.maxTokenAge) {
      this.tokenCache.delete(token);
      return false;
    }

    this.tokenCache.delete(token);
    return true;
  }

  cleanupExpiredTokens() {
    const now = Date.now();
    for (const [token, timestamp] of this.tokenCache.entries()) {
      if (now - timestamp > this.maxTokenAge) {
        this.tokenCache.delete(token);
      }
    }
  }

  getClientToken() {
    if (typeof window === 'undefined') return null;
    
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) return metaToken.getAttribute('content');
    
    let token = null;
    try {
      // Safely access localStorage with error handling
      token = localStorage.getItem('csrf-token');
    } catch (error) {
//       // console.warn('Failed to access localStorage for CSRF token:', error.message);
      // Generate a session token without storing it
      return this.generateToken();
    }
    
    if (!token) {
      try {
        token = this.generateToken();
        localStorage.setItem('csrf-token', token);
      } catch (error) {
//         // console.warn('Failed to store CSRF token in localStorage:', error.message);
        // Return the token even if we can't store it
      }
    }
    return token;
  }

  setMetaToken(token) {
    if (typeof document === 'undefined') return;
    
    let metaTag = document.querySelector('meta[name="csrf-token"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.name = 'csrf-token';
      document.head.appendChild(metaTag);
    }
    metaTag.content = token;
  }

  createMiddleware() {
    return (handler) => async (req, res) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return handler(req, res);
      }

      const csrfToken = req.headers['x-csrf-token'] || req.body?.csrfToken;
      
      if (!csrfToken || !this.validateToken(csrfToken)) {
        return res.status(403).json({
          error: 'Invalid or missing CSRF token',
          code: 'CSRF_TOKEN_INVALID'
        });
      }

      return handler(req, res);
    };
  }
}

export default new CSRFProtection(); 