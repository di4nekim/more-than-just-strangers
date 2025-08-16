import { NextResponse } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/auth/signin',
  '/api/auth/signup', 
  '/api/auth/verify',
  '/api/health',
  '/signin',
  '/signup',
  '/'
];

// Simple rate limiting storage (in production, use Redis)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

// CORS configuration
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : 
  ['http://localhost:3000'];

// Ensure ALLOWED_ORIGINS is always an array
const safeAllowedOrigins = Array.isArray(ALLOWED_ORIGINS) ? ALLOWED_ORIGINS : ['http://localhost:3000'];

// Simple rate limiting check
const checkRateLimit = (clientIP) => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimitMap.has(clientIP)) {
    rateLimitMap.set(clientIP, []);
  }
  
  const requests = rateLimitMap.get(clientIP);
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
  const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  const origin = request.headers.get('origin');
  
  // Block debug routes in production
  if (process.env.NODE_ENV === 'production' && pathname.startsWith('/api/debug')) {
    return NextResponse.json(
      { error: 'Debug endpoints not available in production' },
      { status: 404 }
    );
  }
  
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 });
    
    // Set CORS headers for preflight
    if (origin && typeof origin === 'string' && safeAllowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400');
    
    return response;
  }
  
  // Create response with security headers
  const response = NextResponse.next();
  
  // CORS headers for actual requests
  if (origin && typeof origin === 'string' && safeAllowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  // Comprehensive security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' wss: https: https://accounts.google.com https://securetoken.googleapis.com; frame-src 'self' https://accounts.google.com https://apis.google.com https://*.firebaseapp.com;");
  
  // Rate limiting check
  if (!checkRateLimit(clientIP)) {
    console.warn('Rate limit exceeded for IP:', clientIP);
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: 60 },
      { 
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(Date.now() / 1000 + 60).toString()
        }
      }
    );
  }
  
  // Note: JWT validation is now handled in individual API routes
  // This middleware focuses on CORS, security headers, and rate limiting
  
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
}; 