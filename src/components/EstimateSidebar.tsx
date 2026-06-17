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
import { ScienceRounded, BarChartRounded } from '@mui/icons-material'
import { DEFAULT_AEIR_SIM_CONFIG, AEIR_SIM_CONFIG_META } from '../features/forecasting/aeir-config'
import type { AEIRSimConfig } from '../features/forecasting/aeir-config'
import type { ExternalForecastResult } from '../features/forecasting/aeir'
import type { Agent, EstimateConfig, EstimateSummary } from '../features/topology/types'
import { formatMetricNumber, getModelLabel } from '../features/topology/utils'

export type EstimateSidebarProps = {
  estimate: EstimateSummary
  mcReport: ExternalForecastResult | null
  mcRunning: boolean
  mcSimCount: number
  setMcSimCount: (v: number) => void
  simConfig: AEIRSimConfig | null
  setSimConfig: (v: AEIRSimConfig | null) => void
  showMcHelp: boolean
  setShowMcHelp: (v: boolean) => void
  showSimConfig: boolean
  setShowSimConfig: (v: boolean) => void
  showMcDetail: boolean
  setShowMcDetail: (v: boolean) => void
  estimateConfig: EstimateConfig
  scaledConfig: EstimateConfig
  growthMultiplier: number
  setGrowthMultiplier: (v: number) => void
  agents: Agent[]
  formatCost: (v: number) => string
}

export function EstimateSidebar({
  estimate,
  mcReport,
  mcRunning,
  mcSimCount,
  setMcSimCount,
  simConfig,
  setSimConfig,
  showMcHelp,
  setShowMcHelp,
  showSimConfig,
  setShowSimConfig,
  setShowMcDetail,
  estimateConfig,
  scaledConfig,
  growthMultiplier,
  setGrowthMultiplier,
  agents,
  formatCost,
}: EstimateSidebarProps) {
  return (
    <>
      {/* Right: Cost summary (sticky) */}
      <Grid size={{ xs: 12, lg: 4 }}>
        <Paper sx={{ p: 2.5, position: { lg: 'sticky' }, top: { lg: 16 }, maxHeight: { lg: 'calc(100vh - 140px)' }, overflowY: { lg: 'auto' }, scrollBehavior: 'smooth' }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Estimated cost</Typography>
          </Stack>

          <Stack spacing={2}>
            {/* Primary metrics: Deterministic vs Monte Carlo side-by-side */}
            <Grid container spacing={1.5}>
              <Grid size={6}>
                <Box sx={{ textAlign: 'center', py: 1.5, bgcolor: 'rgba(19, 34, 56, 0.03)', borderRadius: 2, border: '1px solid rgba(19,34,56,0.06)' }}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontSize: 9 }}>Deterministic</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary' }}>
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
                  <Typography variant="h6" sx={{ fontWeight: 800, color: mcReport ? 'primary.main' : 'text.disabled' }}>
                    {mcReport ? formatCost(mcReport.cost_expected_monthly) : '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                    {mcReport ? `${formatCost(mcReport.cost_expected_monthly / scaledConfig.conversationsPerMonth)}/conv` : 'awaiting simulation'}
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* Token detail: IN / OUT for both modes */}
            <Box sx={{ px: 1, py: 1, bgcolor: 'rgba(19,34,56,0.02)', borderRadius: 1.5, border: '1px solid rgba(19,34,56,0.04)' }}>
              <Grid container spacing={0.5}>
                {/* Header */}
                <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600 }}>&nbsp;</Typography></Grid>
                <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600, textAlign: 'center', display: 'block' }}>Deterministic</Typography></Grid>
                <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600, textAlign: 'center', display: 'block' }}>Monte Carlo</Typography></Grid>
                {/* Tokens/mo row */}
                <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Tokens/mo</Typography></Grid>
                <Grid size={4}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, textAlign: 'center', display: 'block' }}>{formatMetricNumber(estimate.totalTokensPerMonth)}</Typography></Grid>
                <Grid size={4}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber(mcReport.tokens_expected_per_conv * scaledConfig.conversationsPerMonth) : '—'}</Typography></Grid>
                {/* Input tokens row */}
                <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>↓ Input</Typography></Grid>
                <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block' }}>{formatMetricNumber(estimate.totalInputTokens)}</Typography></Grid>
                <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber(mcReport.input_tokens_per_conv * scaledConfig.conversationsPerMonth) : '—'}</Typography></Grid>
                {/* Output tokens row */}
                <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>↑ Output</Typography></Grid>
                <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block' }}>{formatMetricNumber(estimate.totalOutputTokens)}</Typography></Grid>
                <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber(mcReport.output_tokens_per_conv * scaledConfig.conversationsPerMonth) : '—'}</Typography></Grid>
                {/* Embedding tokens row */}
                {(estimate.totalEmbeddingTokens > 0 || (mcReport && mcReport.breakdown_embedding_tokens > 0)) && (
                  <>
                    <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>⟡ Embedding</Typography></Grid>
                    <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block' }}>{formatMetricNumber(estimate.totalEmbeddingTokens)}</Typography></Grid>
                    <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber(mcReport.breakdown_embedding_tokens * scaledConfig.conversationsPerMonth) : '—'}</Typography></Grid>
                  </>
                )}
                {/* Alignment indicator */}
                {mcReport && (
                  <>
                    <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Alignment</Typography></Grid>
                    <Grid size={8}>
                      <Typography variant="caption" sx={{ fontSize: 10, color: mcReport.alignment_ok ? 'success.main' : 'warning.main' }}>
                        {mcReport.alignment_ok ? `✓ ×${mcReport.alignment_ratio.toFixed(2)} (within ±15%)` : `⚠ ×${mcReport.alignment_ratio.toFixed(2)} — models diverge`}
                      </Typography>
                    </Grid>
                  </>
                )}
              </Grid>
            </Box>

            {/* Traffic volume summary */}
            {estimateConfig.conversationsPerMonth > 0 && (
              <Box sx={{ px: 1.5, py: 1, bgcolor: 'rgba(19,34,56,0.02)', borderRadius: 1.5, border: '1px solid rgba(19,34,56,0.06)' }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">{estimateConfig.users.toLocaleString()} users × {estimateConfig.conversationsPerUser} conv/{estimateConfig.timeRange}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>{scaledConfig.conversationsPerMonth.toLocaleString()} conv/mo{growthMultiplier > 1 ? ` (×${growthMultiplier})` : ''}</Typography>
                </Stack>
                {estimate.tokensPerConversation > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                    ≈ {formatMetricNumber(estimate.tokensPerConversation)} tokens/conversation
                  </Typography>
                )}
              </Box>
            )}

            {/* Growth multiplier */}
            {estimateConfig.conversationsPerMonth > 0 && (
              <Box sx={{ px: 1.5 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">Growth scenario</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>{growthMultiplier}×</Typography>
                </Stack>
                <Slider size="small" value={growthMultiplier} min={1} max={5} step={0.5} marks={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 3, label: '3×' }, { value: 5, label: '5×' }]} onChange={(_, v) => setGrowthMultiplier(v as number)} sx={{ mt: 0, '& .MuiSlider-markLabel': { fontSize: 10 } }} />
              </Box>
            )}

            {/* Monte Carlo percentile range — AEIR engine */}
            {(estimate.totalCostPerMonth > 0 || (mcReport && mcReport.cost_expected_monthly > 0)) && (
              <Box sx={{ p: 1.5, bgcolor: 'rgba(19,34,56,0.02)', borderRadius: 1.5, border: '1px solid rgba(19,34,56,0.06)' }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      MC simulation{mcRunning ? ' · running…' : mcReport ? ` (${mcReport.simulation_count} runs)` : ''}
                    </Typography>
                    <Tooltip title="Learn how cost forecasting works — deterministic vs Monte Carlo simulation" arrow>
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setShowMcHelp(!showMcHelp)}>
                        <ScienceRounded sx={{ fontSize: 14, color: 'text.secondary' }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Configure simulation parameters" arrow>
                      <IconButton size="small" sx={{ p: 0.5 }} onClick={() => setShowSimConfig(!showSimConfig)}>
                        <Typography sx={{ fontSize: 16, lineHeight: 1, color: 'text.secondary' }}>⚙</Typography>
                      </IconButton>
                    </Tooltip>
                    {mcReport && (
                      <Tooltip title="View simulation details (distribution, per-node breakdown)" arrow>
                        <IconButton size="small" sx={{ p: 0.5 }} onClick={() => setShowMcDetail(true)}>
                          <BarChartRounded sx={{ fontSize: 16, color: 'text.secondary' }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                  <FormControl size="small" sx={{ minWidth: 80 }}>
                    <Select value={mcSimCount} onChange={(e) => setMcSimCount(Number(e.target.value))} sx={{ fontSize: 11, height: 22 }}>
                      <MenuItem value={50}>50</MenuItem>
                      <MenuItem value={100}>100</MenuItem>
                      <MenuItem value={200}>200</MenuItem>
                      <MenuItem value={500}>500</MenuItem>
                      <MenuItem value={1000}>1,000</MenuItem>
                      <MenuItem value={5000}>5,000</MenuItem>
                      <MenuItem value={10000}>10,000</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>

                {/* MC Help explanation (collapsible) */}
                <Collapse in={showMcHelp}>
                  <Box sx={{ mb: 1, p: 1.5, bgcolor: 'rgba(15,118,110,0.03)', borderRadius: 1.5, border: '1px solid rgba(15,118,110,0.1)' }}>
                    <Typography variant="caption" sx={{ fontSize: 11, lineHeight: 1.7, display: 'block', color: 'text.primary' }}>
                      <strong style={{ fontSize: 12 }}>📊 Two forecasting approaches</strong>
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: 10.5, lineHeight: 1.7, display: 'block', color: 'text.secondary', mt: 1 }}>
                      <strong>Deterministic</strong> — A single "expected" value. Multiplies each agent's tokens × calls × traffic share. Fast and predictable, but assumes everything goes exactly as planned. Think of it as the "if nothing surprising happens" estimate.<br/><br/>
                      <strong>Monte Carlo (MC)</strong> — Simulates {mcSimCount} real conversations with randomness. Each run might take a different path through your agents, retrieve more or fewer RAG chunks, trigger extra tool calls, or hit retries. The result is a <em>range</em> of possible outcomes:<br/>
                      • <strong>p50</strong> — Typical cost (half of conversations cost less than this)<br/>
                      • <strong>p90</strong> — High-end cost (only 10% exceed this)<br/>
                      • <strong>p99</strong> — Worst-case tail risk (1 in 100 conversations)<br/><br/>
                      <strong style={{ fontSize: 11 }}>💡 Why both?</strong><br/>
                      The deterministic number answers <em>"what should we budget?"</em><br/>
                      Monte Carlo answers <em>"what could it actually cost — and how bad can it get?"</em><br/><br/>
                      When both numbers are close (alignment ✓), your estimate is reliable. When they diverge (⚠ drift), real-world variability might significantly exceed your budget.
                    </Typography>
                    {mcReport && (
                      <Box sx={{ mt: 1.5, p: 1, bgcolor: 'rgba(15,118,110,0.05)', borderRadius: 1 }}>
                        <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary', display: 'block' }}>
                          <strong>Your current results:</strong> Deterministic says {formatMetricNumber(mcReport.deterministic_tokens_per_conv)} tok/conv, MC says {formatMetricNumber(mcReport.tokens_expected_per_conv)} tok/conv (×{mcReport.alignment_ratio.toFixed(2)} alignment). Confidence {Math.round(mcReport.confidence_score * 100)}% — {mcReport.confidence_score >= 0.8 ? 'estimates are reliable' : mcReport.confidence_score >= 0.6 ? 'moderate uncertainty, consider increasing simulation count' : 'high uncertainty, review agent configuration'}.
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Collapse>

                {/* Simulation Config Panel (collapsible) */}
                <Collapse in={showSimConfig}>
                  <Box sx={{ mb: 1, p: 1.25, bgcolor: 'rgba(19,34,56,0.03)', borderRadius: 1, border: '1px solid rgba(19,34,56,0.08)' }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10 }}>Simulation Parameters</Typography>
                      <Button size="small" sx={{ fontSize: 9, textTransform: 'none', minWidth: 0, px: 1 }} onClick={() => setSimConfig(null)}>Reset defaults</Button>
                    </Stack>
                    {(() => {
                      const cfg = simConfig ?? DEFAULT_AEIR_SIM_CONFIG
                      const entries = Object.entries(AEIR_SIM_CONFIG_META) as Array<[keyof typeof cfg, typeof AEIR_SIM_CONFIG_META[keyof typeof AEIR_SIM_CONFIG_META]]>
                      return (
                        <Stack spacing={0.75}>
                          {entries.map(([key, meta]) => (
                            <Stack key={key} direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                              <Tooltip title={meta.help} arrow placement="left">
                                <Typography variant="caption" sx={{ fontSize: 9, color: 'text.secondary', minWidth: 120, cursor: 'help' }}>{meta.label}</Typography>
                              </Tooltip>
                              <Slider
                                size="small"
                                value={cfg[key]}
                                min={meta.min}
                                max={meta.max}
                                step={meta.step}
                                onChange={(_, v) => {
                                  const next = { ...(simConfig ?? DEFAULT_AEIR_SIM_CONFIG), [key]: v as number }
                                  setSimConfig(next)
                                }}
                                sx={{ flex: 1, '& .MuiSlider-thumb': { width: 10, height: 10 } }}
                              />
                              <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, minWidth: 32, textAlign: 'right' }}>
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
                    {/* Percentile table: tokens and cost in same grid */}
                    <Box sx={{ mb: 0.75 }}>
                      <Grid container spacing={0.5}>
                        <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>&nbsp;</Typography></Grid>
                        <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600 }}>p50</Typography></Grid>
                        <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600 }}>p90</Typography></Grid>
                        <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600 }}>p99</Typography></Grid>
                      </Grid>
                      <Grid container spacing={0.5}>
                        <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Tokens</Typography></Grid>
                        <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{formatMetricNumber(mcReport.tokens_p50_per_conv)}</Typography></Grid>
                        <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{formatMetricNumber(mcReport.tokens_p90_per_conv)}</Typography></Grid>
                        <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, color: 'warning.dark' }}>{formatMetricNumber(mcReport.tokens_p99_per_conv)}</Typography></Grid>
                      </Grid>
                      <Grid container spacing={0.5}>
                        <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Cost/mo</Typography></Grid>
                        <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{formatCost(mcReport.cost_p50_monthly)}</Typography></Grid>
                        <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11 }}>{formatCost(mcReport.cost_p90_monthly)}</Typography></Grid>
                        <Grid size={3}><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, color: 'warning.dark' }}>{formatCost(mcReport.cost_p99_monthly)}</Typography></Grid>
                      </Grid>
                    </Box>
                    
                    {/* Breakdown */}
                    <Divider sx={{ my: 0.75 }} />
                    <Grid container spacing={0.5} sx={{ mb: 0.5 }}>
                      <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Base</Typography><Typography variant="caption" sx={{ fontWeight: 600, fontSize: 10, display: 'block' }}>{formatMetricNumber(mcReport.breakdown_base_tokens)}</Typography></Grid>
                      <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>RAG</Typography><Typography variant="caption" sx={{ fontWeight: 600, fontSize: 10, display: 'block' }}>{formatMetricNumber(mcReport.breakdown_rag_tokens)}</Typography></Grid>
                      <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>MCP</Typography><Typography variant="caption" sx={{ fontWeight: 600, fontSize: 10, display: 'block' }}>{formatMetricNumber(mcReport.breakdown_mcp_tokens)}</Typography></Grid>
                      <Grid size={3}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Embed</Typography><Typography variant="caption" sx={{ fontWeight: 600, fontSize: 10, display: 'block' }}>{formatMetricNumber(mcReport.breakdown_embedding_tokens)}</Typography></Grid>
                    </Grid>
                    
                    {/* Dominant cost nodes */}
                    {mcReport.dominant_nodes && mcReport.dominant_nodes.length > 0 && (
                      <>
                        <Divider sx={{ my: 0.75 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 600, display: 'block', mb: 0.25 }}>Top cost contributors</Typography>
                        {mcReport.dominant_nodes.slice(0, 3).map((dn) => (
                          <Stack key={dn.node_id} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                              {dn.label} {dn.is_cost_spike ? '⚡' : ''}
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 10 }}>
                              {Math.round(dn.cost_fraction * 100)}%
                            </Typography>
                          </Stack>
                        ))}
                      </>
                    )}
                    
                    {/* Metadata row */}
                    <Divider sx={{ my: 0.75 }} />
                    <Grid container spacing={0.5}>
                      <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Tail risk</Typography><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10, color: mcReport.tail_risk_factor > 2 ? 'error.main' : 'text.primary', display: 'block' }}>{mcReport.tail_risk_factor.toFixed(2)}×</Typography></Grid>
                      <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Confidence</Typography><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10, display: 'block' }}>{Math.round(mcReport.confidence_score * 100)}%</Typography></Grid>
                      <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Compile</Typography><Typography variant="caption" sx={{ fontWeight: 700, fontSize: 10, display: 'block' }}>{mcReport.compilation_time_ms.toFixed(1)}ms</Typography></Grid>
                    </Grid>
                  </>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {agents.length === 0 ? 'Add agents to run simulation' : 'Set traffic volume to simulate'}
                  </Typography>
                )}
              </Box>
            )}

            {/* Confidence indicator — enhanced with MC variance */}
            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: estimate.confidence === 'high' ? 'rgba(47,133,90,0.06)' : estimate.confidence === 'medium' ? 'rgba(217,119,6,0.06)' : 'rgba(220,38,38,0.06)', border: '1px solid', borderColor: estimate.confidence === 'high' ? 'rgba(47,133,90,0.2)' : estimate.confidence === 'medium' ? 'rgba(217,119,6,0.2)' : 'rgba(220,38,38,0.2)' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                <Chip size="small" label={estimate.confidence === 'high' ? 'High confidence' : estimate.confidence === 'medium' ? 'Medium confidence' : 'Low confidence'} color={estimate.confidence === 'high' ? 'success' : estimate.confidence === 'medium' ? 'warning' : 'error'} />
                {mcReport && (
                  <Tooltip title={`Monte Carlo confidence: ${Math.round(mcReport.confidence_score * 100)}%. This combines alignment (MC mean vs deterministic: ×${mcReport.alignment_ratio.toFixed(2)}) and variance (CV = ${(Math.sqrt(mcReport.variance_tokens) / (mcReport.tokens_expected_per_conv || 1)).toFixed(2)}). Penalties: misalignment > ±15% = −20%, high variance = −10% to −40%. Higher is better.`} arrow>
                    <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help', borderBottom: '1px dotted', borderColor: 'text.disabled' }}>
                      MC: {Math.round(mcReport.confidence_score * 100)}%
                    </Typography>
                  </Tooltip>
                )}
              </Stack>
              <Stack spacing={0.25}>
                {estimate.confidenceReasons.map((reason, i) => (
                  <Typography key={i} variant="caption" color="text.secondary">• {reason}</Typography>
                ))}
              </Stack>
            </Box>

            <Divider />

            {/* Embedding tokens (if any) */}
            {estimate.totalEmbeddingTokens > 0 && (
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">Embedding tokens/mo</Typography>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>{formatMetricNumber(estimate.totalEmbeddingTokens)}</Typography>
              </Stack>
            )}

            <Divider />

            <Typography variant="subtitle2">Cost by agent</Typography>
            {estimate.agents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Add agents to see breakdown.</Typography>
            ) : (
              <Stack spacing={1}>
                {estimate.agents.map((a) => (
                  <Stack key={a.id} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {getModelLabel(a.model)} · {Math.round(a.trafficShare * 100)}% traffic
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="subtitle2">{formatCost(a.costPerMonth)}</Typography>
                      <Typography variant="caption" color="text.secondary">{formatMetricNumber(a.totalTokensPerMonth)} tok</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            )}

          </Stack>
        </Paper>
      </Grid>
    </>
  )
}
