import ChatWidget from '../../widget/components/ChatWidget';

const demoPublicToken =
  process.env['NEXT_PUBLIC_MARKETING_DEMO_PUBLIC_TOKEN']?.trim()
  || 'pnpbrain_live_lOhYYtx6rBoBatUlw2aDVWo_Q8zc6gyp';
const demoBackendUrl =
  process.env['NEXT_PUBLIC_MARKETING_DEMO_BACKEND_URL']?.trim()
  || 'https://api.pnpbrain.com';

export default function LiveDemo() {
  return (
    <ChatWidget
      config={{
        publicToken: demoPublicToken,
        backendUrl: demoBackendUrl,
        botName: 'PNPBrain Demo',
        primaryColor: '#0f766e',
        welcomeMessage: "Hi! I'm the live PNPBrain demo. Ask me anything about PNPBrain.",
        placeholder: 'Ask about features, pricing, or setup…',
        assistantAvatarMode: 'initial',
        assistantAvatarText: 'P',
        showAssistantAvatar: true,
        showUserAvatar: true,
        userAvatarText: 'You',
        position: 'bottom-right',
        defaultOpen: true,
        headerSubtitle: 'Live demo',
        chatBackgroundColor: '#f8fafc',
        assistantMessageColor: '#ffffff',
        borderRadiusPx: 18,
        showPoweredBy: true,
      }}
    />
  );
}
