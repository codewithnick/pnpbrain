'use client';

import NextLink from 'next/link';
import { useState } from 'react';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';

const scriptSnippet = `<script
  src="https://cdn.pnpbrain.com/widget/pnpbrain-widget.js"
  data-public-token="YOUR_PUBLIC_CHAT_TOKEN"
  data-backend-url="https://api.your-domain.com"
  data-bot-name="Support Assistant"
  data-primary-color="#2563eb"
  data-welcome-message="Hi! How can I help?"
  data-placeholder="Type a message…"
  data-assistant-avatar-mode="initial"
  data-assistant-avatar-text="AI"
  data-show-assistant-avatar="true"
  data-show-user-avatar="true"
  data-position="bottom-right"
  data-header-subtitle="Online"
  data-chat-background-color="#f9fafb"
  data-user-message-color="#2563eb"
  data-assistant-message-color="#ffffff"
  data-border-radius-px="16"
  data-show-powered-by="true"
></script>`;

const mountNodeSnippet = `<div
  data-pnpbrain-mount="1"
  data-public-token="YOUR_PUBLIC_CHAT_TOKEN"
  data-backend-url="https://api.your-domain.com"
  data-bot-name="Support Assistant"
  data-primary-color="#2563eb"
  data-welcome-message="Hi! How can I help?"
  data-placeholder="Type a message…"
  data-show-user-avatar="true"
  data-position="bottom-right"
></div>
<script src="https://cdn.pnpbrain.com/widget/pnpbrain-widget.js"></script>`;

const wordpressSnippet = `1. Upload and activate the PNPBRAIN WordPress plugin.
2. Go to Settings -> PNPBRAIN Widget.
3. Add your Backend URL and Public Token.
4. Enable auto-inject or place [pnpbrain_widget] on any page.`;

const embeddableOptions = [
  'data-placeholder',
  'data-assistant-avatar-mode',
  'data-assistant-avatar-text',
  'data-assistant-avatar-image-url',
  'data-show-assistant-avatar',
  'data-show-user-avatar',
  'data-user-avatar-text',
  'data-position',
  'data-header-subtitle',
  'data-chat-background-color',
  'data-user-message-color',
  'data-assistant-message-color',
  'data-border-radius-px',
  'data-show-powered-by',
];

const previewMessages = [
  { role: 'assistant', content: 'Hi! I can help with pricing, setup, and support questions.', bg: '#ffffff', color: '#0f172a' },
  { role: 'user', content: 'How do I connect this widget to my site?', bg: '#2563eb', color: '#ffffff' },
];

function CodeBlock({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Tooltip title="Copy snippet">
          <Button
            onClick={onCopy}
            size="small"
            variant="outlined"
            startIcon={<ContentCopyRoundedIcon fontSize="small" />}
            sx={{ borderRadius: 99 }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Tooltip>
      </Stack>
      <Paper
        component="pre"
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: 'rgba(2, 6, 23, 0.92)',
          overflowX: 'auto',
          border: '1px solid rgba(148, 163, 184, 0.2)',
        }}
      >
        <Typography
          component="code"
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
            fontSize: 13,
            whiteSpace: 'pre',
            color: '#e2e8f0',
          }}
        >
          {code}
        </Typography>
      </Paper>
    </Box>
  );
}

export default function EmbedPage() {
  const [copiedSnippet, setCopiedSnippet] = useState<'script' | 'mount' | 'wordpress' | null>(null);

  async function copySnippet(text: string, snippet: 'script' | 'mount' | 'wordpress') {
    await navigator.clipboard.writeText(text);
    setCopiedSnippet(snippet);
    window.setTimeout(() => setCopiedSnippet(null), 1800);
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Embed Agent
          </Typography>
          <Typography color="text.secondary">
            Plug your agent into any website in minutes with a single script tag.
          </Typography>
        </Box>
        <Chip color="primary" variant="outlined" label="Plug and Play" />
      </Stack>

      <Paper
        sx={{
          p: 3,
          borderRadius: 3,
          mb: 2.5,
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(15, 23, 42, 0.92))',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <FlashOnRoundedIcon color="primary" fontSize="small" />
          <Typography variant="h6">Quick setup checklist</Typography>
        </Stack>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary">1. Select the active agent in the left sidebar.</Typography>
          <Typography variant="body2" color="text.secondary">2. Copy the agent API key from Settings -&gt; Profile.</Typography>
          <Typography variant="body2" color="text.secondary">3. Paste the script snippet into your site layout before closing body tag.</Typography>
          <Typography variant="body2" color="text.secondary">4. Save Theme settings to control widget colors and position.</Typography>
        </Stack>
      </Paper>

      <Stack spacing={2.5} sx={{ mb: 2.5 }}>
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <CodeRoundedIcon color="primary" fontSize="small" />
            <Typography variant="h6">Default website embed</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Add this script on any site where you want the floating chat launcher to appear.
          </Typography>
          <CodeBlock
            code={scriptSnippet}
            onCopy={() => void copySnippet(scriptSnippet, 'script')}
            copied={copiedSnippet === 'script'}
          />
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <CodeRoundedIcon color="primary" fontSize="small" />
            <Typography variant="h6">Mount into a specific container</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Use this when you want the widget rendered inside a specific page section instead of floating mode.
          </Typography>
          <CodeBlock
            code={mountNodeSnippet}
            onCopy={() => void copySnippet(mountNodeSnippet, 'mount')}
            copied={copiedSnippet === 'mount'}
          />
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ExtensionRoundedIcon color="primary" fontSize="small" />
            <Typography variant="h6">WordPress option</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            If your site is on WordPress, use the plugin for no-code setup.
          </Typography>
          <CodeBlock
            code={wordpressSnippet}
            onCopy={() => void copySnippet(wordpressSnippet, 'wordpress')}
            copied={copiedSnippet === 'wordpress'}
          />
        </Paper>
      </Stack>

      <Paper sx={{ p: 3, borderRadius: 3, mb: 2.5 }}>
        <Typography variant="h6">Additional embeddable options</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          These attributes work with both the direct script embed and the mount-node embed.
        </Typography>
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mt: 2 }}>
          {embeddableOptions.map((option) => (
            <Chip key={option} label={option} variant="outlined" />
          ))}
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3, mb: 2.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <CodeRoundedIcon color="primary" fontSize="small" />
          <Typography variant="h6">How it will look on your site</Typography>
        </Stack>
        <Paper
          sx={{
            position: 'relative',
            overflow: 'hidden',
            minHeight: { xs: 540, md: 500 },
            borderRadius: 3,
            bgcolor: '#f8fafc',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            backgroundImage:
              'radial-gradient(circle at top left, rgba(14, 165, 233, 0.12), transparent 34%), linear-gradient(180deg, #ffffff, #f8fafc 35%, #eef2ff 100%)',
          }}
        >
          <Box
            sx={{
              p: { xs: 2, md: 3 },
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.8fr' },
              gap: 2,
            }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#22c55e' }} />
                <Typography variant="caption" sx={{ letterSpacing: 1.2, textTransform: 'uppercase', color: 'text.secondary' }}>
                  Your website preview
                </Typography>
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', maxWidth: 420 }}>
                Convert visitors with a chat assistant that feels native to the page.
              </Typography>
              <Typography variant="body1" sx={{ mt: 1.5, color: '#475569', maxWidth: 500 }}>
                The launcher stays fixed in the corner, while the panel opens over your content without breaking the layout.
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
                {['Support', 'Lead capture', 'Knowledge answers'].map((tag) => (
                  <Chip key={tag} label={tag} sx={{ bgcolor: 'rgba(37, 99, 235, 0.08)', color: '#1d4ed8' }} />
                ))}
              </Stack>

              <Stack spacing={1.5} sx={{ mt: 4 }}>
                <Paper sx={{ p: 2, borderRadius: 2, bgcolor: '#ffffff', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    Example product section
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, color: '#475569' }}>
                    Put the script in your app shell and the widget will show up on every page automatically.
                  </Typography>
                </Paper>
                <Paper sx={{ p: 2, borderRadius: 2, bgcolor: '#ffffff', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    Example conversion block
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, color: '#475569' }}>
                    Visitors can ask questions, get routed to the right answer, and stay on the page.
                  </Typography>
                </Paper>
              </Stack>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: { xs: 'center', md: 'flex-end' }, alignItems: 'flex-end' }}>
              <Box
                sx={{
                  width: { xs: '100%', sm: 360 },
                  borderRadius: 4,
                  overflow: 'hidden',
                  boxShadow: '0 28px 70px rgba(15, 23, 42, 0.24)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  bgcolor: '#ffffff',
                }}
              >
                <Box sx={{ p: 1.5, bgcolor: '#2563eb', color: '#ffffff' }}>
                  <Stack direction="row" spacing={1.2} alignItems="center">
                    <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
                      A
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Support Assistant
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.75 }}>
                        Online now
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
                <Box sx={{ p: 1.5, bgcolor: '#f8fafc' }}>
                  <Stack spacing={1.1}>
                    {previewMessages.map((message) => (
                      <Box key={message.content} sx={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <Box
                          sx={{
                            maxWidth: '84%',
                            px: 1.5,
                            py: 1,
                            borderRadius: 2,
                            bgcolor: message.bg,
                            color: message.color,
                            boxShadow: message.role === 'assistant' ? '0 4px 14px rgba(15, 23, 42, 0.08)' : 'none',
                            fontSize: 13,
                            lineHeight: 1.45,
                          }}
                        >
                          {message.content}
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </Box>
                <Box sx={{ p: 1.5, borderTop: '1px solid rgba(148, 163, 184, 0.16)', bgcolor: '#ffffff' }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Box sx={{ flex: 1, px: 1.5, py: 1.1, borderRadius: 2, bgcolor: '#f8fafc', color: '#94a3b8', fontSize: 13 }}>
                      Type a message...
                    </Box>
                    <Box sx={{ px: 1.5, py: 1.1, borderRadius: 2, bgcolor: '#2563eb', color: '#ffffff', fontSize: 13, fontWeight: 700 }}>
                      Send
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>

          <Box
            sx={{
              position: 'absolute',
              right: { xs: 16, md: 28 },
              bottom: { xs: 16, md: 28 },
              width: 60,
              height: 60,
              borderRadius: '50%',
              bgcolor: '#2563eb',
              color: '#ffffff',
              boxShadow: '0 16px 30px rgba(37, 99, 235, 0.34)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 26,
            }}
          >
            💬
          </Box>
        </Paper>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Helpful links
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <Typography component={NextLink} href="/dashboard/settings/profile" sx={{ color: 'primary.main', textDecoration: 'none' }}>
            Open Settings &rarr; Profile (copy key)
          </Typography>
          <Typography component={NextLink} href="/dashboard/settings/theme" sx={{ color: 'primary.main', textDecoration: 'none' }}>
            Open Settings &rarr; Theme (widget style)
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
