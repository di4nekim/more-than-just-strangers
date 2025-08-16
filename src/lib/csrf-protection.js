import { randomBytes } from 'crypto';

class CSRFProtection {
  constructor() {
    this.tokenCache = new Map();
    this.maxTokenAge = 60 * 60 * 1000;
  }

  generateToken() {
    const token = randomBytes(32).toString('hex');
    this.tokenCache.set(token, Date.now());
    this.cleanupExpiredTokens();
    return token;
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
    
    let token = localStorage.getItem('csrf-token');
    if (!token) {
      token = this.generateToken();
      localStorage.setItem('csrf-token', token);
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