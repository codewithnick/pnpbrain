'use client';

import { CssBaseline, ThemeProvider } from '@mui/material';
import { marketingTheme } from '@/lib/theme';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={marketingTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
