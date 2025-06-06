import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import "./globals.css";
import { WebSocketProvider } from '../utils/WebSocketContext';

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata = {
  title: "More Than Just Strangers",
  description: "Designed and Developed by @di4nekim",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WebSocketProvider>
          {children}
        </WebSocketProvider>
      </body>
    </html>
  );
}
