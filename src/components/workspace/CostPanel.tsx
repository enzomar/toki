/**
 * CostPanel — Live cost results panel (right sidebar).
 * Shows deterministic vs MC, growth slider, percentiles, confidence.
 * Designed as a sticky panel that updates in real-time.
 */
import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  FormControl,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { BarChartRounded, ScienceRounded, TuneRounded } from '@mui/icons-material'
import type { ExternalForecastResult } from '../../features/forecasting/aeir'
import type { AEIRSimConfig } from '../../features/forecasting/aeir-config'
import { DEFAULT_AEIR_SIM_CONFIG, AEIR_SIM_CONFIG_META } from '../../features/forecasting/aeir-config'
import type { Agent, EstimateConfig, EstimateSummary } from '../../features/topology/types'
import { formatMetricNumber, getModelLabel } from '../../features/topology/utils'

export type CostPanelProps = {
  estimate: EstimateSummary
  mcReport: ExternalForecastResult | null
  mcRunning: boolean
  mcSimCount: number
  setMcSimCount: (v: number) => void
  simConfig: AEIRSimConfig | null
  setSimConfig: (v: AEIRSimConfig | null) => void
  estimateConfig: EstimateConfig
  scaledConfig: EstimateConfig
  growthMultiplier: number
  setGrowthMultiplier: (v: number) => void
  agents: Agent[]
  formatCost: (v: number) => string
  onShowMcDetail: () => void
}

export function CostPanel({
  estimate,
  mcReport,
  mcRunning,
  mcSimCount,
  setMcSimCount,
  simConfig,
  setSimConfig,
  estimateConfig,
  scaledConfig,
  growthMultiplier,
  setGrowthMultiplier,
  agents,
  formatCost,
  onShowMcDetail,
}: CostPanelProps) {
  const [showSimConfig, setShowSimConfig] = useState(false)

  return (
    <Paper sx={{ p: 2.5, borderRadius: 3, position: { lg: 'sticky' }, top: { lg: 16 }, maxHeight: { lg: 'calc(100vh - 32px)' }, overflowY: { lg: 'auto' }, scrollBehavior: 'smooth' }}>
      {/* Header */}
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Cost Forecast</Typography>

      <Stack spacing={2}>
        {/* Primary metrics */}
        <Grid container spacing={1.5}>
          <Grid size={6}>
            <Box sx={{ textAlign: 'center', py: 1.5, bgcolor: 'rgba(19, 34, 56, 0.03)', borderRadius: 2, border: '1px solid rgba(19,34,56,0.06)' }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontSize: 9 }}>Deterministic</Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                {formatCost(estimate.totalCostPerMonth)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                {formatCost(estimate.costPerConversation)}/conv
              </Typography>
            </Box>
          </Grid>
          <Grid size={6}>
            <Box sx={{ textAlign: 'center', py: 1.5, bgcolor: mcReport ? 'rgba(15, 118, 110, 0.06)' : 'rgba(19, 34, 56, 0.02)', borderRadius: 2, border: '1px solid', borderColor: mcReport ? 'rgba(15,118,110,0.2)' : 'rgba(19,34,56,0.06)' }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontSize: 9 }}>
                MC Expected{mcRunning ? ' …' : ''}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: mcReport ? '#0f766e' : 'text.disabled' }}>
                {mcReport ? formatCost(mcReport.cost_expected_monthly) : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                {mcReport ? `${formatCost(mcReport.cost_expected_monthly / scaledConfig.conversationsPerMonth)}/conv` : 'awaiting sim'}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Token summary */}
        <Box sx={{ px: 1.5, py: 1, bgcolor: 'rgba(19,34,56,0.02)', borderRadius: 2 }}>
          <Grid container spacing={0.5}>
            <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>&nbsp;</Typography></Grid>
            <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, textAlign: 'center', display: 'block' }}>Determ.</Typography></Grid>
            <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, textAlign: 'center', display: 'block' }}>MC</Typography></Grid>
            <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Tokens/mo</Typography></Grid>
            <Grid size={4}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, textAlign: 'center', display: 'block' }}>{formatMetricNumber(estimate.totalTokensPerMonth)}</Typography></Grid>
            <Grid size={4}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber(mcReport.tokens_expected_per_conv * scaledConfig.conversationsPerMonth) : '—'}</Typography></Grid>
            <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>↓ Input</Typography></Grid>
            <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block' }}>{formatMetricNumber(estimate.totalInputTokens)}</Typography></Grid>
            <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber(mcReport.input_tokens_per_conv * scaledConfig.conversationsPerMonth) : '—'}</Typography></Grid>
            <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>↑ Output</Typography></Grid>
            <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block' }}>{formatMetricNumber(estimate.totalOutputTokens)}</Typography></Grid>
            <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber(mcReport.output_tokens_per_conv * scaledConfig.conversationsPerMonth) : '—'}</Typography></Grid>
          </Grid>
        </Box>

        {/* Traffic + Growth */}
        {estimateConfig.conversationsPerMonth > 0 && (
          <>
            <Box sx={{ px: 1.5, py: 1, bgcolor: 'rgba(19,34,56,0.02)', borderRadius: 2 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">
                  {estimateConfig.users.toLocaleString()} users × {estimateConfig.conversationsPerUser} conv/{estimateConfig.timeRange}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {scaledConfig.conversationsPerMonth.toLocaleString()} conv/mo
                </Typography>
              </Stack>
            </Box>
            <Box sx={{ px: 1.5 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">Growth scenario</Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{growthMultiplier}×</Typography>
              </Stack>
              <Slider size="small" value={growthMultiplier} min={1} max={5} step={0.5}
                marks={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 3, label: '3×' }, { value: 5, label: '5×' }]}
                onChange={(_, v) => setGrowthMultiplier(v as number)}
                sx={{ mt: 0, '& .MuiSlider-markLabel': { fontSize: 10 } }}
              />
            </Box>
          </>
        )}

        <Divider />

        {/* Monte Carlo percentiles */}
        {(estimate.totalCostPerMonth > 0 || (mcReport && mcReport.cost_expected_monthly > 0)) && (
          <Box sx={{ p: 1.5, bgcolor: 'rgba(19,34,56,0.02)', borderRadius: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <ScienceRounded sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  Monte Carlo{mcRunning ? ' · running…' : mcReport ? ` (${mcReport.simulation_count} sims)` : ''}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Tooltip title="Configure simulation parameters">
                  <IconButton size="small" onClick={() => setShowSimConfig((v) => !v)}>
                    <TuneRounded sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
                {mcReport && (
                  <Tooltip title="View detailed simulation results">
                    <IconButton size="small" onClick={onShowMcDetail}>
                      <BarChartRounded sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <FormControl size="small" sx={{ minWidth: 70 }}>
                  <Select value={mcSimCount} onChange={(e) => setMcSimCount(Number(e.target.value))} sx={{ fontSize: 10, height: 22 }}>
                    <MenuItem value={50}>50</MenuItem>
                    <MenuItem value={100}>100</MenuItem>
                    <MenuItem value={200}>200</MenuItem>
                    <MenuItem value={500}>500</MenuItem>
                    <MenuItem value={1000}>1k</MenuItem>
                    <MenuItem value={5000}>5k</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </Stack>

            {/* Sim config */}
            <Collapse in={showSimConfig}>
              <Box sx={{ mb: 1.5, p: 1.25, bgcolor: 'rgba(19,34,56,0.03)', borderRadius: 1.5, border: '1px solid rgba(19,34,56,0.06)' }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10 }}>Simulation Parameters</Typography>
                  <Button size="small" sx={{ fontSize: 9, textTransform: 'none', minWidth: 0, px: 1 }} onClick={() => setSimConfig(null)}>Reset</Button>
                </Stack>
                {(() => {
                  const cfg = simConfig ?? DEFAULT_AEIR_SIM_CONFIG
                  const entries = Object.entries(AEIR_SIM_CONFIG_META) as Array<[keyof typeof cfg, typeof AEIR_SIM_CONFIG_META[keyof typeof AEIR_SIM_CONFIG_META]]>
                  return (
                    <Stack spacing={0.5}>
                      {entries.map(([key, meta]) => (
                        <Stack key={key} direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                          <Tooltip title={meta.help} arrow placement="left">
                            <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary', minWidth: 110, cursor: 'help' }}>{meta.label}</Typography>
                          </Tooltip>
                          <Slider size="small" value={cfg[key]} min={meta.min} max={meta.max} step={meta.step}
                            onChange={(_, v) => setSimConfig({ ...(simConfig ?? DEFAULT_AEIR_SIM_CONFIG), [key]: v as number })}
                            sx={{ flex: 1, '& .MuiSlider-thumb': { width: 8, height: 8 } }}
                          />
                          <Typography variant="caption" sx={{ fontSize: 9, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>
                            {typeof cfg[key] === 'number' && cfg[key] < 1 ? cfg[key].toFixed(2) : cfg[key]}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  )
                })()}
              </Box>
            </Collapse>

            {mcReport ? (
              <>
                <Grid container spacing={0.5}>
                  <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>&nbsp;</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600 }}>p50</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600 }}>p90</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600 }}>p99</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Cost/mo</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{formatCost(mcReport.cost_p50_monthly)}</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{formatCost(mcReport.cost_p90_monthly)}</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, color: 'warning.dark' }}>{formatCost(mcReport.cost_p99_monthly)}</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Tok/conv</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{formatMetricNumber(mcReport.tokens_p50_per_conv)}</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{formatMetricNumber(mcReport.tokens_p90_per_conv)}</Typography></Grid>
                  <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, color: 'warning.dark' }}>{formatMetricNumber(mcReport.tokens_p99_per_conv)}</Typography></Grid>
                </Grid>

                <Divider sx={{ my: 1 }} />
                <Grid container spacing={0.5}>
                  <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Tail risk</Typography><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10, color: mcReport.tail_risk_factor > 2 ? 'error.main' : 'text.primary', display: 'block' }}>{mcReport.tail_risk_factor.toFixed(2)}×</Typography></Grid>
                  <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Confidence</Typography><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10, display: 'block' }}>{Math.round(mcReport.confidence_score * 100)}%</Typography></Grid>
                  <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Alignment</Typography><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10, color: mcReport.alignment_ok ? 'success.main' : 'warning.main', display: 'block' }}>×{mcReport.alignment_ratio.toFixed(2)}</Typography></Grid>
                </Grid>
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {agents.length === 0 ? 'Add agents to run simulation' : 'Set traffic volume to simulate'}
              </Typography>
            )}
          </Box>
        )}

        {/* Confidence */}
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: estimate.confidence === 'high' ? 'rgba(47,133,90,0.06)' : estimate.confidence === 'medium' ? 'rgba(217,119,6,0.06)' : 'rgba(220,38,38,0.06)', border: '1px solid', borderColor: estimate.confidence === 'high' ? 'rgba(47,133,90,0.2)' : estimate.confidence === 'medium' ? 'rgba(217,119,6,0.2)' : 'rgba(220,38,38,0.2)' }}>
          <Chip size="small" label={estimate.confidence === 'high' ? 'High confidence' : estimate.confidence === 'medium' ? 'Medium confidence' : 'Low confidence'} color={estimate.confidence === 'high' ? 'success' : estimate.confidence === 'medium' ? 'warning' : 'error'} sx={{ mb: 0.5 }} />
          <Stack spacing={0.25}>
            {estimate.confidenceReasons.map((reason, i) => (
              <Typography key={i} variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>• {reason}</Typography>
            ))}
          </Stack>
        </Box>

        <Divider />

        {/* Per-agent breakdown */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Cost by agent</Typography>
          {estimate.agents.length === 0 ? (
            <Typography variant="caption" color="text.secondary">Add agents to see breakdown.</Typography>
          ) : (
            <Stack spacing={0.75}>
              {estimate.agents.map((a) => (
                <Stack key={a.id} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>{a.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                      {getModelLabel(a.model)} · {Math.round(a.trafficShare * 100)}%
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>{formatCost(a.costPerMonth)}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{formatMetricNumber(a.totalTokensPerMonth)} tok</Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  )
}
