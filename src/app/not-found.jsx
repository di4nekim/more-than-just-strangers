import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-beige font-jetbrains-mono">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg border-2 border-teal p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-teal mb-4 uppercase">
            Page Not Found
          </h2>
          <p className="text-teal mb-8 text-lg">
            The page you're looking for doesn't exist.
          </p>
          <div className="space-y-4">
            <Link
              href="/"
              className="block w-full px-6 py-3 bg-teal text-beige font-semibold rounded-lg hover:bg-sky-blue hover:text-beige transition-colors uppercase tracking-wide text-center"
            >
              Go to home
            </Link>
            <Link
              href="/signin"
              className="block w-full px-6 py-3 bg-light-blue text-teal font-semibold rounded-lg border-2 border-teal hover:bg-teal hover:text-beige transition-colors uppercase tracking-wide text-center"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 