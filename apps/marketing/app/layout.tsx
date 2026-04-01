import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GCFIS — General Customer Facing Intelligent System',
  description:
    'Add an AI-powered customer assistant to your website in minutes. RAG-powered, privacy-first, and fully customisable.',
  openGraph: {
    title: 'GCFIS',
    description: 'AI customer assistant — powered by your knowledge base',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
