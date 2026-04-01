import { redirect } from 'next/navigation';

export default function LegacySkillsSettingsRoute() {
  redirect('/dashboard/skills');
}
