import type { Metadata } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import './globals.css';
import AuthSessionSync from '@/components/AuthSessionSync';
import ThemeRegistry from '@/components/ThemeRegistry';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'GCFIS Admin',
  description: 'GCFIS business owner dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${manrope.variable} bg-gray-50 text-gray-900 antialiased dark:bg-slate-950 dark:text-slate-100`}>
        <AuthSessionSync />
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
