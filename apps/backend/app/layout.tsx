/**
 * apps/backend root layout — minimal, no UI.
 * The backend is API-routes only; this layout exists only because Next.js requires it.
 */
export const metadata = {
  title: 'GCFIS Backend',
  description: 'GCFIS Dedicated Backend API',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
