/**
 * Widget configuration and embed types.
 */

export interface WidgetConfig {
  /** Backend-issued public chat token for hosted/public traffic */
  publicToken: string;
  /** Agent identity this widget session is bound to */
  agentId?: string;
  /** Backend API base URL */
  backendUrl: string;
  /** Display name shown in the chat header */
  botName?: string;
  /** Accent colour (CSS hex) */
  primaryColor?: string;
  /** Placeholder text in the input field */
  placeholder?: string;
  /** Initial greeting message */
  welcomeMessage?: string;
  /** Assistant avatar display mode */
  assistantAvatarMode?: 'initial' | 'emoji' | 'image';
  /** Assistant avatar text when mode is initial or emoji */
  assistantAvatarText?: string;
  /** Assistant avatar image URL when mode is image */
  assistantAvatarImageUrl?: string;
  /** Whether assistant avatar is shown in header and assistant messages */
  showAssistantAvatar?: boolean;
  /** Whether user avatar is shown for user messages */
  showUserAvatar?: boolean;
  /** User avatar text shown when enabled */
  userAvatarText?: string;
  /** Chat launcher and panel position */
  position?: 'bottom-right' | 'bottom-left';
  /** Whether the widget starts expanded on first render */
  defaultOpen?: boolean;
  /** Header subtitle shown under bot name */
  headerSubtitle?: string;
  /** Panel background colour */
  chatBackgroundColor?: string;
  /** User message bubble colour */
  userMessageColor?: string;
  /** Assistant message bubble colour */
  assistantMessageColor?: string;
  /** Panel corner radius in pixels */
  borderRadiusPx?: number;
  /** Toggle powered-by footer text */
  showPoweredBy?: boolean;
}

export type WidgetTheme = 'light' | 'dark' | 'auto';
