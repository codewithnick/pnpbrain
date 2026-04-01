'use client';

import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import {
  Avatar,
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import {
  fetchBackend,
  getSupabaseBrowserClient,
  persistAccessTokenCookie,
} from '@/lib/supabase';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: <AnalyticsRoundedIcon fontSize="small" /> },
  { href: '/dashboard/knowledge', label: 'Knowledge Base', icon: <DescriptionRoundedIcon fontSize="small" /> },
  { href: '/dashboard/firecrawl', label: 'Firecrawl', icon: <TravelExploreRoundedIcon fontSize="small" /> },
  { href: '/dashboard/skills', label: 'Skills', icon: <PsychologyRoundedIcon fontSize="small" /> },
  { href: '/dashboard/integrations', label: 'Integrations', icon: <LinkRoundedIcon fontSize="small" /> },
  { href: '/dashboard/conversations', label: 'Conversations', icon: <ChatRoundedIcon fontSize="small" /> },
  { href: '/dashboard/team', label: 'Team', icon: <PeopleRoundedIcon fontSize="small" /> },
  { href: '/dashboard/settings', label: 'Settings', icon: <SettingsRoundedIcon fontSize="small" /> },
];

export default function Sidebar() {
  const router   = useRouter();
  const pathname = usePathname();
  const [slug, setSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('admin-theme');
    const nextTheme = savedTheme === 'light' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetchBackend('/api/business/me');
      if (!res.ok) return;
      const json = (await res.json()) as { data?: { slug?: string } };
      if (json.data?.slug) setSlug(json.data.slug);
    })();
  }, []);

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    persistAccessTokenCookie(null);
    router.push('/login');
  }

  async function copyUrl() {
    if (!slug) return;
    const url = `${process.env['NEXT_PUBLIC_MARKETING_URL'] ?? 'https://gcfis.app'}/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    window.localStorage.setItem('admin-theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: 280,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 280,
          boxSizing: 'border-box',
          borderRight: '1px solid rgba(148, 163, 184, 0.14)',
          backgroundColor: '#020617',
        },
      }}
    >
      <Stack sx={{ height: '100%', p: 2, gap: 2 }}>
        <Paper sx={{ p: 2, borderRadius: 3, background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(16, 185, 129, 0.18))' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar sx={{ bgcolor: 'primary.main', color: '#082f49', fontWeight: 800 }}>G</Avatar>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                GCFIS Admin
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Business workspace
              </Typography>
            </Box>
          </Stack>
        </Paper>

        <List sx={{ p: 0, display: 'grid', gap: 0.75 }}>
          {navItems.map((item) => {
            const active =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);
            return (
              <ListItemButton
                key={item.href}
                component={NextLink}
                href={item.href}
                selected={active}
                sx={{
                  borderRadius: 2,
                  '&.Mui-selected': {
                    bgcolor: 'rgba(14, 165, 233, 0.18)',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 34, color: active ? 'primary.main' : 'text.secondary' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>

        <Box sx={{ mt: 'auto' }}>
        {slug && (
          <Paper sx={{ p: 1.5, borderRadius: 2, mb: 1.5, bgcolor: 'rgba(14, 165, 233, 0.12)' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Public chat route
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700, color: 'primary.light' }}>
              /{slug}
            </Typography>
            <Button onClick={copyUrl} size="small" sx={{ mt: 1 }} variant="contained" fullWidth>
              {copied ? 'Copied' : 'Copy URL'}
            </Button>
          </Paper>
        )}

          <Button
            type="button"
            onClick={toggleTheme}
            fullWidth
            variant="outlined"
            startIcon={<AutoAwesomeRoundedIcon fontSize="small" />}
            sx={{ mb: 1 }}
          >
            Theme: {theme === 'dark' ? 'Dark' : 'Light'}
          </Button>

          <Button
            type="button"
            onClick={signOut}
            fullWidth
            color="inherit"
            variant="text"
            startIcon={<LogoutRoundedIcon fontSize="small" />}
            sx={{ justifyContent: 'flex-start' }}
          >
            Sign out
          </Button>

          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, textAlign: 'center', color: 'text.disabled' }}>
            GCFIS v0.1.0
          </Typography>
        </Box>
      </Stack>
    </Drawer>
  );
}
