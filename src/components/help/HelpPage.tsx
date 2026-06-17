/**
 * HelpPage — Embedded reveal.js presentation with fullscreen option.
 * Preserves all existing help slides.
 */
import { Box, Button, Paper } from '@mui/material'
import { PageHeader } from '../layout/PageHeader'

export function HelpPage() {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Help & Documentation"
        description="Interactive guide covering features, forecasting approaches, and best practices"
        actions={
          <Button
            size="small"
            variant="contained"
            onClick={() => window.open('/help.html', '_blank')}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
          >
            Open fullscreen ↗
          </Button>
        }
      />

      <Box sx={{ flex: 1, px: { xs: 2, md: 4 }, pb: 4 }}>
        <Paper sx={{ height: '100%', minHeight: 500, overflow: 'hidden', borderRadius: 3 }}>
          <Box
            component="iframe"
            src="/help.html"
            sx={{ width: '100%', height: '100%', minHeight: 500, border: 'none', display: 'block' }}
            title="Toki Help & Presentation"
          />
        </Paper>
      </Box>
    </Box>
  )
}
