/**
 * Widget preview page — shows the chat widget in an iframe-like container.
 * Used for development and testing.
 */
import ChatWidget from '@/components/ChatWidget';

export default function WidgetPreviewPage() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-xl font-semibold text-gray-500">Widget Preview</h1>
        <p className="text-sm text-gray-400 mt-1">
          This is what the embedded widget looks like
        </p>
      </div>
      <ChatWidget
        config={{
          publicToken: process.env['NEXT_PUBLIC_PUBLIC_CHAT_TOKEN'] ?? 'preview-public-token',
          backendUrl: process.env['NEXT_PUBLIC_BACKEND_URL'] ?? 'http://localhost:3001',
          botName: 'GCFIS Assistant',
          primaryColor: '#6366f1',
          welcomeMessage: 'Hi! How can I help you today?',
          placeholder: 'Type a message…',
        }}
      />
    </div>
  );
}
