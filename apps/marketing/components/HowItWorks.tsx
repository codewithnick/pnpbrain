import {
  Box,
  Container,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

const steps = [
  {
    number: '01',
    title: 'Sign up & connect your site',
    description:
      'Create an account, name your assistant, and paste your website URL. GCFIS is ready in under 2 minutes.',
  },
  {
    number: '02',
    title: 'Build your knowledge base',
    description:
      'Upload PDFs, paste content, or let Firecrawl automatically crawl approved pages. Content is chunked and embedded automatically.',
  },
  {
    number: '03',
    title: 'Embed the widget',
    description:
      'Copy one <script> tag into your HTML, or install the WordPress plugin. The widget appears instantly on your site.',
  },
  {
    number: '04',
    title: 'Watch it work',
    description:
      'Customers get accurate, instant answers 24/7. You monitor conversations and refine the knowledge base from the admin dashboard.',
  },
];

export default function HowItWorks() {
  return (
    <Box id="how-it-works" component="section" sx={{ py: { xs: 10, md: 13 }, px: 2, bgcolor: 'rgba(14, 116, 144, 0.06)' }}>
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.5rem' } }}>
            How it works
          </Typography>
          <Typography sx={{ mt: 1.5, color: 'text.secondary' }}>
            Four steps from signup to live AI assistant.
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {steps.map((step, i) => (
            <Grid key={step.number} size={12}>
              <Paper sx={{ p: 2.2, borderRadius: 3, bgcolor: 'background.paper' }}>
                <Stack direction="row" spacing={2}>
                  <Box
                    sx={{
                      flexShrink: 0,
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'primary.main',
                      color: '#ecfeff',
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {step.number}
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontSize: '1.02rem' }}>
                      {step.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, lineHeight: 1.7 }}>
                      {step.description}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
