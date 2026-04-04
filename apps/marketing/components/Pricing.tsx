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

const adminBaseUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3012';

const plans = [
  {
    name: 'Freemium',
    price: '$0',
    period: '/ month',
    description: 'Best for trying PNPBrain before committing.',
    features: [
      '1 website',
      '200 conversations / month',
      '5 MB knowledge base',
      'PNPBRAIN subdomain hosting',
      'Community support',
    ],
    cta: 'Get started free',
    highlighted: false,
  },
  {
    name: 'Lite',
    price: '$19',
    period: '/ month',
    description: 'Simple monthly plan for early production use.',
    features: [
      '3 websites',
      '2,000 conversations / month',
      '100 MB knowledge base',
      'Custom domain support',
      'Threaded chat history',
      'Email support',
    ],
    cta: 'Start Lite',
    highlighted: false,
  },
  {
    name: 'Basic',
    price: '$49',
    period: '/ month',
    description: 'For growing teams that need predictable volume.',
    features: [
      '10 websites',
      '10,000 conversations / month',
      '500 MB knowledge base',
      'Custom domain support',
      'Priority email support',
    ],
    cta: 'Start Basic',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '$149',
    period: '/ month',
    description: 'High-volume operations with faster response support.',
    features: [
      '30 websites',
      '50,000 conversations / month',
      '2 GB knowledge base',
      'Advanced analytics',
      'Priority support',
    ],
    cta: 'Start Pro',
    highlighted: false,
  },
  {
    name: 'Custom',
    price: 'Custom',
    period: '',
    description: 'Tailored package with direct onboarding support.',
    features: [
      'Unlimited websites',
      'High volume conversation limits',
      'Custom LLM provider',
      'Optional self-hosted deployment',
      'Security/compliance add-ons',
      'Dedicated support',
    ],
    cta: 'Contact support',
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
            Start free. Upgrade when you&apos;re ready.
          </Typography>
        </Box>

        <Grid container spacing={2.5}>
          {plans.map((plan) => (
            <Grid
              key={plan.name}
              size={{ xs: 12, md: 6, lg: 4 }}
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
                    href={plan.name === 'Custom' ? 'mailto:support@pnpbrain.com' : `${adminBaseUrl}/signup`}
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
