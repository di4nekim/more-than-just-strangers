/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production optimizations
  compiler: {
    compiler: {
      // Always remove console statements except errors and warnings
      removeConsole: { exclude: ['error', 'warn'] },
    },
  },
  
  // Production-specific optimizations
  ...(process.env.NODE_ENV === 'production' && {
    poweredByHeader: false,
    compress: true,
  }),
  
  // Allow JSON imports
  webpack: (config, { isServer, webpack }) => {
    config.module.rules.push({
      test: /\.json$/,
      type: 'json',
    });

    // Prevent server-only packages from being bundled for the browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        'aws-crt': false,
        // Use the process polyfill package
        process: 'process/browser',
        // Add buffer polyfill to prevent additional errors
        buffer: 'buffer',
      };

      // Add a comprehensive process polyfill
      config.plugins.push(
        new webpack.DefinePlugin({
          'process.env': JSON.stringify({
            NODE_ENV: process.env.NODE_ENV,
            NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            NEXT_PUBLIC_WEBSOCKET_API_URL: process.env.NEXT_PUBLIC_WEBSOCKET_API_URL,
          }),
          // Define the process object itself to ensure it's available
          'process': JSON.stringify({
            env: {
              NODE_ENV: process.env.NODE_ENV,
              NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
              NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
              NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
              NEXT_PUBLIC_WEBSOCKET_API_URL: process.env.NEXT_PUBLIC_WEBSOCKET_API_URL,
            },
            browser: true,
            version: '16.0.0',
          }),
        })
      );

      // Ensure process is globally available
      config.plugins.push(
        new webpack.ProvidePlugin({
          process: 'process/browser',
          Buffer: ['buffer', 'Buffer'],
        })
      );
      
      // Reduce module resolution issues that can cause I/O errors
      config.resolve.symlinks = false;
      config.resolve.cacheWithContext = false;
      
      // Enhanced chunk splitting for production
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            enforce: true,
          },
          // Separate Firebase chunk for better caching
          firebase: {
            test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/,
            name: 'firebase',
            chunks: 'all',
            priority: 10,
          },
        },
      };
      
      // Production-only optimizations
      if (process.env.NODE_ENV === 'production') {
        config.optimization.usedExports = true;
        config.optimization.sideEffects = false;
      }
    }

    return config;
  },
  
  // Enhanced optimizations
  experimental: {
    // Optimize package imports for better tree shaking
    optimizePackageImports: ['react', 'react-dom', 'firebase', '@firebase/auth', '@firebase/app'],
  },
  
  // Ensure server-only packages are not included in client bundle
  serverExternalPackages: [
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb',
    'ws',
    'wscat',
    'boto3'
  ]
};

export default nextConfig;
