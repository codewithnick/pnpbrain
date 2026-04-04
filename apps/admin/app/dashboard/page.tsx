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
import type {
  ConversationSummary,
  DashboardStats,
  DashboardTrends,
  DashboardUsage,
} from '@/lib/api-types';
import { fetchBackend } from '@/lib/supabase';

const statCards = [
  { label: 'Total Conversations', key: 'conversations', icon: <InsightsRoundedIcon fontSize="small" /> },
  { label: 'Knowledge Documents', key: 'knowledgeDocuments', icon: <LayersRoundedIcon fontSize="small" /> },
  { label: 'Memory Facts', key: 'memoryFacts', icon: <MemoryRoundedIcon fontSize="small" /> },
  { label: 'Crawl Jobs', key: 'crawlJobs', icon: <TravelExploreRoundedIcon fontSize="small" /> },
] as const;

function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return 'n/a';
  if (ms < 1000) return `${ms} ms`;

  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function compactDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

type TrendKey = 'conversations' | 'userMessages' | 'assistantMessages' | 'memoryFacts' | 'crawlJobs' | 'creditsUsed';

function renderTrendPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  if (values.length === 1) {
    const y = height / 2;
    return `M 0 ${y} L ${width} ${y}`;
  }

  const maxValue = Math.max(1, ...values);
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function lineSeriesValues(points: DashboardTrends['points'], key: TrendKey) {
  return points.map((point) => point[key] ?? 0);
}

function maxForPoints(points: DashboardTrends['points'], keys: TrendKey[]) {
  const values = points.flatMap((point) => keys.map((key) => point[key] ?? 0));
  return Math.max(1, ...values);
}

function sumModelUsage(points: DashboardTrends['points']) {
  const totals: Record<string, number> = {};
  for (const point of points) {
    for (const [modelKey, value] of Object.entries(point.modelUsage ?? {})) {
      totals[modelKey] = (totals[modelKey] ?? 0) + value;
    }
  }
  return totals;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [usage, setUsage] = useState<DashboardUsage | null>(null);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [trendsDays, setTrendsDays] = useState<7 | 14 | 30>(14);
  const [recentConversations, setRecentConversations] = useState<ConversationSummary[]>([]);
  const [error, setError] = useState('');

  const creditsRemainingLabel = (() => {
    if (!usage) return '–';
    if (usage.credits.remaining === null) return 'Unlimited';
    return usage.credits.remaining.toLocaleString();
  })();

  useEffect(() => {
    (async () => {
      try {
        const [statsRes, usageRes, trendsRes, conversationsRes] = await Promise.all([
          fetchBackend('/api/dashboard/stats'),
          fetchBackend('/api/dashboard/usage'),
          fetchBackend(`/api/dashboard/trends?days=${trendsDays}`),
          fetchBackend('/api/conversations?limit=6'),
        ]);

        if (!statsRes.ok) throw new Error('Failed to load dashboard stats');
        if (!usageRes.ok) throw new Error('Failed to load usage analytics');
        if (!trendsRes.ok) throw new Error('Failed to load dashboard trends');
        if (!conversationsRes.ok) throw new Error('Failed to load conversation timeline');

        const statsJson = (await statsRes.json()) as { data: DashboardStats };
        const usageJson = (await usageRes.json()) as { data: DashboardUsage };
        const trendsJson = (await trendsRes.json()) as { data: DashboardTrends };
        const conversationsJson = (await conversationsRes.json()) as { data: ConversationSummary[] };

        setStats(statsJson.data);
        setUsage(usageJson.data);
        setTrends(trendsJson.data);
        setRecentConversations(conversationsJson.data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard analytics');
      }
    })();
  }, [trendsDays]);

  const trendPoints = (trends?.points ?? []).map((point) => ({
    ...point,
    conversations: point.conversations ?? 0,
    userMessages: point.userMessages ?? 0,
    assistantMessages: point.assistantMessages ?? 0,
    memoryFacts: point.memoryFacts ?? 0,
    crawlJobs: point.crawlJobs ?? 0,
    creditsUsed: point.creditsUsed ?? 0,
    firecrawlQueued: point.firecrawlQueued ?? 0,
    firecrawlRunning: point.firecrawlRunning ?? 0,
    firecrawlDone: point.firecrawlDone ?? 0,
    firecrawlError: point.firecrawlError ?? 0,
    modelUsage: point.modelUsage ?? {},
  }));
  const conversationsValues = lineSeriesValues(trendPoints, 'conversations');
  const userMessageValues = lineSeriesValues(trendPoints, 'userMessages');
  const assistantMessageValues = lineSeriesValues(trendPoints, 'assistantMessages');
  const creditValues = lineSeriesValues(trendPoints, 'creditsUsed');
  const firecrawlValues = lineSeriesValues(trendPoints, 'crawlJobs');
  const modelTotals = sumModelUsage(trendPoints);
  const topModelKeys = Object.entries(modelTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([modelKey]) => modelKey);

  const lineChartWidth = 560;
  const lineChartHeight = 160;
  const lineMax = maxForPoints(trendPoints, ['conversations', 'userMessages', 'assistantMessages']);
  const creditsMax = maxForPoints(trendPoints, ['creditsUsed']);
  const firecrawlMax = maxForPoints(trendPoints, ['crawlJobs']);
  let modelUsageMessage: string | null = null;

  if (trendPoints.length === 0) {
    modelUsageMessage = 'No model usage recorded yet.';
  } else if (topModelKeys.length === 0) {
    modelUsageMessage = 'Model metadata will appear on new assistant messages.';
  }

  const conversationsPath = renderTrendPath(conversationsValues, lineChartWidth, lineChartHeight);
  const userMessagesPath = renderTrendPath(userMessageValues, lineChartWidth, lineChartHeight);
  const assistantMessagesPath = renderTrendPath(assistantMessageValues, lineChartWidth, lineChartHeight);
  const creditsPath = renderTrendPath(creditValues, lineChartWidth, lineChartHeight);
  const firecrawlPath = renderTrendPath(firecrawlValues, lineChartWidth, lineChartHeight);

  const barsMax = maxForPoints(trendPoints, ['memoryFacts', 'crawlJobs']);

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
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={1.5}
              sx={{ mb: 1.5 }}
            >
              <Box>
                <Typography variant="h6">Usage trend charts</Typography>
                <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 14 }}>
                  Track daily growth and dips for conversations, API message volume, memory facts, and crawl jobs.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                {[7, 14, 30].map((value) => (
                  <Chip
                    key={value}
                    clickable
                    label={`${value}d`}
                    color={trendsDays === value ? 'primary' : 'default'}
                    variant={trendsDays === value ? 'filled' : 'outlined'}
                    onClick={() => setTrendsDays(value as 7 | 14 | 30)}
                  />
                ))}
              </Stack>
            </Stack>

            {trendPoints.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No trend data yet. Charts will populate as usage events are recorded.
              </Typography>
            ) : (
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, lg: 8 }}>
                  <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2">Conversations and API message volume</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5, flexWrap: 'wrap' }}>
                      <Chip size="small" label="Conversations" sx={{ bgcolor: 'rgba(56, 189, 248, 0.16)' }} />
                      <Chip size="small" label="User messages" sx={{ bgcolor: 'rgba(96, 165, 250, 0.16)' }} />
                      <Chip size="small" label="Assistant messages" sx={{ bgcolor: 'rgba(192, 132, 252, 0.18)' }} />
                    </Stack>
                    <Box sx={{ width: '100%', overflowX: 'auto' }}>
                      <Box sx={{ minWidth: lineChartWidth }}>
                        <svg width="100%" viewBox={`0 0 ${lineChartWidth} ${lineChartHeight + 26}`}>
                          <line x1="0" y1={lineChartHeight} x2={lineChartWidth} y2={lineChartHeight} stroke="rgba(148, 163, 184, 0.5)" strokeWidth="1" />
                          <path d={conversationsPath} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
                          <path d={userMessagesPath} fill="none" stroke="#60a5fa" strokeWidth="2.2" />
                          <path d={assistantMessagesPath} fill="none" stroke="#c084fc" strokeWidth="2.2" />
                        </svg>
                        <Stack direction="row" justifyContent="space-between" sx={{ mt: -1.5, px: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">{compactDate(trendPoints[0]!.date)}</Typography>
                          <Typography variant="caption" color="text.secondary">Peak {lineMax}</Typography>
                          <Typography variant="caption" color="text.secondary">{compactDate(trendPoints.at(-1)!.date)}</Typography>
                        </Stack>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, lg: 4 }}>
                  <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', height: '100%' }}>
                    <Typography variant="subtitle2">Content operations</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Memory facts and crawl jobs added per day
                    </Typography>

                    <Stack spacing={1.1} sx={{ mt: 1.5 }}>
                      {trendPoints.slice(-10).map((point) => (
                        <Box key={point.date}>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                            <Typography variant="caption" color="text.secondary">{compactDate(point.date)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {point.memoryFacts} mem / {point.crawlJobs} crawl
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={0.5}>
                            <Box
                              sx={{
                                height: 7,
                                width: `${Math.max(3, (point.memoryFacts / barsMax) * 100)}%`,
                                bgcolor: 'rgba(16, 185, 129, 0.75)',
                                borderRadius: 99,
                              }}
                            />
                            <Box
                              sx={{
                                height: 7,
                                width: `${Math.max(3, (point.crawlJobs / barsMax) * 100)}%`,
                                bgcolor: 'rgba(249, 115, 22, 0.75)',
                                borderRadius: 99,
                              }}
                            />
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            )}

            {recentConversations.length > 0 && (
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Recent session timing: first reply {formatDuration(recentConversations[0]?.firstResponseMs)}
                </Typography>
                <Typography component={Link} href="/dashboard/conversations" variant="caption" color="primary" sx={{ textDecoration: 'none' }}>
                  Open conversation logs
                </Typography>
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="h6">Credit usage</Typography>
            <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 14 }}>
              Daily plan-usage burn from the ledger.
            </Typography>
            {trendPoints.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                No usage recorded yet.
              </Typography>
            ) : (
              <Box sx={{ width: '100%', overflowX: 'auto', mt: 1.5 }}>
                <Box sx={{ minWidth: lineChartWidth }}>
                  <svg width="100%" viewBox={`0 0 ${lineChartWidth} ${lineChartHeight + 26}`}>
                    <line x1="0" y1={lineChartHeight} x2={lineChartWidth} y2={lineChartHeight} stroke="rgba(148, 163, 184, 0.5)" strokeWidth="1" />
                    <path d={creditsPath} fill="none" stroke="#22c55e" strokeWidth="2.5" />
                  </svg>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: -1.5, px: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">{compactDate(trendPoints[0]!.date)}</Typography>
                    <Typography variant="caption" color="text.secondary">Peak {creditsMax}</Typography>
                    <Typography variant="caption" color="text.secondary">{compactDate(trendPoints.at(-1)!.date)}</Typography>
                  </Stack>
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="h6">Firecrawl usage</Typography>
            <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 14 }}>
              Daily crawl volume and status mix.
            </Typography>
            {trendPoints.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                No crawl jobs recorded yet.
              </Typography>
            ) : (
              <Box sx={{ width: '100%', overflowX: 'auto', mt: 1.5 }}>
                <Box sx={{ minWidth: lineChartWidth }}>
                  <svg width="100%" viewBox={`0 0 ${lineChartWidth} ${lineChartHeight + 26}`}>
                    <line x1="0" y1={lineChartHeight} x2={lineChartWidth} y2={lineChartHeight} stroke="rgba(148, 163, 184, 0.5)" strokeWidth="1" />
                    <path d={firecrawlPath} fill="none" stroke="#f97316" strokeWidth="2.5" />
                  </svg>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: -1.5, px: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">{compactDate(trendPoints[0]!.date)}</Typography>
                    <Typography variant="caption" color="text.secondary">Peak {firecrawlMax}</Typography>
                    <Typography variant="caption" color="text.secondary">{compactDate(trendPoints.at(-1)!.date)}</Typography>
                  </Stack>
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Typography variant="h6">Model usage</Typography>
            <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 14 }}>
              Assistant replies grouped by provider and model.
            </Typography>
            {modelUsageMessage ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {modelUsageMessage}
              </Typography>
            ) : (
              <Stack spacing={1.2} sx={{ mt: 1.5 }}>
                {trendPoints.slice(-10).map((point) => {
                  const total = topModelKeys.reduce((sum, modelKey) => sum + (point.modelUsage[modelKey] ?? 0), 0);
                  return (
                    <Box key={point.date}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                        <Typography variant="caption" color="text.secondary">{compactDate(point.date)}</Typography>
                        <Typography variant="caption" color="text.secondary">{total} assistant replies</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5}>
                        {topModelKeys.map((modelKey, index) => {
                          const palette = ['rgba(14, 165, 233, 0.78)', 'rgba(34, 197, 94, 0.78)', 'rgba(168, 85, 247, 0.78)', 'rgba(249, 115, 22, 0.78)'];
                          const value = point.modelUsage[modelKey] ?? 0;
                          return (
                            <Box
                              key={modelKey}
                              sx={{
                                height: 7,
                                width: total === 0 ? 0 : `${(value / total) * 100}%`,
                                bgcolor: palette[index % palette.length],
                                borderRadius: 99,
                              }}
                            />
                          );
                        })}
                      </Stack>
                    </Box>
                  );
                })}
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  {topModelKeys.map((modelKey) => (
                    <Chip key={modelKey} size="small" label={`${modelKey} (${modelTotals[modelKey]})`} variant="outlined" />
                  ))}
                </Stack>
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6">Usage analytics</Typography>
            <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 14 }}>
              Monitor API credit consumption and tracked skill usage in real time.
            </Typography>

            <Grid container spacing={1.5} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(14, 165, 233, 0.08)' }}>
                  <Typography variant="caption" color="text.secondary">Messages used</Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    {usage ? usage.credits.used.toLocaleString() : '–'}
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(34, 197, 94, 0.08)' }}>
                  <Typography variant="caption" color="text.secondary">Messages remaining</Typography>
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
