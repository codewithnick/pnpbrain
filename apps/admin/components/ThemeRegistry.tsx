'use client';

import { CssBaseline, ThemeProvider } from '@mui/material';
import { adminTheme } from '@/lib/theme';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={adminTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
