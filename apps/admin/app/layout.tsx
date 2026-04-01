import type { Metadata } from 'next';
import './globals.css';
import AuthSessionSync from '@/components/AuthSessionSync';

export const metadata: Metadata = {
  title: 'GCFIS Admin',
  description: 'GCFIS business owner dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AuthSessionSync />
        {children}
      </body>
    </html>
  );
}
