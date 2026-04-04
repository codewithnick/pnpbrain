const RESERVED_AGENT_ROUTE_SLUGS = [
  'about',
  'about-us',
  'account',
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'blog',
  'careers',
  'chat',
  'company',
  'contact',
  'contact-us',
  'contactus',
  'dashboard',
  'demo',
  'docs',
  'documentation',
  'faq',
  'features',
  'help',
  'help-center',
  'helpcenter',
  'home',
  'how-it-works',
  'howitworks',
  'integrations',
  'knowledge',
  'legal',
  'login',
  'logout',
  'onboarding',
  'pricing',
  'privacy',
  'security',
  'sign-up',
  'signup',
  'status',
  'support',
  'team',
  'terms',
  'widget',
] as const;

const RESERVED_AGENT_ROUTE_SLUGS_SET = new Set<string>(RESERVED_AGENT_ROUTE_SLUGS);

export function toRouteSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

export function normalizeAgentLookupName(value: string): string {
  return value.trim().toLowerCase();
}

export function isReservedAgentIdentifier(value: string): boolean {
  const normalized = toRouteSlug(value);
  return normalized.length > 0 && RESERVED_AGENT_ROUTE_SLUGS_SET.has(normalized);
}

export function getAgentNamingError(params: {
  name?: string | null;
  slug?: string | null;
}): string | null {
  if (params.name && isReservedAgentIdentifier(params.name)) {
    return 'That agent name is reserved for common website pages or system routes. Choose something more specific.';
  }

  if (params.slug && isReservedAgentIdentifier(params.slug)) {
    return 'That agent slug is reserved for common website pages or system routes. Choose something more specific.';
  }

  return null;
}

export { RESERVED_AGENT_ROUTE_SLUGS };
