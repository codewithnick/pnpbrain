import {
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  Typography,
} from '@mui/material';

const features = [
  {
    icon: '🧠',
    title: 'RAG-Powered Knowledge Base',
    description:
      'Upload documents, paste URLs or run Firecrawl to crawl your site. PNPBrain chunks, embeds, and retrieves the right context for every answer.',
  },
  {
    icon: '💾',
    title: 'Long-Term Customer Memory',
    description:
      'The agent quietly extracts facts from conversations and remembers them across sessions — so customers never repeat themselves.',
  },
  {
    icon: '🔌',
    title: 'One-Line Embed',
    description:
      'Drop a single <script> tag on any HTML page or install the WordPress plugin. The widget is self-contained and < 50 KB.',
  },
  {
    icon: '🏃',
    title: 'Runs Locally with Ollama',
    description:
      'No cloud API keys required in development. Pull `llama3.1:8b` and start building. Switch to GPT-4 or Claude with one env var.',
  },
  {
    icon: '🔒',
    title: 'Domain-Scoped Web Scraping',
    description:
      'Give Firecrawl permission to index only your approved domains. The agent can never scrape arbitrary URLs at runtime.',
  },
  {
    icon: '📊',
    title: 'Admin Dashboard',
    description:
      'Manage the knowledge base, review conversations, monitor crawl jobs, and tweak the widget appearance — all from one place.',
  },
];

export default function Features() {
  return (
    <Box id="features" component="section" sx={{ py: { xs: 10, md: 13 }, px: 2 }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 7 }}>
          <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.5rem' } }}>
            Everything your AI assistant needs
          </Typography>
          <Typography sx={{ mt: 1.5, color: 'text.secondary' }}>
            A full-stack, production-ready platform, not just a chatbot wrapper.
          </Typography>
        </Box>

        <Grid container spacing={2.5}>
          {features.map((f) => (
            <Grid
              key={f.title}
              size={{ xs: 12, sm: 6, lg: 4 }}
            >
              <Card sx={{ height: '100%', borderRadius: 3, bgcolor: 'background.paper' }}>
                <CardContent>
                  <Typography sx={{ fontSize: 30, mb: 1.5 }}>{f.icon}</Typography>
                  <Typography variant="h6" sx={{ fontSize: '1.05rem', mb: 0.8 }}>
                    {f.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {f.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
