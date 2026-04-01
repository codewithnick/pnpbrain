'use client';

/**
 * DashboardShell wraps the sidebar + a top banner showing the business public chat URL.
 * Extracted from layout.tsx so it can be a client component (banner fetches session data).
 */

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { AppBar, Box, Button, Chip, Stack, Toolbar, Typography } from '@mui/material';
import Sidebar from '@/components/Sidebar';

function getSupabase() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY'] ?? ''
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [slug, setSlug]     = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const base = process.env['NEXT_PUBLIC_BACKEND_URL'] ?? '';
      const res = await fetch(`${base}/api/business/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { slug?: string } };
      if (json.data?.slug) setSlug(json.data.slug);
    })();
  }, []);

  const publicUrl = slug
    ? `${process.env['NEXT_PUBLIC_MARKETING_URL'] ?? 'https://gcfis.app'}/${slug}`
    : null;

  async function copyUrl() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar />

      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <AppBar
          position="static"
          color="transparent"
          elevation={0}
          sx={{
            borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
            bgcolor: 'rgba(2, 6, 23, 0.65)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Toolbar sx={{ minHeight: 70, justifyContent: 'space-between', px: { xs: 2, md: 3 } }}>
            <Box>
              <Typography variant="h6" sx={{ fontSize: { xs: '1rem', md: '1.15rem' } }}>
                Business Control Center
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Monitor conversations, train knowledge, and keep your assistant production-ready.
              </Typography>
            </Box>
            <Chip label="Live" color="secondary" size="small" />
          </Toolbar>
        </AppBar>

        {publicUrl && (
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent="space-between"
            sx={{
              px: { xs: 2, md: 3 },
              py: 1.5,
              borderBottom: '1px solid rgba(14, 165, 233, 0.25)',
              bgcolor: 'rgba(14, 165, 233, 0.08)',
            }}
          >
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Public chat page:{' '}
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#7dd3fc' }}>
                {publicUrl}
              </a>
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                color="primary"
                variant="contained"
                startIcon={<ContentCopyRoundedIcon fontSize="small" />}
                onClick={copyUrl}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                size="small"
                color="primary"
                variant="outlined"
                startIcon={<OpenInNewRoundedIcon fontSize="small" />}
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </Button>
            </Stack>
          </Stack>
        )}

        <Box component="main" sx={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
