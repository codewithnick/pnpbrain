'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard/settings/profile', label: '🏢 Profile'      },
  { href: '/dashboard/settings/llm',     label: '🤖 Language Model' },
  { href: '/dashboard/settings/theme',   label: '🎨 Theme'         },
  { href: '/dashboard/settings/billing', label: '💳 Billing'       },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-1">Settings</h1>
      <p className="text-gray-500 dark:text-slate-400 mb-8 text-sm">Manage your business configuration, LLM, widget appearance, and billing.</p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 border-b border-gray-200 dark:border-slate-800">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg -mb-px border border-transparent transition-colors ${
                active
                  ? 'border-gray-200 border-b-white bg-white text-brand-600 dark:border-slate-700 dark:border-b-slate-950 dark:bg-slate-900 dark:text-brand-300'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-900'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
