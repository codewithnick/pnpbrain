import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import {
  Box,
  Button,
  Chip,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import Link from 'next/link';

const adminBaseUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3002';

export default function Hero() {
  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        pt: { xs: 12, md: 16 },
        pb: { xs: 10, md: 14 },
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: -180,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 760,
          height: 760,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(14, 165, 233, 0.2), rgba(59, 130, 246, 0.03) 65%, transparent)',
        }}
      />

      <Container maxWidth="md" sx={{ position: 'relative', textAlign: 'center' }}>
        <Chip
          icon={<BoltRoundedIcon fontSize="small" />}
          label="Powered by local Ollama and LangGraph.js"
          sx={{
            bgcolor: 'background.paper',
            border: '1px solid rgba(14, 165, 233, 0.24)',
            mb: 3,
          }}
        />

        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '2.2rem', sm: '3rem', md: '3.5rem' },
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
          }}
        >
          Your customers deserve an intelligent assistant
        </Typography>

        <Typography sx={{ mt: 3, fontSize: { xs: '1rem', md: '1.2rem' }, color: 'text.secondary' }}>
          GCFIS embeds a RAG-powered AI chat widget on your website in minutes. It learns from your knowledge base,
          remembers customers, and handles questions 24/7.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" sx={{ mt: 4 }}>
          <Button
            component={Link}
            href={`${adminBaseUrl}/signup`}
            size="large"
            variant="contained"
            endIcon={<ArrowForwardRoundedIcon fontSize="small" />}
            sx={{ px: 3, py: 1.2, borderRadius: 2.5 }}
          >
            Start for free
          </Button>
          <Button href="#how-it-works" size="large" variant="outlined" sx={{ px: 3, py: 1.2, borderRadius: 2.5 }}>
            See how it works
          </Button>
        </Stack>
      </Container>

      <Container maxWidth="sm" sx={{ mt: { xs: 6, md: 8 } }}>
        <Paper sx={{ borderRadius: 4, overflow: 'hidden', boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.4, bgcolor: 'primary.main', color: '#ecfeff' }}>
            <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: 'rgba(236, 254, 255, 0.25)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
              G
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                GCFIS Assistant
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                Online
              </Typography>
            </Box>
          </Box>
          <Stack spacing={1.2} sx={{ p: 2 }}>
            <Paper sx={{ p: 1.2, borderRadius: 2, maxWidth: '80%', bgcolor: 'rgba(15, 118, 110, 0.08)' }}>
              <Typography variant="body2">Hi! How can I help you today?</Typography>
            </Paper>
            <Paper sx={{ p: 1.2, borderRadius: 2, maxWidth: '80%', ml: 'auto', bgcolor: 'primary.main', color: '#ecfeff' }}>
              <Typography variant="body2">What are your business hours?</Typography>
            </Paper>
            <Paper sx={{ p: 1.2, borderRadius: 2, maxWidth: '80%', bgcolor: 'rgba(15, 118, 110, 0.08)' }}>
              <Typography variant="body2">Monday-Friday 9AM-6PM and Saturday 10AM-4PM.</Typography>
            </Paper>
          </Stack>
          <Box sx={{ borderTop: '1px solid rgba(148, 163, 184, 0.2)', px: 2, py: 1.4 }}>
            <Paper sx={{ p: 1.1, borderRadius: 2, bgcolor: 'rgba(148, 163, 184, 0.12)' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Type a message...
              </Typography>
            </Paper>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
