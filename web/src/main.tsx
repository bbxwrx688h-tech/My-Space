import { createRoot } from 'react-dom/client';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import rtlPlugin from '@mui/stylis-plugin-rtl';
import { prefixer } from 'stylis';
import { heIL } from '@mui/material/locale';
import { alpha, lighten } from '@mui/material/styles';
import { colors } from './colors';
import { App } from './App';
import CssBaseline from '@mui/material/CssBaseline';

const cache = createCache({ key: 'rtl', stylisPlugins: [prefixer, rtlPlugin] });
const theme = createTheme(
  {
    direction: 'rtl',
    palette: {
      primary: {
        main: colors.steel,
        light: colors.slate,
        dark: colors.navy,
        contrastText: colors.mist,
      },
      secondary: {
        main: colors.navy,
        dark: colors.midnight,
        light: colors.slate,
        contrastText: colors.mist,
      },
      text: { primary: colors.midnight, secondary: colors.steel },
      background: { default: colors.mist, paper: lighten(colors.mist, 0.68) },
      divider: alpha(colors.steel, 0.28),
      action: { hover: alpha(colors.slate, 0.15), selected: alpha(colors.slate, 0.24) },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: 'Arial, sans-serif',
      h1: {
        fontSize: 'clamp(2.2rem,3.6vw,3.45rem)',
        fontWeight: 700,
        letterSpacing: '-.045em',
        lineHeight: 1.12,
      },
      h2: {
        fontSize: 'clamp(1.4rem,2.1vw,1.95rem)',
        fontWeight: 700,
        letterSpacing: '-.035em',
        lineHeight: 1.2,
      },
      h3: { fontSize: '1.17rem', fontWeight: 700, lineHeight: 1.2 },
      button: { fontWeight: 700 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiCssBaseline: {
        styleOverrides: {
          body: { minWidth: 320, fontSynthesis: 'none' },
          ':focus-visible, .MuiButtonBase-root.Mui-focusVisible': {
            outline: `3px solid ${colors.slate}`,
            outlineOffset: '3px',
          },
          '@media (prefers-reduced-motion:reduce)': {
            '*, *::before, *::after': {
              transition: 'none !important',
              animation: 'none !important',
              scrollBehavior: 'auto !important',
            },
            'button:active, a:active': { transform: 'none !important' },
          },
        },
      },
    },
  },
  heIL,
);
createRoot(document.getElementById('root')!).render(
  <CacheProvider value={cache}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </CacheProvider>,
);
