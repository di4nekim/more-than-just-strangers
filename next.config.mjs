/** @type {import('next').NextConfig} */
const nextConfig = {
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
        })
      );
    }

    return config;
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
