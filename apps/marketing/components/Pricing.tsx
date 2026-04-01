import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
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
import Link from 'next/link';

const adminBaseUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3002';

const plans = [
  {
    name: 'Starter',
    price: '$0',
    period: '/ month',
    description: 'Perfect for trying PNPBrain on one site.',
    features: [
      '1 website',
      '100 conversations / month',
      '5 MB knowledge base',
      'Ollama local dev',
      'Community support',
    ],
    cta: 'Get started free',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$29',
    period: '/ month',
    description: 'For businesses ready to scale.',
    features: [
      '5 websites',
      'Unlimited conversations',
      '100 MB knowledge base',
      'Firecrawl auto-refresh',
      'Long-term memory',
      'Email support',
    ],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Dedicated infrastructure, SLA, SSO.',
    features: [
      'Unlimited websites',
      'Unlimited everything',
      'Custom LLM provider',
      'Self-hosted option',
      'Dedicated support',
    ],
    cta: 'Contact sales',
    highlighted: false,
  },
];

export default function Pricing() {
  return (
    <Box id="pricing" component="section" sx={{ py: { xs: 10, md: 14 }, px: 2 }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 7 }}>
          <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.5rem' } }}>
            Simple, transparent pricing
          </Typography>
          <Typography sx={{ mt: 1.5, color: 'text.secondary', fontSize: { xs: '1rem', md: '1.1rem' } }}>
            Start free. Upgrade when you're ready.
          </Typography>
        </Box>

        <Grid container spacing={2.5}>
          {plans.map((plan) => (
            <Grid
              key={plan.name}
              size={{ xs: 12, md: 4 }}
            >
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 4,
                  position: 'relative',
                  bgcolor: plan.highlighted ? 'primary.main' : 'background.paper',
                  color: plan.highlighted ? '#ecfeff' : 'inherit',
                  boxShadow: plan.highlighted ? '0 18px 40px rgba(15, 118, 110, 0.35)' : 'none',
                }}
              >
                <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  {plan.highlighted && (
                    <Chip label="Most popular" size="small" sx={{ mb: 1.5, alignSelf: 'flex-start', bgcolor: 'rgba(236, 254, 255, 0.2)', color: '#ecfeff' }} />
                  )}

                  <Typography variant="h6" sx={{ mb: 0.5 }}>
                    {plan.name}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 3, color: plan.highlighted ? 'rgba(236, 254, 255, 0.78)' : 'text.secondary' }}>
                    {plan.description}
                  </Typography>

                  <Box sx={{ mb: 3 }}>
                    <Typography component="span" sx={{ fontSize: '2rem', fontWeight: 800 }}>
                      {plan.price}
                    </Typography>
                    <Typography
                      component="span"
                      sx={{ ml: 0.5, color: plan.highlighted ? 'rgba(236, 254, 255, 0.78)' : 'text.secondary' }}
                    >
                      {plan.period}
                    </Typography>
                  </Box>

                  <Stack spacing={1.1} sx={{ mb: 3.5, flex: 1 }}>
                    {plan.features.map((f) => (
                      <Stack key={f} direction="row" spacing={1} alignItems="center">
                        <CheckCircleRoundedIcon fontSize="small" sx={{ color: plan.highlighted ? '#86efac' : 'secondary.main' }} />
                        <Typography variant="body2" sx={{ color: plan.highlighted ? '#ecfeff' : 'text.secondary' }}>
                          {f}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>

                  <Button
                    component={Link}
                    href={plan.name === 'Enterprise' ? 'mailto:hello@pnpbrain.com' : `${adminBaseUrl}/signup`}
                    variant={plan.highlighted ? 'outlined' : 'contained'}
                    color={plan.highlighted ? 'inherit' : 'primary'}
                    sx={{
                      borderRadius: 2.5,
                      borderColor: plan.highlighted ? 'rgba(236, 254, 255, 0.5)' : undefined,
                      color: plan.highlighted ? '#ecfeff' : undefined,
                      '&:hover': {
                        borderColor: plan.highlighted ? '#ecfeff' : undefined,
                        backgroundColor: plan.highlighted ? 'rgba(236, 254, 255, 0.08)' : undefined,
                      },
                    }}
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
