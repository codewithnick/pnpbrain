import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import {
  Box,
  Container,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

const differentiators = [
  {
    icon: <TaskAltRoundedIcon fontSize="small" />,
    title: 'Most chatbots only reply. PNPBrain gets work done.',
    description:
      'Book meetings, qualify leads, look up orders, and escalate support issues with full context from the same conversation.',
  },
  {
    icon: <PsychologyRoundedIcon fontSize="small" />,
    title: 'Context memory that improves customer experience',
    description:
      'PNPBrain remembers key details across sessions, so your customers do not have to repeat themselves every time they return.',
  },
  {
    icon: <BoltRoundedIcon fontSize="small" />,
    title: 'Fast setup on any site',
    description:
      'Go live with a WordPress plugin, script embed, React component, or API without replatforming your existing stack.',
  },
  {
    icon: <FactCheckRoundedIcon fontSize="small" />,
    title: 'Built for trust, privacy, and real outcomes',
    description:
      'Privacy-first architecture, optional on-prem deployment, and measurable impact with strong query deflection and conversion gains.',
  },
];

const comparisons = [
  {
    label: 'Typical chatbot',
    detail: 'Answers basic FAQ and stops there',
  },
  {
    label: 'PNPBrain',
    detail: 'Answers accurately and completes real business actions end-to-end',
  },
  {
    label: 'Typical chatbot',
    detail: 'Loses context between sessions',
  },
  {
    label: 'PNPBrain',
    detail: 'Uses long-term memory for personalized follow-ups',
  },
];

export default function WhyChoose() {
  return (
    <Box component="section" sx={{ py: { xs: 10, md: 13 }, px: 2 }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '2.5rem' } }}>
            Why teams choose PNPBrain over alternatives
          </Typography>
          <Typography sx={{ mt: 1.5, color: 'text.secondary', maxWidth: 760, mx: 'auto' }}>
            Not another chatbot widget. PNPBrain combines accurate answers, real actions, memory, and integrations so your site can convert and support customers 24/7.
          </Typography>
        </Box>

        <Grid container spacing={2.2} sx={{ mb: 4 }}>
          {differentiators.map((item) => (
            <Grid key={item.title} size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
                <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1 }}>
                  <Box
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'rgba(14, 165, 233, 0.14)',
                      color: 'primary.main',
                    }}
                  >
                    {item.icon}
                  </Box>
                  <Typography variant="h6" sx={{ fontSize: '1.02rem' }}>
                    {item.title}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                  {item.description}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          {comparisons.map((row, index) => (
            <Box
              key={`${row.label}-${index}`}
              sx={{
                px: { xs: 2, md: 3 },
                py: 1.7,
                bgcolor: row.label === 'PNPBrain' ? 'rgba(20, 184, 166, 0.08)' : 'transparent',
                borderTop: index === 0 ? 'none' : '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', mb: 0.3 }}>{row.label}</Typography>
              <Typography variant="body2" color="text.secondary">
                {row.detail}
              </Typography>
            </Box>
          ))}
        </Paper>
      </Container>
    </Box>
  );
}