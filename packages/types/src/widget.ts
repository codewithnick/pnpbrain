/**
 * Widget configuration and embed types.
 */

export interface WidgetConfig {
  /** Injected by the business owner's embed script */
  businessId: string;
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
