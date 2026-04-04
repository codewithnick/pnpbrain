"use client";

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Stack,
  Typography,
} from '@mui/material';

type Example = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  chips: string[];
  snippets: Record<string, string>;
};

const examples: Example[] = [
  {
    id: 'wordpress-plugin',
    title: 'WordPress Plugin Embed',
    subtitle: 'Native WordPress path (plugin + shortcode)',
    description:
      'Matches the WordPress plugin in this repo: configure settings once, then use shortcode or auto-inject.',
    chips: ['[pnpbrain_widget]', 'Settings -> PNpbrain Widget', 'auto_inject', 'PNPBRAIN_CONFIG'],
    snippets: {
      shortcode: `[pnpbrain_widget
  public_token="PUBLIC_CHAT_TOKEN"
  backend_url="https://api.pnpbrain.com"
  bot_name="Support"
  primary_color="#6366f1"
  welcome_message="Hi! How can I help you today?"
]`,
      php: `add_filter('pnpbrain_widget_config', function(array $config): array {
    $config['headerSubtitle'] = 'Online';
    $config['position'] = 'bottom-right';
    $config['showPoweredBy'] = true;
    return $config;
});`,
    },
  },
  {
    id: 'wix-embed',
    title: 'Wix Custom Code Embed',
    subtitle: 'Wix dashboard -> Settings -> Custom Code',
    description:
      'Use the same script-tag contract in Wix custom code. Apply to all pages and load in Body - end for best UX.',
    chips: ['Wix Custom Code', 'All pages', 'Body - end', 'data-public-token'],
    snippets: {
      html: `<script
  src="https://cdn.pnpbrain.com/widget/pnpbrain-widget.js"
  data-public-token="PUBLIC_CHAT_TOKEN"
  data-backend-url="https://api.pnpbrain.com"
  data-bot-name="Support"
  data-primary-color="#6366f1"
  data-position="bottom-right"
  data-show-powered-by="true"
></script>`,
    },
  },
  {
    id: 'widget',
    title: 'Website Widget Embed',
    subtitle: 'Drop-in script (real embed contract)',
    description:
      'Uses the same data attributes parsed by the widget embed loader in this repository.',
    chips: ['data-public-token', 'data-backend-url', 'data-bot-name', 'data-show-powered-by'],
    snippets: {
      html: `<script
  src="https://cdn.pnpbrain.com/widget/pnpbrain-widget.js"
  data-public-token="PUBLIC_CHAT_TOKEN"
  data-backend-url="https://api.pnpbrain.com"
  data-bot-name="Support"
  data-primary-color="#6366f1"
  data-header-subtitle="Online"
  data-show-powered-by="true"
></script>`,
    },
  },
  {
    id: 'browser-sdk',
    title: 'Browser SDK Client',
    subtitle: 'React, Vue, Svelte, or plain JS',
    description:
      'Uses @pnpbrain/web-sdk and the exact event model used by our public chat and widget clients.',
    chips: ['createChatClient', 'onTransport', 'onEvent', 'threadId'],
    snippets: {
      typescript: `import { createChatClient } from '@pnpbrain/web-sdk';

const chatClient = createChatClient({
  backendUrl: 'https://api.pnpbrain.com',
  publicToken: 'PUBLIC_CHAT_TOKEN',
  agentId: 'agent-uuid',
});

let threadId: string | undefined;

const result = await chatClient.sendMessage(
  { message: 'What can you help me with?', threadId },
  {
    onTransport: (nextTransport) => {
      console.log('connected via', nextTransport);
    },
    onEvent: (event) => {
      if (event.type === 'token') {
        // append event.token to your assistant bubble
      }
      if (event.type === 'done') {
        threadId = event.threadId;
      }
    },
  }
);

threadId = result.threadId ?? threadId;`,
      javascript: `import { createChatClient } from '@pnpbrain/web-sdk';

const chatClient = createChatClient({
  backendUrl: 'https://api.pnpbrain.com',
  publicToken: 'PUBLIC_CHAT_TOKEN',
});

let threadId;

const result = await chatClient.sendMessage(
  { message: 'What can you help me with?', threadId },
  {
    onTransport: (transport) => console.log('transport:', transport),
    onEvent: (event) => {
      if (event.type === 'done') threadId = event.threadId;
    },
  }
);

threadId = result.threadId || threadId;`,
    },
  },
  {
    id: 'backend-http',
    title: 'Backend HTTP API',
    subtitle: 'Server-side calls to POST /api/agent/chat',
    description:
      'Use x-api-key in trusted server environments. Same endpoint powers SDK SSE fallback.',
    chips: ['POST /api/agent/chat', 'x-api-key', 'JSON body'],
    snippets: {
      bash: String.raw`curl -X POST "https://api.pnpbrain.com/api/agent/chat" \
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{"message":"Hello from our app"}'`,
      typescript: `await fetch('https://api.pnpbrain.com/api/agent/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env['API_KEY'] ?? '',
  },
  body: JSON.stringify({
    message: 'Hello from our app',
    threadId,
  }),
});`,
      python: `import os
import requests

response = requests.post(
    'https://api.pnpbrain.com/api/agent/chat',
    headers={
        'Content-Type': 'application/json',
        'x-api-key': os.environ['API_KEY'],
    },
    json={
        'message': 'Hello from our app',
        'threadId': thread_id,
    },
)`,
      go: `payload := strings.NewReader('{"message":"Hello from our app","threadId":""}')
req, _ := http.NewRequest(http.MethodPost, "https://api.pnpbrain.com/api/agent/chat", payload)
req.Header.Set("Content-Type", "application/json")
req.Header.Set("x-api-key", os.Getenv("API_KEY"))
client := &http.Client{}
res, err := client.Do(req)
_ = res
_ = err`,
      java: `HttpClient client = HttpClient.newHttpClient();

    String payload = """
    {"message":"Hello from our app","threadId":""}
    """;

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("https://api.pnpbrain.com/api/agent/chat"))
        .header("Content-Type", "application/json")
        .header("x-api-key", System.getenv("API_KEY"))
        .POST(HttpRequest.BodyPublishers.ofString(payload))
        .build();

    HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());`,
      csharp: `using System.Net.Http;
    using System.Net.Http.Json;

    var client = new HttpClient();
    var request = new HttpRequestMessage(HttpMethod.Post, "https://api.pnpbrain.com/api/agent/chat");
    request.Headers.Add("x-api-key", Environment.GetEnvironmentVariable("API_KEY"));
    request.Content = JsonContent.Create(new {
        message = "Hello from our app",
        threadId = ""
    });

    var response = await client.SendAsync(request);`,
      php: `$payload = json_encode([
      'message' => 'Hello from our app',
      'threadId' => ''
    ]);

    $ch = curl_init('https://api.pnpbrain.com/api/agent/chat');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
      'Content-Type: application/json',
      'x-api-key: ' . getenv('API_KEY')
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    curl_close($ch);`,
      ruby: `require 'net/http'
    require 'json'

    uri = URI('https://api.pnpbrain.com/api/agent/chat')
    request = Net::HTTP::Post.new(uri)
    request['Content-Type'] = 'application/json'
    request['x-api-key'] = ENV['API_KEY']
    request.body = { message: 'Hello from our app', threadId: '' }.to_json

    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
      http.request(request)
    end`,
      kotlin: `val client = java.net.http.HttpClient.newHttpClient()
    val payload = """{"message":"Hello from our app","threadId":""}"""

    val request = java.net.http.HttpRequest.newBuilder()
        .uri(java.net.URI.create("https://api.pnpbrain.com/api/agent/chat"))
        .header("Content-Type", "application/json")
        .header("x-api-key", System.getenv("API_KEY"))
        .POST(java.net.http.HttpRequest.BodyPublishers.ofString(payload))
        .build()

    val response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString())`,
    },
  },
  {
    id: 'websocket',
    title: 'Direct WebSocket Transport',
    subtitle: 'Low-latency chat streaming',
    description:
      'Connect to /ws/agent and send a payload with type: chat plus publicToken.',
    chips: ['WS /ws/agent', 'type: chat', 'publicToken', 'threadId'],
    snippets: {
      javascript: `const ws = new WebSocket('wss://api.pnpbrain.com/ws/agent');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'chat',
    message: 'What can you help me with?',
    publicToken: 'PUBLIC_CHAT_TOKEN',
    agentId: 'agent-uuid',
    threadId,
  }));
};

ws.onmessage = (evt) => {
  const event = JSON.parse(evt.data);
  if (event.type === 'done') {
    threadId = event.threadId;
  }
};`,
    },
  },
  {
    id: 'channel-bridge',
    title: 'Channel Bridge Pattern',
    subtitle: 'Telegram / WhatsApp / Slack / Discord / Teams',
    description:
      'All channels should map inbound text to the same backend chat contract and persist threadId per conversation.',
    chips: ['Webhook in', 'POST /api/agent/chat', 'threadId mapping', 'Reply out'],
    snippets: {
      typescript: `app.post('/channel/webhook', async (req, res) => {
  const channelConversationId = getConversationId(req.body);
  const message = getIncomingText(req.body);

  const threadId = await threadStore.get(channelConversationId);

  const response = await fetch('https://api.pnpbrain.com/api/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env['API_KEY'] ?? '',
    },
    body: JSON.stringify({ message, threadId }),
  });

  // Parse your stream/final reply and send it back to the channel provider
  const finalReply = await extractAssistantText(response);

  const nextThreadId = await extractThreadId(response);
  if (nextThreadId) {
    await threadStore.set(channelConversationId, nextThreadId);
  }

  await sendChannelReply(req.body, finalReply);
  res.sendStatus(200);
});`,
    },
  },
];

function CodeBlock({ code }: Readonly<{ code: string }>) {
  return (
    <Box
      component="pre"
      sx={{
        mt: 2,
        p: 2,
        borderRadius: 2,
        bgcolor: 'rgba(15, 23, 42, 0.96)',
        color: '#e2e8f0',
        fontSize: '0.82rem',
        lineHeight: 1.6,
        overflowX: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily:
          'ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace',
      }}
    >
      {code}
    </Box>
  );
}

export default function Integrations() {
  const [selectedExampleId, setSelectedExampleId] = useState<string>(examples[0]?.id ?? 'widget');
  const selectedExample =
    examples.find((item) => item.id === selectedExampleId) ?? examples[0];

  const languages = useMemo(
    () => Object.keys(selectedExample?.snippets ?? {}),
    [selectedExample]
  );
  const [selectedLanguage, setSelectedLanguage] = useState<string>(languages[0] ?? '');
  const [copyState, setCopyState] = useState<string>('');

  const effectiveLanguage = languages.includes(selectedLanguage)
    ? selectedLanguage
    : (languages[0] ?? '');

  const activeSnippet = selectedExample?.snippets[effectiveLanguage] ?? '';

  const handleSelectExample = (id: string) => {
    setSelectedExampleId(id);
    const next = examples.find((item) => item.id === id);
    const firstLanguage = Object.keys(next?.snippets ?? {})[0] ?? '';
    setSelectedLanguage(firstLanguage);
    setCopyState('');
  };

  const handleCopy = async () => {
    if (!activeSnippet) return;
    try {
      await navigator.clipboard.writeText(activeSnippet);
      setCopyState('Copied');
      globalThis.setTimeout(() => setCopyState(''), 1200);
    } catch {
      setCopyState('Copy failed');
      globalThis.setTimeout(() => setCopyState(''), 1200);
    }
  };

  return (
    <Box id="integrations" component="section" sx={{ py: { xs: 10, md: 13 }, px: 2, bgcolor: 'rgba(15, 23, 42, 0.03)' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 7 }}>
          <Chip label="Interactive examples" sx={{ mb: 2, bgcolor: 'background.paper' }} />
          <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.5rem' } }}>
            Click through real integration patterns
          </Typography>
          <Typography sx={{ mt: 1.5, color: 'text.secondary', maxWidth: 820, mx: 'auto' }}>
            Pick an integration path, switch languages, and copy snippets. Every example below follows the actual endpoints and payload contracts in this codebase.
          </Typography>
        </Box>

        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ borderRadius: 3, bgcolor: 'background.paper' }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.2 }}>
                  Integration paths
                </Typography>
                <Stack spacing={1}>
                  {examples.map((item) => (
                    <Button
                      key={item.id}
                      onClick={() => handleSelectExample(item.id)}
                      variant={item.id === selectedExample?.id ? 'contained' : 'outlined'}
                      sx={{ justifyContent: 'flex-start', textTransform: 'none', borderRadius: 2 }}
                    >
                      {item.title}
                    </Button>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={{ borderRadius: 3, bgcolor: 'background.paper', height: '100%' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="overline" sx={{ letterSpacing: '0.12em', color: 'primary.main' }}>
                  {selectedExample?.subtitle}
                </Typography>
                <Typography variant="h5" sx={{ mt: 0.4, fontSize: '1.35rem' }}>
                  {selectedExample?.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.1, lineHeight: 1.75 }}>
                  {selectedExample?.description}
                </Typography>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                  {selectedExample?.chips.map((chip) => (
                    <Chip key={chip} label={chip} size="small" variant="outlined" />
                  ))}
                </Stack>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                  {languages.map((language) => (
                    <Button
                      key={language}
                      size="small"
                      variant={language === effectiveLanguage ? 'contained' : 'outlined'}
                      onClick={() => setSelectedLanguage(language)}
                      sx={{ textTransform: 'none', borderRadius: 2 }}
                    >
                      {language}
                    </Button>
                  ))}
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleCopy}
                    sx={{ textTransform: 'none', borderRadius: 2, ml: 'auto' }}
                  >
                    {copyState || 'Copy snippet'}
                  </Button>
                </Stack>

                <CodeBlock code={activeSnippet} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ mt: 7 }}>
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%', borderRadius: 3, bgcolor: 'background.paper' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" sx={{ fontSize: '1.02rem', mb: 0.9 }}>
                    1) Choose transport
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    Web SDK tries WebSocket first (`/ws/agent`) and falls back to SSE (`POST /api/agent/chat`) automatically.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%', borderRadius: 3, bgcolor: 'background.paper' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" sx={{ fontSize: '1.02rem', mb: 0.9 }}>
                    2) Persist context
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    Keep one `threadId` per end-user or per channel conversation ID so memory and context continue correctly.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%', borderRadius: 3, bgcolor: 'background.paper' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" sx={{ fontSize: '1.02rem', mb: 0.9 }}>
                    3) Keep secrets safe
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    Use `publicToken` in browser/public surfaces. Keep `x-api-key` strictly on server-side integrations and channel bridges.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
}