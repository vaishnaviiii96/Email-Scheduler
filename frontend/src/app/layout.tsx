import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ON8 — Email Job Scheduler',
  description: 'Schedule and manage bulk email campaigns with rate limiting, persistence, and real-time tracking.',
  keywords: ['email scheduler', 'bulk email', 'email automation'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans bg-gray-50 text-gray-800 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
