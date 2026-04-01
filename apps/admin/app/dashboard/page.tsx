'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { DashboardStats, DashboardUsage } from '@/lib/api-types';
import { fetchBackend } from '@/lib/supabase';

const statCards = [
  { label: 'Total Conversations', key: 'conversations', icon: <InsightsRoundedIcon fontSize="small" /> },
  { label: 'Knowledge Documents', key: 'knowledgeDocuments', icon: <LayersRoundedIcon fontSize="small" /> },
  { label: 'Memory Facts', key: 'memoryFacts', icon: <MemoryRoundedIcon fontSize="small" /> },
  { label: 'Crawl Jobs', key: 'crawlJobs', icon: <TravelExploreRoundedIcon fontSize="small" /> },
] as const;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [usage, setUsage] = useState<DashboardUsage | null>(null);
  const [error, setError] = useState('');

  const creditsRemainingLabel = (() => {
    if (!usage) return '–';
    if (usage.credits.remaining === null) return 'Unlimited';
    return usage.credits.remaining.toLocaleString();
  })();

  useEffect(() => {
    fetchBackend('/api/dashboard/stats')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load dashboard stats');
        const json = (await res.json()) as { data: DashboardStats };
        setStats(json.data);
      })
      .then(() => fetchBackend('/api/dashboard/usage'))
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load usage analytics');
        const json = (await res.json()) as { data: DashboardUsage };
        setUsage(json.data);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load dashboard analytics')
      );
  }, []);

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Dashboard
          </Typography>
          <Typography color="text.secondary">
            Track adoption, refresh knowledge, and review recent conversations.
          </Typography>
        </Box>
        <Chip color="primary" variant="outlined" label="AI Ops Overview" />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2.5}>
        {statCards.map((stat) => (
          <Grid
            key={stat.label}
            size={{ xs: 12, sm: 6, lg: 3 }}
          >
            <Card sx={{ height: '100%', borderRadius: 3, background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.95))' }}>
              <CardContent>
                <Stack spacing={1.25}>
                  <Box sx={{ color: 'primary.main' }}>{stat.icon}</Box>
                  <Typography variant="h4" sx={{ lineHeight: 1.1 }}>
                    {stats ? stats[stat.key] : '–'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {stat.label}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5} sx={{ mt: 1 }}>
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6">Usage analytics</Typography>
            <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 14 }}>
              Monitor API credit consumption and tracked skill usage in real time.
            </Typography>

            <Grid container spacing={1.5} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(14, 165, 233, 0.08)' }}>
                  <Typography variant="caption" color="text.secondary">Credits used</Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {usage ? usage.credits.used.toLocaleString() : '–'}
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(34, 197, 94, 0.08)' }}>
                  <Typography variant="caption" color="text.secondary">Credits remaining</Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {creditsRemainingLabel}
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(249, 115, 22, 0.08)' }}>
                  <Typography variant="caption" color="text.secondary">User messages</Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {usage ? usage.totals.userMessages.toLocaleString() : '–'}
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(168, 85, 247, 0.12)' }}>
                  <Typography variant="caption" color="text.secondary">Assistant messages</Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {usage ? usage.totals.assistantMessages.toLocaleString() : '–'}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            <Grid container spacing={1.5} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="subtitle2">Skill usage (tracked)</Typography>
                  <Stack spacing={0.5} sx={{ mt: 1.2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Firecrawl runs: {usage?.skills.trackedUsage.firecrawl.totalRuns ?? '–'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Firecrawl success: {usage?.skills.trackedUsage.firecrawl.successfulRuns ?? '–'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Support tickets: {usage?.skills.trackedUsage.supportEscalation.totalTickets ?? '–'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Support tickets success: {usage?.skills.trackedUsage.supportEscalation.successfulTickets ?? '–'}
                    </Typography>
                  </Stack>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="subtitle2">Enabled skills</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.2, flexWrap: 'wrap', rowGap: 1 }}>
                    {(usage?.skills.enabled ?? []).map((skill) => (
                      <Chip key={skill} size="small" label={skill} variant="outlined" />
                    ))}
                    {usage?.skills.enabled.length === 0 && (
                      <Typography variant="body2" color="text.secondary">No skills enabled.</Typography>
                    )}
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="h6">Operational status</Typography>
            <Typography sx={{ mt: 1, color: 'text.secondary', fontSize: 14 }}>
            Your backend is ready to serve live conversations. The next step is populating the knowledge base and embedding the widget.
            </Typography>
            <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Paper
                  component={Link}
                  href="/dashboard/knowledge"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    textDecoration: 'none',
                    bgcolor: 'rgba(14, 165, 233, 0.08)',
                    '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.14)' },
                  }}
                >
                  <Typography variant="subtitle2">Add knowledge</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Upload core FAQs, policies, and product info.
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Paper
                  component={Link}
                  href="/dashboard/firecrawl"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    textDecoration: 'none',
                    bgcolor: 'rgba(34, 197, 94, 0.08)',
                    '&:hover': { bgcolor: 'rgba(34, 197, 94, 0.14)' },
                  }}
                >
                  <Typography variant="subtitle2">Run Firecrawl</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Refresh docs or pricing pages from approved domains.
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="h6">MVP checklist</Typography>
            <Stack spacing={1.2} sx={{ mt: 2, color: 'text.secondary', fontSize: 14 }}>
              <Typography>1. Complete onboarding and confirm model settings.</Typography>
              <Typography>2. Add at least one document or approved crawl URL.</Typography>
              <Typography>3. Embed the widget or install the WordPress plugin.</Typography>
              <Typography>4. Review conversations and refine answers weekly.</Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
