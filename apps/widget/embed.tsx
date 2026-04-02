/**
 * PNPBrain Widget Embed Script
 *
 * This file is built into a standalone UMD bundle (gcfis-widget.js) by
 * `pnpm build:embed`.  Business owners drop a single <script> tag on their site:
 *
 *   <script
 *     src="https://cdn.pnpbrain.com/widget/gcfis-widget.js"
 *     data-public-token="YOUR_PUBLIC_CHAT_TOKEN"
 *     data-backend-url="https://api.pnpbrain.com"
 *     data-bot-name="My Assistant"
 *     data-primary-color="#6366f1"
 *     data-assistant-avatar-mode="emoji"
 *     data-assistant-avatar-text="AI"
 *     data-show-user-avatar="true"
 *     data-position="bottom-left"
 *     data-header-subtitle="Support Team"
 *     data-welcome-message="Hi! How can I help?"
 *     data-placeholder="Type a message…"
 *     data-chat-background-color="#f9fafb"
 *     data-user-message-color="#6366f1"
 *     data-assistant-message-color="#ffffff"
 *     data-border-radius-px="16"
 *     data-show-powered-by="true"
 *   ></script>
 *
 * The script mounts a shadow-DOM React root so PNPBrain styles never conflict
 * with the host page's CSS.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import ChatWidget from './components/ChatWidget';
import type { WidgetConfig } from '@gcfis/types';

declare global {
  interface Window {
    PNPBRAIN_CONFIG?: Partial<WidgetConfig>;
    GCFIS_CONFIG?: Partial<WidgetConfig>;
  }
}

function buildConfigFromDataset(
  dataset: DOMStringMap,
  fallback: Partial<WidgetConfig>
): WidgetConfig {
  const parseBoolean = (value: string | undefined, fallbackValue: boolean): boolean => {
    if (value === undefined) return fallbackValue;
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
    if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
    return fallbackValue;
  };

  const parseNumber = (value: string | undefined, fallbackValue: number): number => {
    if (value === undefined) return fallbackValue;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  };

  const parsePosition = (
    value: string | undefined,
    fallbackValue: NonNullable<WidgetConfig['position']>
  ): NonNullable<WidgetConfig['position']> => {
    if (value === 'bottom-left' || value === 'bottom-right') return value;
    return fallbackValue;
  };

  const parseAvatarMode = (
    value: string | undefined,
    fallbackValue: NonNullable<WidgetConfig['assistantAvatarMode']>
  ): NonNullable<WidgetConfig['assistantAvatarMode']> => {
    if (value === 'initial' || value === 'emoji' || value === 'image') return value;
    return fallbackValue;
  };

  const publicToken = dataset['publicToken'] ?? fallback.publicToken;
  if (!publicToken) {
    throw new Error('[PNPBrain] data-public-token attribute is required. Widget not mounted.');
  }

  const assistantAvatarImageUrl =
    dataset['assistantAvatarImageUrl'] ?? fallback.assistantAvatarImageUrl;

  return {
    publicToken,
    ...((dataset['agentId'] ?? fallback.agentId)
      ? { agentId: dataset['agentId'] ?? fallback.agentId }
      : {}),
    backendUrl: dataset['backendUrl'] ?? fallback.backendUrl ?? 'https://api.pnpbrain.com',
    botName: dataset['botName'] ?? fallback.botName ?? 'Assistant',
    primaryColor: dataset['primaryColor'] ?? fallback.primaryColor ?? '#6366f1',
    welcomeMessage:
      dataset['welcomeMessage'] ?? fallback.welcomeMessage ?? 'Hi! How can I help you today?',
    placeholder: dataset['placeholder'] ?? fallback.placeholder ?? 'Type a message…',
    assistantAvatarMode: parseAvatarMode(
      dataset['assistantAvatarMode'],
      fallback.assistantAvatarMode ?? 'initial'
    ),
    assistantAvatarText:
      dataset['assistantAvatarText'] ?? fallback.assistantAvatarText ?? (dataset['botName'] ?? fallback.botName ?? 'Assistant').charAt(0),
    ...(assistantAvatarImageUrl ? { assistantAvatarImageUrl } : {}),
    showAssistantAvatar: parseBoolean(
      dataset['showAssistantAvatar'],
      fallback.showAssistantAvatar ?? true
    ),
    showUserAvatar: parseBoolean(dataset['showUserAvatar'], fallback.showUserAvatar ?? false),
    userAvatarText: dataset['userAvatarText'] ?? fallback.userAvatarText ?? 'You',
    position: parsePosition(dataset['position'], fallback.position ?? 'bottom-right'),
    headerSubtitle: dataset['headerSubtitle'] ?? fallback.headerSubtitle ?? 'Online',
    chatBackgroundColor: dataset['chatBackgroundColor'] ?? fallback.chatBackgroundColor ?? '#f9fafb',
    userMessageColor: dataset['userMessageColor'] ?? fallback.userMessageColor ?? '#6366f1',
    assistantMessageColor:
      dataset['assistantMessageColor'] ?? fallback.assistantMessageColor ?? '#ffffff',
    borderRadiusPx: parseNumber(dataset['borderRadiusPx'], fallback.borderRadiusPx ?? 16),
    showPoweredBy: parseBoolean(dataset['showPoweredBy'], fallback.showPoweredBy ?? true),
  };
}

(function gcfisEmbed() {
  const globalConfig = globalThis as typeof globalThis & {
    PNPBRAIN_CONFIG?: Partial<WidgetConfig>;
    GCFIS_CONFIG?: Partial<WidgetConfig>;
  };
  const fallbackConfig = globalConfig.PNPBRAIN_CONFIG ?? globalConfig.GCFIS_CONFIG ?? {};

  const mountNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-gcfis-mount="1"]'));
  if (mountNodes.length > 0) {
    for (const mountNode of mountNodes) {
      let config: WidgetConfig;
      try {
        config = buildConfigFromDataset(mountNode.dataset, fallbackConfig);
      } catch (error) {
        console.error(error instanceof Error ? error.message : '[PNPBrain] Invalid widget config. Widget not mounted.');
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
    console.error('[PNPBrain] Could not find embed script tag. Widget not mounted.');
    return;
  }

  let config: WidgetConfig;
  try {
    config = buildConfigFromDataset(scriptTag.dataset, fallbackConfig);
  } catch (error) {
    console.error(error instanceof Error ? error.message : '[PNPBrain] Invalid widget config. Widget not mounted.');
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
  styleEl.textContent = '/* PNPBrain styles injected at build time */';
  shadow.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(React.createElement(ChatWidget, { config }));
})();
