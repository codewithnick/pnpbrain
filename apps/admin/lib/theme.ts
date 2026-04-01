import { createTheme } from '@mui/material/styles';

export const adminTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#0ea5e9',
    },
    secondary: {
      main: '#22c55e',
    },
    background: {
      default: '#020617',
      paper: '#0f172a',
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: 'var(--font-space-grotesk), var(--font-manrope), sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(148, 163, 184, 0.16)',
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(148, 163, 184, 0.16)',
        },
      },
    },
  },
});
