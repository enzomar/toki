import ReactDOM from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import App from './App'
import './index.css'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0f766e',
      light: '#3ca79a',
      dark: '#134e4a',
    },
    secondary: {
      main: '#d97706',
      light: '#f59e0b',
      dark: '#9a5a05',
    },
    background: {
      default: '#f6f1e7',
      paper: '#fffdf8',
    },
    success: {
      main: '#2f855a',
    },
    text: {
      primary: '#132238',
      secondary: '#5f6c80',
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: '"Manrope", "Segoe UI Variable", "Segoe UI", sans-serif',
    h3: {
      fontWeight: 800,
      letterSpacing: '-0.045em',
      lineHeight: 1.04,
    },
    h4: {
      fontWeight: 800,
      letterSpacing: '-0.04em',
    },
    h5: {
      fontWeight: 700,
      letterSpacing: '-0.03em',
    },
    h6: {
      fontWeight: 700,
    },
    subtitle1: {
      fontWeight: 700,
    },
    button: {
      fontWeight: 700,
      textTransform: 'none',
      letterSpacing: '-0.01em',
    },
    overline: {
      fontWeight: 700,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          overflow: 'hidden',
          '&.Mui-expanded': {
            margin: 0,
          },
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingInline: 20,
          paddingBlock: 10,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiFilledInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 700,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontWeight: 700,
        },
      },
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>,
)
