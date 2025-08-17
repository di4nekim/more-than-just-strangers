'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-beige font-jetbrains-mono">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg border-2 border-teal p-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-teal mb-4 uppercase">
                Application Error
              </h2>
              <p className="text-teal mb-8 text-lg">
                A critical error occurred. Please refresh the page or try again later.
              </p>
              <div className="space-y-4">
                <button
                  onClick={reset}
                  className="w-full px-6 py-3 bg-teal text-beige font-semibold rounded-lg hover:bg-sky-blue hover:text-beige transition-colors uppercase tracking-wide"
                >
                  Try again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-6 py-3 bg-light-blue text-teal font-semibold rounded-lg border-2 border-teal hover:bg-teal hover:text-beige transition-colors uppercase tracking-wide"
                >
                  Refresh page
                </button>
              </div>
              {process.env.NODE_ENV === 'development' && (
                <details className="mt-8 text-left">
                  <summary className="cursor-pointer text-sm text-teal font-medium uppercase">
                    Error details (development only)
                  </summary>
                  <pre className="mt-3 text-xs text-red-600 bg-red-50 p-3 rounded border border-red-200 overflow-auto">
                    {error.message}
                    {error.stack && `\n\n${error.stack}`}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
} 