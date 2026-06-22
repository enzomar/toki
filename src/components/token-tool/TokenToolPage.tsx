/**
 * TokenToolPage — Smart token estimation tool with adaptive precision.
 * Architecture: Fast estimate → check vs context window → exact tokenizer if near limit.
 */
import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import {
  CheckCircleOutlineRounded,
  WarningAmberRounded,
  ErrorOutlineRounded,
  SpeedRounded,
  PrecisionManufacturingRounded,
} from '@mui/icons-material'
import { estimateTokensFast, estimateTokensAccurate, estimateTokensSmart, MODEL_CONTEXT_WINDOWS } from '../../features/topology/utils'
import { PageHeader } from '../layout/PageHeader'

const MODEL_OPTIONS = [
  { value: '', label: 'Auto (128k default)' },
  ...Object.entries(MODEL_CONTEXT_WINDOWS).map(([model, ctx]) => ({
    value: model,
    label: `${model} (${ctx >= 1_000_000 ? `${(ctx / 1_000_000).toFixed(0)}M` : `${(ctx / 1000).toFixed(0)}k`} ctx)`,
  })),
]

export function TokenToolPage() {
  const [text, setText] = useState('')
  const [model, setModel] = useState('')

  const result = useMemo(() => estimateTokensSmart(text, model || undefined), [text, model])
  const fastCount = useMemo(() => estimateTokensFast(text), [text])
  const accurateCount = useMemo(() => (text.trim() ? estimateTokensAccurate(text) : 0), [text])

  const chars = text.trim().length
  const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0

  // Status color/icon based on utilization
  const getStatus = () => {
    if (result.utilizationPercent > 90) return { color: '#ef4444', icon: <ErrorOutlineRounded sx={{ fontSize: 18 }} />, label: 'Over limit', severity: 'error' as const }
    if (result.utilizationPercent > 70) return { color: '#f59e0b', icon: <WarningAmberRounded sx={{ fontSize: 18 }} />, label: 'Near limit', severity: 'warning' as const }
    return { color: '#10b981', icon: <CheckCircleOutlineRounded sx={{ fontSize: 18 }} />, label: 'Under limit', severity: 'success' as const }
  }
  const status = getStatus()

  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <PageHeader
        title="Token Tool"
        description="Smart token estimation with adaptive precision — fast heuristic or accurate tokenizer based on context window usage"
      />

      <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
        <Stack spacing={3} sx={{ maxWidth: 900 }}>
          {/* Input area */}
          <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel>Target model</InputLabel>
                <Select
                  label="Target model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                Select the target model to check against its context window
              </Typography>
            </Stack>

            <TextField
              fullWidth
              multiline
              minRows={8}
              maxRows={20}
              placeholder={'Paste your text here...\n\nExamples:\n- A system prompt\n- A JSON API response\n- An MCP tool schema\n- A retrieved RAG chunk'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Paper>

          {/* Results */}
          {text.trim() && (
            <>
              {/* Primary result */}
              <Paper sx={{ p: 2.5, borderRadius: 3, border: `2px solid ${status.color}20` }}>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
                  <Chip
                    label={`${result.tokens.toLocaleString()} tokens`}
                    color="primary"
                    sx={{ fontWeight: 700, fontSize: 18, height: 40, px: 1.5 }}
                  />
                  <Chip
                    icon={result.method === 'fast' ? <SpeedRounded /> : <PrecisionManufacturingRounded />}
                    label={result.method === 'fast' ? 'Fast estimate' : 'Accurate tokenizer'}
                    variant="outlined"
                    sx={{ height: 32, fontWeight: 600 }}
                  />
                  <Chip
                    icon={status.icon}
                    label={status.label}
                    sx={{ height: 32, fontWeight: 600, bgcolor: `${status.color}14`, color: status.color, border: `1px solid ${status.color}30` }}
                  />
                </Stack>

                {/* Context window utilization bar */}
                <Stack spacing={0.5}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">
                      Context window utilization
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: status.color }}>
                      {result.utilizationPercent}% of {result.contextWindow >= 1_000_000 ? `${(result.contextWindow / 1_000_000).toFixed(0)}M` : `${(result.contextWindow / 1000).toFixed(0)}k`}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, result.utilizationPercent)}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: '#e2e8f0',
                      '& .MuiLinearProgress-bar': { bgcolor: status.color, borderRadius: 4 },
                    }}
                  />
                  {/* 70% and 100% markers */}
                  <Box sx={{ position: 'relative', height: 12 }}>
                    <Typography variant="caption" sx={{ position: 'absolute', left: '70%', transform: 'translateX(-50%)', fontSize: 9, color: '#f59e0b' }}>
                      70%
                    </Typography>
                    <Typography variant="caption" sx={{ position: 'absolute', left: '100%', transform: 'translateX(-100%)', fontSize: 9, color: '#ef4444' }}>
                      100%
                    </Typography>
                  </Box>
                </Stack>
              </Paper>

              {/* Breakdown & comparison */}
              <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>Estimation Breakdown</Typography>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Characters</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{chars.toLocaleString()}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Words</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{words.toLocaleString()}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Fast estimate (chars/4)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{fastCount.toLocaleString()}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Accurate (BPE regex)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{accurateCount.toLocaleString()}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Difference</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: Math.abs(fastCount - accurateCount) / Math.max(1, accurateCount) > 0.1 ? '#f59e0b' : '#10b981' }}>
                        {fastCount !== accurateCount ? `${((fastCount - accurateCount) / Math.max(1, accurateCount) * 100).toFixed(1)}%` : '0%'}
                      </Typography>
                    </Box>
                  </Stack>
                </Stack>
              </Paper>

              {/* Decision flow explanation */}
              {result.method === 'accurate' && (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  <strong>Accurate tokenizer activated</strong> — Fast estimate ({fastCount.toLocaleString()}) exceeded 70% of context window ({result.contextWindow.toLocaleString()}). Running BPE-regex tokenizer for precision.
                </Alert>
              )}
            </>
          )}

          {/* Architecture diagram */}
          <Paper sx={{ p: 2.5, borderRadius: 3, bgcolor: '#f8fafc' }}>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              The fast estimator (chars/4) is sufficient for most use cases and runs instantly.
              When text approaches 70% of the model's context window, the system switches to a
              BPE-regex tokenizer that mimics GPT-4's tokenization patterns for higher accuracy (~5% of tiktoken).
            </Typography>
          </Paper>
        </Stack>
      </Box>
    </Box>
  )
}
