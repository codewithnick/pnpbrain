import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import Link from 'next/link';

const adminBaseUrl = process.env['NEXT_PUBLIC_ADMIN_URL'] ?? 'http://localhost:3012';

export default function Navbar() {
  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'rgba(248, 250, 252, 0.72)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(15, 118, 110, 0.14)',
        color: 'text.primary',
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ py: 1.2, justifyContent: 'space-between' }}>
          <Box component={Link} href="/" sx={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box sx={{ width: 30, height: 30, borderRadius: 2, bgcolor: 'primary.main', color: '#ecfeff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>
              P
            </Box>
            <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 700 }}>
              PNPBrain
            </Typography>
          </Box>

          <Stack direction="row" spacing={3} sx={{ display: { xs: 'none', md: 'flex' } }}>
            <Button href="#features" color="inherit">Features</Button>
            <Button href="#how-it-works" color="inherit">How it works</Button>
            <Button href="#pricing" color="inherit">Pricing</Button>
          </Stack>

          <Stack direction="row" spacing={1.25} alignItems="center">
            <Button
              component={Link}
              href={`${adminBaseUrl}/login`}
              color="inherit"
              sx={{ display: { xs: 'none', md: 'inline-flex' } }}
            >
              Log in
            </Button>
            <Button
              component={Link}
              href={`${adminBaseUrl}/signup`}
              variant="contained"
              startIcon={<AutoAwesomeRoundedIcon fontSize="small" />}
              sx={{ borderRadius: 2.5, px: 2 }}
            >
              Get started free
            </Button>
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
