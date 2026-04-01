import { notFound } from 'next/navigation';
import PublicChat from '@/components/PublicChat';

/**
 * Public chat page — `pnpbrain.com/<businessSlug>`
 *
 * Server component:  fetches the business config from the backend, then
 * hands it off to the <PublicChat> client component for the interactive chat.
 */

interface BusinessConfig {
  name:           string;
  slug:           string;
  botName:        string;
  welcomeMessage: string;
  primaryColor:   string;
  widgetPosition: string;
  widgetTheme:    string;
  showAvatar:     boolean;
  publicChatToken: string;
}

async function fetchConfig(slug: string): Promise<BusinessConfig | null> {
  const base = process.env['NEXT_PUBLIC_BACKEND_URL'] ?? process.env['BACKEND_URL'] ?? '';
  try {
    const res = await fetch(`${base}/api/public/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 }, // ISR — refresh cached config every 60s
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: BusinessConfig };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const config = await fetchConfig(businessSlug);
  return {
    title: config ? `Chat with ${config.name}` : 'Chat',
    description: config ? `Ask ${config.botName} anything about ${config.name}.` : undefined,
  };
}

export default async function ChatPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const config = await fetchConfig(businessSlug);

  if (!config) notFound();

  return <PublicChat config={config} />;
}
