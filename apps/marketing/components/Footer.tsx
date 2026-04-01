import { Box, Container, Stack, Typography } from '@mui/material';

export default function Footer() {
  return (
    <Box component="footer" sx={{ borderTop: '1px solid rgba(148, 163, 184, 0.22)', py: 6, px: 2 }}>
      <Container maxWidth="lg">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            PNPBrain <span style={{ fontWeight: 400, color: '#64748b' }}>Plug and Play Brain</span>
          </Typography>

          <Stack direction="row" spacing={3} sx={{ fontSize: 14 }}>
            <a href="#features" style={{ color: '#334155', textDecoration: 'none' }}>Features</a>
            <a href="#pricing" style={{ color: '#334155', textDecoration: 'none' }}>Pricing</a>
            <a href="mailto:hello@pnpbrain.com" style={{ color: '#334155', textDecoration: 'none' }}>Contact</a>
          </Stack>

          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            © {new Date().getFullYear()} PNPBrain. All rights reserved.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
