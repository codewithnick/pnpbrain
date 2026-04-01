import type { Metadata } from 'next';

/**
 * Minimal layout for public chat pages — no Navbar / Footer.
 * Each business gets a full-screen chat experience.
 */
export const metadata: Metadata = {
  title: 'Chat',
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
