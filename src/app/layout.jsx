'use client';

import { Inter, JetBrains_Mono, Instrument_Sans } from 'next/font/google';
import './globals.css';
import { FirebaseAuthProvider } from './components/auth/FirebaseAuthProvider';
import { WebSocketProvider } from '../websocket/WebSocketContext';
import { useEffect } from 'react';

const inter = Inter({ subsets: ['latin'] });
const jetbrainsMono = JetBrains_Mono({ 
  subsets: ['latin'],
  variable: '--font-jetbrains-mono'
});
const instrumentSans = Instrument_Sans({ 
  subsets: ['latin'],
  variable: '--font-instrument-sans'
});

export default function RootLayout({ children }) {
  useEffect(() => {
    const handleUnhandledRejection = e => {
      console.warn('Unhandled promise rejection:', e.reason);
      e.preventDefault();
    };
    
    const handleError = e => {
      console.warn('Global error:', e.error);
    };
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <html lang="en" className={`${inter.className} ${jetbrainsMono.variable} ${instrumentSans.variable}`}>
      <head>
        <title>More Than Just Strangers</title>
        <meta name="description" content="Connect with strangers in meaningful conversations" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={inter.className}>
        <FirebaseAuthProvider>
          <WebSocketProvider>
            {children}
          </WebSocketProvider>
        </FirebaseAuthProvider>
      </body>
    </html>
  );
}