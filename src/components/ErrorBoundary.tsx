import { Component, type ReactNode } from 'react'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleClearAndReload = () => {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith('toki:'))
    keys.forEach((key) => localStorage.removeItem(key))
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          background: 'linear-gradient(180deg, #f7f2e7 0%, #f2ecdf 46%, #f6f1e7 100%)',
        }}
      >
        <Paper sx={{ p: 4, maxWidth: 520, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>
            Something went wrong
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Toki encountered an unexpected error. You can try again, or reset the workspace to start fresh.
          </Typography>
          {this.state.error ? (
            <Paper
              variant="outlined"
              sx={{ p: 1.5, mb: 3, textAlign: 'left', bgcolor: 'rgba(248, 250, 252, 0.8)' }}
            >
              <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {this.state.error.message}
              </Typography>
            </Paper>
          ) : null}
          <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center' }}>
            <Button variant="contained" onClick={this.handleReset}>
              Try again
            </Button>
            <Button variant="outlined" color="error" onClick={this.handleClearAndReload}>
              Reset workspace
            </Button>
          </Stack>
        </Paper>
      </Box>
    )
  }
}
