/**
 * Shared helpers for serving the embeddable widget via jsDelivr.
 */

export const PNPBRAIN_CDN_PROVIDER = 'jsdelivr';
export const PNPBRAIN_GITHUB_OWNER = 'codewithnick';
export const PNPBRAIN_GITHUB_REPO = 'pnpbrain';
export const PNPBRAIN_WIDGET_BUNDLE_PATH = 'apps/widget/dist/pnpbrain-widget.js';

export interface PnpbrainWidgetCdnUrls {
  provider: typeof PNPBRAIN_CDN_PROVIDER;
  repo: string;
  version: string;
  tag: string;
  latestUrl: string;
  versionedUrl: string;
  purgeUrl: string;
}

function readPublicEnv(key: string): string | undefined {
  const maybeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  const value = maybeProcess?.env?.[key];
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizePnpbrainWidgetVersion(version?: string | null): string {
  const resolved = version?.trim() || readPublicEnv('NEXT_PUBLIC_PNPBRAIN_WIDGET_VERSION');

  if (!resolved || resolved === 'latest') {
    return 'main';
  }

  return resolved.replace(/^v/, '');
}

export function getPnpbrainWidgetReleaseTag(version?: string | null): string {
  const normalizedVersion = normalizePnpbrainWidgetVersion(version);
  return normalizedVersion === 'main' ? 'main' : `widget-v${normalizedVersion}`;
}

function buildJsDelivrGitHubUrl(ref: string, assetPath = PNPBRAIN_WIDGET_BUNDLE_PATH): string {
  return `https://cdn.jsdelivr.net/gh/${PNPBRAIN_GITHUB_OWNER}/${PNPBRAIN_GITHUB_REPO}@${ref}/${assetPath}`;
}

export function getPnpbrainWidgetCdnUrls(version?: string | null): PnpbrainWidgetCdnUrls {
  const normalizedVersion = normalizePnpbrainWidgetVersion(version);
  const tag = getPnpbrainWidgetReleaseTag(normalizedVersion);
  const versionedUrl = buildJsDelivrGitHubUrl(tag);

  return {
    provider: PNPBRAIN_CDN_PROVIDER,
    repo: `${PNPBRAIN_GITHUB_OWNER}/${PNPBRAIN_GITHUB_REPO}`,
    version: normalizedVersion,
    tag,
    latestUrl: buildJsDelivrGitHubUrl('main'),
    versionedUrl,
    purgeUrl: versionedUrl.replace('https://cdn.jsdelivr.net/', 'https://purge.jsdelivr.net/'),
  };
}
