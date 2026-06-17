/**
 * MonteCarloSection — Inline Monte Carlo results display.
 * Reuses the logic from McDetailDialog but as an inline section.
 */
import {
  Box,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { ExternalForecastResult } from '../../features/forecasting/aeir'
import { formatMetricNumber, formatCurrency } from '../../features/topology/utils'

type Props = {
  mcReport: ExternalForecastResult | null
  currency?: string
}

export function MonteCarloSection({ mcReport, currency = 'EUR' }: Props) {
  const formatCost = (v: number) => formatCurrency(v, currency as 'EUR' | 'USD')

  if (!mcReport) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>No simulation data yet</Typography>
        <Typography variant="body2" color="text.secondary">
          Configure agents and traffic volume in the Workspace tab. The Monte Carlo simulation runs automatically.
        </Typography>
      </Box>
    )
  }

  return (
    <Stack spacing={3}>
      {/* Summary stats */}
      <Grid container spacing={2}>
        <Grid size={3}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">Simulations</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{mcReport.simulation_count}</Typography>
          </Paper>
        </Grid>
        <Grid size={3}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">Sim Time</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{mcReport.simulation_time_ms.toFixed(0)}ms</Typography>
          </Paper>
        </Grid>
        <Grid size={3}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">Compile</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{mcReport.compilation_time_ms.toFixed(1)}ms</Typography>
          </Paper>
        </Grid>
        <Grid size={3}>
          <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">Confidence</Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: mcReport.confidence_score > 0.8 ? 'success.main' : mcReport.confidence_score > 0.6 ? 'warning.main' : 'error.main' }}>
              {Math.round(mcReport.confidence_score * 100)}%
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Token Distribution */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Token Distribution (per conversation)</Typography>
        <Stack spacing={1} sx={{ p: 1.5, bgcolor: 'rgba(15,118,110,0.03)', borderRadius: 1 }}>
          {[
            { label: 'Expected', value: mcReport.tokens_expected_per_conv, color: '#0f766e' },
            { label: 'p50', value: mcReport.tokens_p50_per_conv, color: '#10b981' },
            { label: 'p90', value: mcReport.tokens_p90_per_conv, color: '#f59e0b' },
            { label: 'p99', value: mcReport.tokens_p99_per_conv, color: '#ef4444' },
            { label: 'Worst', value: mcReport.tokens_worst_per_conv, color: '#7c3aed' },
          ].map(({ label, value, color }) => {
            const maxTok = mcReport.tokens_worst_per_conv || mcReport.tokens_p99_per_conv * 1.2
            const pct = Math.min(100, (value / maxTok) * 100)
            return (
              <Stack key={label} direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ minWidth: 55, fontSize: 10, color: 'text.secondary' }}>{label}</Typography>
                <Box sx={{ flex: 1, height: 16, bgcolor: '#e2e8f0', borderRadius: 1, overflow: 'hidden' }}>
                  <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color, borderRadius: 1 }} />
                </Box>
                <Typography variant="caption" sx={{ minWidth: 60, textAlign: 'right', fontWeight: 700, fontSize: 11 }}>{formatMetricNumber(value)}</Typography>
              </Stack>
            )
          })}
        </Stack>
        <Stack direction="row" sx={{ mt: 1.5, justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">Std dev: {formatMetricNumber(Math.round(Math.sqrt(mcReport.variance_tokens)))} tokens</Typography>
          <Typography variant="caption" color="text.secondary">Tail risk: {mcReport.tail_risk_factor.toFixed(2)}× (p99/p50)</Typography>
        </Stack>
      </Paper>

      {/* Cost Distribution */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Monthly Cost Distribution</Typography>
        <Grid container spacing={2}>
          <Grid size={3}><Typography variant="caption" color="text.secondary">p50</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCost(mcReport.cost_p50_monthly)}</Typography></Grid>
          <Grid size={3}><Typography variant="caption" color="text.secondary">p90</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCost(mcReport.cost_p90_monthly)}</Typography></Grid>
          <Grid size={3}><Typography variant="caption" color="text.secondary">p99</Typography><Typography variant="body2" sx={{ fontWeight: 700, color: 'warning.dark' }}>{formatCost(mcReport.cost_p99_monthly)}</Typography></Grid>
          <Grid size={3}><Typography variant="caption" color="text.secondary">Expected</Typography><Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>{formatCost(mcReport.cost_expected_monthly)}</Typography></Grid>
        </Grid>
      </Paper>

      {/* Token Breakdown */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Token Breakdown (per conversation)</Typography>
        <Grid container spacing={1}>
          {[
            { label: 'Base LLM', value: mcReport.breakdown_base_tokens, bg: 'rgba(249,115,22,0.06)' },
            { label: 'RAG', value: mcReport.breakdown_rag_tokens, bg: 'rgba(59,130,246,0.06)' },
            { label: 'MCP Tools', value: mcReport.breakdown_mcp_tokens, bg: 'rgba(139,92,246,0.06)' },
            { label: 'Embedding', value: mcReport.breakdown_embedding_tokens, bg: 'rgba(20,184,166,0.06)' },
          ].map(({ label, value, bg }) => (
            <Grid key={label} size={3}>
              <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: bg, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatMetricNumber(value)}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Dominant Cost Nodes */}
      {mcReport.dominant_nodes && mcReport.dominant_nodes.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Dominant Cost Contributors</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: 11 }}>Node</TableCell>
                <TableCell sx={{ fontSize: 11 }}>Type</TableCell>
                <TableCell sx={{ fontSize: 11 }}>Model</TableCell>
                <TableCell align="right" sx={{ fontSize: 11 }}>Tokens</TableCell>
                <TableCell align="right" sx={{ fontSize: 11 }}>Cost %</TableCell>
                <TableCell sx={{ fontSize: 11 }}>Risk</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mcReport.dominant_nodes.map(dn => (
                <TableRow key={dn.node_id}>
                  <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>{dn.label}</TableCell>
                  <TableCell><Chip size="small" label={dn.type} sx={{ fontSize: 9, height: 20 }} /></TableCell>
                  <TableCell sx={{ fontSize: 10 }}>{dn.model}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 11 }}>{formatMetricNumber(dn.tokens_expected)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: 11, fontWeight: 700 }}>{Math.round(dn.cost_fraction * 100)}%</TableCell>
                  <TableCell>{dn.is_cost_spike ? <Chip size="small" label="⚡spike" color="warning" sx={{ fontSize: 9, height: 20 }} /> : <Chip size="small" label="stable" color="success" sx={{ fontSize: 9, height: 20 }} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Alignment & Metadata */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Alignment & Metadata</Typography>
        <Grid container spacing={2}>
          <Grid size={4}><Typography variant="caption" color="text.secondary">Deterministic</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{formatMetricNumber(mcReport.deterministic_tokens_per_conv)}/conv</Typography></Grid>
          <Grid size={4}><Typography variant="caption" color="text.secondary">MC expected</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{formatMetricNumber(mcReport.tokens_expected_per_conv)}/conv</Typography></Grid>
          <Grid size={4}><Typography variant="caption" color="text.secondary">Alignment</Typography><Typography variant="body2" sx={{ fontWeight: 600, color: mcReport.alignment_ok ? 'success.main' : 'warning.main' }}>×{mcReport.alignment_ratio.toFixed(3)} {mcReport.alignment_ok ? '✓' : '⚠'}</Typography></Grid>
        </Grid>
      </Paper>
    </Stack>
  )
}
