import { NextResponse } from 'next/server';

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;

// Enhanced CORS configuration for production
const getAllowedOrigins = () => {
  const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || [];
  const defaultOrigins = ['http://localhost:3000'];
  
  // In production, also allow Vercel preview and production domains
  if (process.env.NODE_ENV === 'production') {
    const vercelUrl = process.env.VERCEL_URL;
    const vercelProjectUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    
    if (vercelUrl) defaultOrigins.push(`https://${vercelUrl}`);
    if (vercelProjectUrl) defaultOrigins.push(`https://${vercelProjectUrl}`);
    
    // Allow common Vercel domain patterns
    defaultOrigins.push(/^https:\/\/.*\.vercel\.app$/);
  }
  
  return [...new Set([...envOrigins, ...defaultOrigins])];
};

const allowedOrigins = getAllowedOrigins();

// Enhanced origin checking for regex patterns
const isOriginAllowed = (origin) => {
  if (!origin) return false;
  
  return allowedOrigins.some(allowedOrigin => {
    if (typeof allowedOrigin === 'string') {
      return allowedOrigin === origin;
    }
    if (allowedOrigin instanceof RegExp) {
      return allowedOrigin.test(origin);
    }
    return false;
  });
};

const checkRateLimit = (clientIP) => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  const requests = rateLimitMap.get(clientIP) ?? [];
  const recentRequests = requests.filter(timestamp => timestamp > windowStart);
  
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitMap.set(clientIP, recentRequests);
  return true;
};

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const clientIP = request.ip ?? request.headers.get('x-forwarded-for') ?? 'unknown';
  const origin = request.headers.get('origin');
  
  
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 });
    
    if (isOriginAllowed(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    response.headers.set('Access-Control-Max-Age', '86400');
    
    return response;
  }
  
  const response = NextResponse.next();
  
  if (isOriginAllowed(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  // Enhanced security headers for production
  const getCSP = () => {
    const baseCSP = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline'", 
      "img-src 'self' data: https:",
      "font-src 'self' https:",
      "connect-src 'self' wss: https: https://accounts.google.com https://securetoken.googleapis.com",
      "frame-src 'self' https://accounts.google.com https://apis.google.com https://*.firebaseapp.com"
    ];
    
    // Add Vercel domains in production
    if (process.env.NODE_ENV === 'production') {
      const vercelDomains = "https://*.vercel.app";
      baseCSP[1] += ` ${vercelDomains}`; // script-src
      baseCSP[4] += ` ${vercelDomains}`; // connect-src
    }
    
    return baseCSP.join('; ') + ';';
  };

  const securityHeaders = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Content-Security-Policy': getCSP(),
    ...(process.env.NODE_ENV === 'production' && {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    })
  };
  
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  if (!checkRateLimit(clientIP)) {
//     // console.warn('Rate limit exceeded for IP:', clientIP);
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: 60 },
      { 
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': (Math.ceil(Date.now() / 1000) + 60).toString()
        }
      }
    );
  }
  
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
}; 