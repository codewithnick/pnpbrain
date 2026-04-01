/**
 * Widget configuration and embed types.
 */

export interface WidgetConfig {
  /** Backend-issued public chat token for hosted/public traffic */
  publicToken: string;
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
}

export type WidgetTheme = 'light' | 'dark' | 'auto';
