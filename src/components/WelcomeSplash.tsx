/**
 * WelcomeSplash — Modern onboarding dialog shown on first visit.
 * Light theme with high contrast for readability.
 * "Don't show again" preference stored in localStorage.
 */
import { useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material'
import {
  CalculateRounded,
  AccountTreeRounded,
  ScienceRounded,
  TokenRounded,
  TrendingUpRounded,
  SecurityRounded,
} from '@mui/icons-material'

const STORAGE_KEY = 'toki:hideWelcome'

type Props = {
  open: boolean
  onClose: () => void
}

const features = [
  { icon: <CalculateRounded />, color: '#0f766e', title: 'Cost Forecasting', desc: 'Model agents, tokens, and pricing to estimate monthly LLM costs before you build.' },
  { icon: <AccountTreeRounded />, color: '#4f46e5', title: 'Topology Visualization', desc: 'Design multi-agent architectures with routing, fan-out, and weighted connections.' },
  { icon: <ScienceRounded />, color: '#d97706', title: 'DES Simulation', desc: 'Run discrete-event simulations to find bottlenecks, queue depths, and latency percentiles.' },
  { icon: <TrendingUpRounded />, color: '#0284c7', title: 'Monte Carlo Analysis', desc: 'Probabilistic forecasts with confidence intervals — best and worst case cost ranges.' },
  { icon: <TokenRounded />, color: '#7c3aed', title: 'Token Tool', desc: 'Paste text to estimate token counts and check context window utilization.' },
  { icon: <SecurityRounded />, color: '#059669', title: 'Privacy First', desc: '100% client-side. No data leaves your browser. No accounts, no tracking.' },
]

export function WelcomeSplash({ open, onClose }: Props) {
  const [dontShow, setDontShow] = useState(false)

  const handleClose = () => {
    if (dontShow) {
      try { localStorage.setItem(STORAGE_KEY, 'true') } catch { /* ignore */ }
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: 'hidden',
          bgcolor: '#ffffff',
        },
      }}
    >
      {/* Header with teal accent band */}
      <Box sx={{ px: 4, pt: 4, pb: 2.5, textAlign: 'center', background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%)' }}>
        <Box
          component="img"
          src={`${import.meta.env.BASE_URL}toki-logo.png`}
          alt="Toki"
          sx={{ height: 52, mb: 1.5 }}
        />
        <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: '-0.03em', color: '#0f172a' }}>
          Welcome to Toki
        </Typography>
        <Typography variant="body2" sx={{ color: '#475569', mt: 0.75, maxWidth: 420, mx: 'auto', lineHeight: 1.5 }}>
          Token cost calculator for multi-agent AI systems. Estimate costs, simulate workloads, and right-size your architecture — all in the browser.
        </Typography>
      </Box>

      {/* Features grid */}
      <Box sx={{ px: 4, py: 3 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {features.map((f) => (
            <Stack
              key={f.title}
              direction="row"
              spacing={1.5}
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0',
                transition: 'all 0.15s',
                '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
              }}
            >
              <Box sx={{
                width: 36, height: 36, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: `${f.color}12`, color: f.color, flexShrink: 0,
              }}>
                {f.icon}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 13, color: '#1e293b', lineHeight: 1.3 }}>
                  {f.title}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', lineHeight: 1.4, display: 'block', mt: 0.25 }}>
                  {f.desc}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Box>
      </Box>

      {/* Footer */}
      <Stack
        direction="row"
        sx={{ px: 4, pb: 3, pt: 0.5, justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9' }}
      >
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              sx={{ color: '#94a3b8', '&.Mui-checked': { color: '#0f766e' } }}
            />
          }
          label={
            <Typography variant="caption" sx={{ color: '#64748b', userSelect: 'none' }}>
              Don't show this again
            </Typography>
          }
        />
        <Button
          variant="contained"
          onClick={handleClose}
          sx={{
            bgcolor: '#0f766e',
            color: '#ffffff',
            fontWeight: 700,
            borderRadius: 2,
            textTransform: 'none',
            px: 3,
            boxShadow: '0 2px 8px rgba(15,118,110,0.3)',
            '&:hover': { bgcolor: '#115e59' },
          }}
        >
          Get started
        </Button>
      </Stack>
    </Dialog>
  )
}

/** Check localStorage to determine if splash should show */
export function shouldShowWelcome(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'true'
  } catch {
    return true
  }
}
