import { redirect } from 'next/navigation';

// Default tab is Profile
export default function SettingsIndexPage() {
  redirect('/dashboard/settings/profile');
}
