import { redirect } from 'next/navigation';

/**
 * Root page — redirects to /dashboard.
 * Auth is handled by middleware; unauthenticated users land on /login.
 */
export default function RootPage() {
  redirect('/dashboard');
}
