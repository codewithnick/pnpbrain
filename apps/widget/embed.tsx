/**
 * GCFIS Widget Embed Script
 *
 * This file is built into a standalone UMD bundle (gcfis-widget.js) by
 * `pnpm build:embed`.  Business owners drop a single <script> tag on their site:
 *
 *   <script
 *     src="https://cdn.gcfis.com/widget/gcfis-widget.js"
 *     data-public-token="YOUR_PUBLIC_CHAT_TOKEN"
 *     data-backend-url="https://api.gcfis.com"
 *     data-bot-name="My Assistant"
 *     data-primary-color="#6366f1"
 *     data-welcome-message="Hi! How can I help?"
 *   ></script>
 *
 * The script mounts a shadow-DOM React root so GCFIS styles never conflict
 * with the host page's CSS.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import ChatWidget from './components/ChatWidget';
import type { WidgetConfig } from '@gcfis/types';

declare global {
  interface Window {
    GCFIS_CONFIG?: Partial<WidgetConfig>;
  }
}

function buildConfigFromDataset(
  dataset: DOMStringMap,
  fallback: Partial<WidgetConfig>
): WidgetConfig {
  const publicToken = dataset['publicToken'] ?? fallback.publicToken;
  if (!publicToken) {
    throw new Error('[GCFIS] data-public-token attribute is required. Widget not mounted.');
  }

  return {
    publicToken,
    backendUrl: dataset['backendUrl'] ?? fallback.backendUrl ?? 'https://api.gcfis.com',
    botName: dataset['botName'] ?? fallback.botName ?? 'Assistant',
    primaryColor: dataset['primaryColor'] ?? fallback.primaryColor ?? '#6366f1',
    welcomeMessage:
      dataset['welcomeMessage'] ?? fallback.welcomeMessage ?? 'Hi! How can I help you today?',
    placeholder: dataset['placeholder'] ?? fallback.placeholder ?? 'Type a message…',
  };
}

(function gcfisEmbed() {
  const fallbackConfig = window.GCFIS_CONFIG ?? {};

  const mountNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-gcfis-mount="1"]'));
  if (mountNodes.length > 0) {
    for (const mountNode of mountNodes) {
      let config: WidgetConfig;
      try {
        config = buildConfigFromDataset(mountNode.dataset, fallbackConfig);
      } catch (error) {
        console.error(error instanceof Error ? error.message : '[GCFIS] Invalid widget config. Widget not mounted.');
        continue;
      }

      const root = createRoot(mountNode);
      root.render(React.createElement(ChatWidget, { config }));
    }
    return;
  }

  // Find the script tag that loaded this file
  const scriptTag =
    document.currentScript as HTMLScriptElement | null ??
    document.querySelector('script[data-public-token]');

  if (!scriptTag) {
    console.error('[GCFIS] Could not find embed script tag. Widget not mounted.');
    return;
  }

  let config: WidgetConfig;
  try {
    config = buildConfigFromDataset(scriptTag.dataset, fallbackConfig);
  } catch (error) {
    console.error(error instanceof Error ? error.message : '[GCFIS] Invalid widget config. Widget not mounted.');
    return;
  }

  // Create a host element + shadow DOM to isolate styles
  const host = document.createElement('div');
  host.id = 'gcfis-widget-host';
  document.body.appendChild(host);

  // Shadow DOM for style isolation
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject Tailwind CSS (built at embed build time)
  const styleEl = document.createElement('style');
  // Styles will be injected by the build script (esbuild + postcss plugin)
  styleEl.textContent = '/* GCFIS styles injected at build time */';
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(React.createElement(ChatWidget, { config }));
})();
