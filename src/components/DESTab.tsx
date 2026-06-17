/**
 * DES Tab — Discrete Event Simulation page
 * 
 * Shows: Controls, Timeline, System Load, Summary Metrics
 * Reuses TOKI's existing agent/edge model.
 */
import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import type { Agent, Edge, WorkspacePricing } from '../features/topology/types'
import { formatMetricNumber, formatCurrency } from '../features/topology/utils'
import { runDES, DEFAULT_DES_CONFIG } from '../features/des'
import type { DESConfig, DESResult, TrafficPattern } from '../features/des'

type Props = {
  agents: Agent[]
  edges: Edge[]
  pricing: WorkspacePricing
}

export function DESTab({ agents, edges, pricing }: Props) {
  const [config, setConfig] = useState<DESConfig>(DEFAULT_DES_CONFIG)
  const [result, setResult] = useState<DESResult | null>(null)
  const [running, setRunning] = useState(false)

  const runSimulation = () => {
    if (agents.length === 0) return
    setRunning(true)
    // Run async-like to not block UI
    setTimeout(() => {
      const res = runDES(agents, edges, pricing, config)
      setResult(res)
      setRunning(false)
    }, 10)
  }

  const formatCost = (v: number) => formatCurrency(v, pricing.currency || 'EUR')

  return (
    <Stack spacing={3}>
      {/* Controls */}
      <Paper sx={{ p: 2.5 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6">DES Simulator</Typography>
            <Typography variant="body2" color="text.secondary">
              Simulate real execution of your AI workflow over time — observe queueing, latency, and bottlenecks.
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={runSimulation}
            disabled={agents.length === 0 || running}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
          >
            {running ? 'Simulating...' : 'Run Simulation'}
          </Button>
        </Stack>

        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Tooltip title="Total number of incoming requests to simulate. Higher = more statistically significant results but slower." arrow placement="top">
              <TextField
                fullWidth size="small" type="number"
                label="Requests"
                value={config.numRequests}
                onChange={(e) => setConfig(c => ({ ...c, numRequests: Math.max(1, Math.min(10000, Number(e.target.value) || 100)) }))}
              />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Tooltip title="Sustained incoming request rate. For burst/spike patterns this is the base rate — peaks will be 3× or 10× higher." arrow placement="top">
              <TextField
                fullWidth size="small" type="number"
                label="RPS"
                value={config.requestsPerSecond}
                onChange={(e) => setConfig(c => ({ ...c, requestsPerSecond: Math.max(0.1, Number(e.target.value) || 10) }))}
                helperText="Requests/sec"
              />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Tooltip title="Constant = uniform Poisson arrivals. Burst = 3× rate for 1s every 5s. Spike = 10× rate at 30% of sim duration." arrow placement="top">
              <FormControl fullWidth size="small">
                <InputLabel>Traffic pattern</InputLabel>
                <Select
                  label="Traffic pattern"
                  value={config.trafficPattern}
                  onChange={(e) => setConfig(c => ({ ...c, trafficPattern: e.target.value as TrafficPattern }))}
                >
                  <MenuItem value="constant">Constant</MenuItem>
                  <MenuItem value="burst">Burst (3× every 5s)</MenuItem>
                  <MenuItem value="spike">Spike (10× at 30%)</MenuItem>
                </Select>
              </FormControl>
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Tooltip title="Maximum number of requests being processed simultaneously. Excess requests are queued with 100ms backpressure delay." arrow placement="top">
              <TextField
                fullWidth size="small" type="number"
                label="Max concurrency"
                value={config.maxConcurrency}
                onChange={(e) => setConfig(c => ({ ...c, maxConcurrency: Math.max(1, Number(e.target.value) || 50) }))}
              />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Tooltip title="Random seed for reproducible results. Same seed + same config = identical simulation output." arrow placement="top">
              <TextField
                fullWidth size="small" type="number"
                label="Seed"
                value={config.seed}
                onChange={(e) => setConfig(c => ({ ...c, seed: Number(e.target.value) || 42 }))}
              />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Agents: {agents.length} · Edges: {edges.length}
            </Typography>
          </Grid>
        </Grid>

        {/* Latency Settings */}
        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(19,34,56,0.03)', borderRadius: 1.5, border: '1px solid rgba(19,34,56,0.06)' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 1 }}>Latency Parameters</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Tooltip title="How fast the LLM generates output tokens. GPT-4o ≈ 80 tok/s, Claude ≈ 50 tok/s, local models ≈ 20 tok/s. Directly determines agent processing time." arrow placement="top">
                <TextField fullWidth size="small" type="number" label="LLM tok/sec" value={config.llmTokensPerSecond} helperText="Token generation speed" onChange={(e) => setConfig(c => ({ ...c, llmTokensPerSecond: Math.max(1, Number(e.target.value) || 50) }))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Tooltip title="Fixed overhead per LLM API call: network round-trip + prompt processing before tokens start streaming. Typically 100-500ms depending on provider and prompt size." arrow placement="top">
                <TextField fullWidth size="small" type="number" label="LLM overhead (ms)" value={config.llmOverheadMs} helperText="Fixed latency per call" onChange={(e) => setConfig(c => ({ ...c, llmOverheadMs: Math.max(0, Number(e.target.value) || 200) }))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Tooltip title="Minimum latency for an MCP tool call (best case). Includes network + tool execution. Fast tools (DB lookup): 50-200ms. API calls: 200-500ms." arrow placement="top">
                <TextField fullWidth size="small" type="number" label="MCP min (ms)" value={config.mcpLatencyMinMs} helperText="Tool call min latency" onChange={(e) => setConfig(c => ({ ...c, mcpLatencyMinMs: Math.max(0, Number(e.target.value) || 200) }))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Tooltip title="Maximum latency for an MCP tool call (worst case). Complex tools, external APIs with retries, or heavy compute can take 2-10s." arrow placement="top">
                <TextField fullWidth size="small" type="number" label="MCP max (ms)" value={config.mcpLatencyMaxMs} helperText="Tool call max latency" onChange={(e) => setConfig(c => ({ ...c, mcpLatencyMaxMs: Math.max(config.mcpLatencyMinMs, Number(e.target.value) || 2000) }))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Tooltip title="Minimum latency for a RAG vector search query. Fast vector DBs (Pinecone, Weaviate): 20-100ms. Self-hosted: 50-300ms." arrow placement="top">
                <TextField fullWidth size="small" type="number" label="RAG min (ms)" value={config.ragLatencyMinMs} helperText="Vector search min" onChange={(e) => setConfig(c => ({ ...c, ragLatencyMinMs: Math.max(0, Number(e.target.value) || 50) }))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Tooltip title="Maximum latency for a RAG vector search (cold cache, large index, or heavy reranking)." arrow placement="top">
                <TextField fullWidth size="small" type="number" label="RAG max (ms)" value={config.ragLatencyMaxMs} helperText="Vector search max" onChange={(e) => setConfig(c => ({ ...c, ragLatencyMaxMs: Math.max(config.ragLatencyMinMs, Number(e.target.value) || 500) }))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Tooltip title="Probability that any agent call fails and needs a retry. 0.05 = 5% failure rate. Models transient errors, rate limits, and timeouts." arrow placement="top">
                <TextField fullWidth size="small" type="number" label="Retry prob" value={config.retryProbability} slotProps={{ htmlInput: { step: 0.01, min: 0, max: 0.5 } }} helperText="Failure rate (0-0.5)" onChange={(e) => setConfig(c => ({ ...c, retryProbability: Math.max(0, Math.min(0.5, Number(e.target.value) || 0.05)) }))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField fullWidth size="small" type="number" label="Retry delay (ms)" value={config.retryDelayMs} helperText="Wait before retry" onChange={(e) => setConfig(c => ({ ...c, retryDelayMs: Math.max(0, Number(e.target.value) || 1000) }))} />
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* Topology & Assumptions */}
      {agents.length > 0 && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Workflow Topology & Assumptions</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            The DES simulator uses the following agent configuration. Default latency assumptions are applied where not explicitly configured.
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>Agent</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>Model</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>Calls</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>In/Out Tok</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>MCP</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>RAG</th>
                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>Est. Latency</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(agent => {
                  const estLatency = Math.round((agent.outputTokensPerCall / config.llmTokensPerSecond) * 1000 + config.llmOverheadMs + (agent.mcpCalls * ((config.mcpLatencyMinMs + config.mcpLatencyMaxMs) / 2)) + (agent.ragEnabled ? ((config.ragLatencyMinMs + config.ragLatencyMaxMs) / 2) : 0))
                  return (
                    <tr key={agent.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{agent.name}</td>
                      <td style={{ padding: '6px 8px', color: '#64748b' }}>{agent.model}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{agent.callsPerConversation}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{agent.inputTokensPerCall}/{agent.outputTokensPerCall}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{agent.mcpCalls > 0 ? `×${agent.mcpCalls}` : '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{agent.ragEnabled ? `${agent.ragChunks}×${agent.ragChunkTokens}` : '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: estLatency > 5000 ? '#ef4444' : estLatency > 2000 ? '#f59e0b' : '#10b981' }}>~{estLatency}ms</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Box>
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(19,34,56,0.03)', borderRadius: 1.5, border: '1px solid rgba(19,34,56,0.06)' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>Active Latency Settings</Typography>
            <Grid container spacing={1}>
              <Grid size={4}><Typography variant="caption" color="text.secondary">LLM speed: {config.llmTokensPerSecond} tok/s</Typography></Grid>
              <Grid size={4}><Typography variant="caption" color="text.secondary">LLM overhead: +{config.llmOverheadMs}ms/call</Typography></Grid>
              <Grid size={4}><Typography variant="caption" color="text.secondary">MCP latency: {config.mcpLatencyMinMs}-{config.mcpLatencyMaxMs}ms</Typography></Grid>
              <Grid size={4}><Typography variant="caption" color="text.secondary">RAG latency: {config.ragLatencyMinMs}-{config.ragLatencyMaxMs}ms</Typography></Grid>
              <Grid size={4}><Typography variant="caption" color="text.secondary">Retry prob: {(config.retryProbability * 100).toFixed(0)}%</Typography></Grid>
              <Grid size={4}><Typography variant="caption" color="text.secondary">Retry delay: {config.retryDelayMs}ms</Typography></Grid>
            </Grid>
          </Box>
        </Paper>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Summary Metrics */}
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Summary Metrics</Typography>
            <Grid container spacing={2}>
              <Grid size={3}><MetricCard label="P50 Latency" value={`${Math.round(result.summary.latency_p50)}ms`} /></Grid>
              <Grid size={3}><MetricCard label="P90 Latency" value={`${Math.round(result.summary.latency_p90)}ms`} /></Grid>
              <Grid size={3}><MetricCard label="P95 Latency" value={`${Math.round(result.summary.latency_p95)}ms`} /></Grid>
              <Grid size={3}><MetricCard label="P99 Latency" value={`${Math.round(result.summary.latency_p99)}ms`} color={result.summary.latency_p99 > result.summary.latency_p50 * 3 ? 'error.main' : undefined} /></Grid>
              <Grid size={3}><MetricCard label="Total Tokens" value={formatMetricNumber(result.summary.totalTokens)} /></Grid>
              <Grid size={3}><MetricCard label="Total Cost" value={formatCost(result.summary.totalCost)} /></Grid>
              <Grid size={3}><MetricCard label="Failure Rate" value={`${(result.summary.failureRate * 100).toFixed(1)}%`} color={result.summary.failureRate > 0.05 ? 'error.main' : undefined} /></Grid>
              <Grid size={3}><MetricCard label="Throughput" value={`${result.summary.throughputRPS.toFixed(1)} RPS`} /></Grid>
              <Grid size={3}><MetricCard label="Completed" value={`${result.summary.completedRequests}/${result.summary.totalRequests}`} /></Grid>
              <Grid size={3}><MetricCard label="Total Retries" value={result.summary.totalRetries.toString()} /></Grid>
              <Grid size={3}><MetricCard label="Max Queue" value={result.summary.maxQueueDepth.toString()} color={result.summary.maxQueueDepth > 20 ? 'warning.main' : undefined} /></Grid>
              <Grid size={3}><MetricCard label="Sim Time" value={`${result.executionTimeMs.toFixed(0)}ms`} /></Grid>
            </Grid>
          </Paper>

          {/* Timeline View */}
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Timeline View</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              First 50 requests shown. Each row is a request, blocks show agent execution time.
            </Typography>
            <Box sx={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 400 }}>
              <TimelineChart result={result} />
            </Box>
          </Paper>

          {/* Queue / Load View */}
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>System Load (per agent)</Typography>
            <Stack spacing={1.5}>
              {result.queues.map(q => (
                <Stack key={q.agentId} direction="row" sx={{ alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 140 }}>{q.label}</Typography>
                  <Box sx={{ flex: 1, height: 20, bgcolor: '#e2e8f0', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
                    <Box sx={{ height: '100%', width: `${Math.min(100, (q.maxQueueDepth / Math.max(1, result.summary.maxQueueDepth)) * 100)}%`, bgcolor: q.maxQueueDepth > 10 ? '#ef4444' : q.maxQueueDepth > 5 ? '#f59e0b' : '#10b981', borderRadius: 1 }} />
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Chip size="small" label={`max: ${q.maxQueueDepth}`} variant="outlined" sx={{ fontSize: 10 }} />
                    <Chip size="small" label={`processed: ${q.totalProcessed}`} variant="outlined" sx={{ fontSize: 10 }} />
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Paper>

          {/* Event Log (condensed) */}
          <Paper sx={{ p: 2.5 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Event Log</Typography>
              <Typography variant="caption" color="text.secondary">{result.events.length} total events (showing last 100)</Typography>
            </Stack>
            <Box sx={{ maxHeight: 300, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
              {result.events.slice(-100).map((ev) => (
                <Stack key={ev.id} direction="row" spacing={1} sx={{ py: 0.25, borderBottom: '1px solid #f1f5f9' }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 10, minWidth: 60, color: 'text.secondary' }}>
                    {ev.time.toFixed(0)}ms
                  </Typography>
                  <Chip size="small" label={ev.type.replace(/_/g, ' ')} sx={{ fontSize: 8, height: 16, bgcolor: getEventColor(ev.type) }} />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                    req#{ev.requestId} {ev.nodeLabel || ''}
                  </Typography>
                </Stack>
              ))}
            </Box>
          </Paper>
        </>
      )}

      {/* Infrastructure Sizing Recommendation */}
      {result && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Infrastructure Sizing</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Estimated compute resources to handle the simulated workload at {config.trafficPattern} traffic ({config.requestsPerSecond} RPS).
          </Typography>
          {(() => {
            // Compute infra recommendations based on simulation results
            const peakRPS = config.trafficPattern === 'spike' ? config.requestsPerSecond * 10 : config.trafficPattern === 'burst' ? config.requestsPerSecond * 3 : config.requestsPerSecond
            const avgLatencySec = result.summary.latency_avg / 1000
            const concurrencyNeeded = Math.ceil(peakRPS * avgLatencySec)
            // CPU: assume 0.1 vCPU per concurrent request (orchestration overhead)
            const cpuCores = Math.max(1, Math.ceil(concurrencyNeeded * 0.1))
            // Memory: ~50MB per concurrent request (context windows in memory)
            const memoryGB = Math.max(0.5, (concurrencyNeeded * 50) / 1024)
            // Nodes: assume 4 vCPU / 8GB per node
            const nodesNeeded = Math.max(1, Math.ceil(Math.max(cpuCores / 4, memoryGB / 8)))
            // Storage: token logs at ~100 bytes per event
            const storagePerDayGB = (result.summary.totalRequests * (result.events.length / result.summary.totalRequests) * 100 * 24 * 3600 / (result.summary.simulationDurationMs / 1000)) / (1024 * 1024 * 1024)
            // Network: tokens * 4 bytes avg per token
            const networkMbps = (result.summary.avgTokensPerRequest * 4 * peakRPS * 8) / (1024 * 1024)

            return (
              <Grid container spacing={2}>
                <Grid size={4}>
                  <Tooltip title="Total vCPU needed across all nodes for the orchestration layer. Based on 0.1 vCPU per concurrent in-flight request (orchestration overhead, not LLM inference)." arrow>
                    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Total CPU (cluster)</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: cpuCores > 16 ? 'error.main' : 'text.primary' }}>{cpuCores} vCPU</Typography>
                      <Typography variant="caption" color="text.secondary">{concurrencyNeeded} concurrent reqs × 0.1</Typography>
                    </Paper>
                  </Tooltip>
                </Grid>
                <Grid size={4}>
                  <Tooltip title="Total RAM needed across all nodes. Each concurrent request holds ~50MB in memory (prompt context, agent state, response buffer). This is TOTAL cluster memory, not per-node." arrow>
                    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Total RAM (cluster)</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: memoryGB > 32 ? 'error.main' : 'text.primary' }}>{memoryGB.toFixed(1)} GB</Typography>
                      <Typography variant="caption" color="text.secondary">{concurrencyNeeded} reqs × 50MB each</Typography>
                    </Paper>
                  </Tooltip>
                </Grid>
                <Grid size={4}>
                  <Tooltip title={`Number of nodes needed (assuming 4 vCPU + 8GB RAM per node). Each node handles: ${Math.min(40, Math.floor(8192 / 50))} concurrent requests. Scale horizontally when queue depth > 10.`} arrow>
                    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Nodes (4vCPU / 8GB each)</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: nodesNeeded > 10 ? 'warning.main' : 'text.primary' }}>{nodesNeeded}</Typography>
                      <Typography variant="caption" color="text.secondary">{Math.ceil(cpuCores / nodesNeeded)} vCPU + {(memoryGB / nodesNeeded).toFixed(1)}GB per node</Typography>
                    </Paper>
                  </Tooltip>
                </Grid>
                <Grid size={4}>
                  <Tooltip title="Maximum requests being processed at the same time. Calculated as peak RPS × average latency. This drives all other sizing." arrow>
                    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Peak Concurrency</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>{concurrencyNeeded}</Typography>
                      <Typography variant="caption" color="text.secondary">{peakRPS} peak RPS × {avgLatencySec.toFixed(1)}s avg latency</Typography>
                    </Paper>
                  </Tooltip>
                </Grid>
                <Grid size={4}>
                  <Tooltip title="Disk space needed per day for storing event traces, metrics, and logs. Based on ~100 bytes per simulation event, extrapolated to 24h at the simulated rate." arrow>
                    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Log Storage / day</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>{storagePerDayGB > 1 ? `${storagePerDayGB.toFixed(1)} GB` : `${Math.round(storagePerDayGB * 1024)} MB`}</Typography>
                      <Typography variant="caption" color="text.secondary">event traces + metrics</Typography>
                    </Paper>
                  </Tooltip>
                </Grid>
                <Grid size={4}>
                  <Tooltip title="Network bandwidth at peak load. Based on token payload size (avg 4 bytes/token) × peak RPS. This is ingress+egress for the orchestration layer only." arrow>
                    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">Network (peak)</Typography>
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>{networkMbps > 1 ? `${networkMbps.toFixed(1)} Mbps` : `${Math.round(networkMbps * 1024)} Kbps`}</Typography>
                      <Typography variant="caption" color="text.secondary">token payload at peak</Typography>
                    </Paper>
                  </Tooltip>
                </Grid>
              </Grid>
            )
          })()}
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(15,118,110,0.04)', borderRadius: 1.5, border: '1px solid rgba(15,118,110,0.1)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              <strong>Sizing assumptions:</strong> 0.1 vCPU per concurrent orchestration request · 50MB memory per active context · 4 vCPU / 8GB per node · Log size ~100 bytes/event. These are <em>orchestration layer</em> resources only — actual LLM inference runs on provider infrastructure (OpenAI/Anthropic API). Scale nodes horizontally if max queue depth exceeds 10.
            </Typography>
          </Box>
        </Paper>
      )}

      {!result && agents.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Add agents in the Calculator tab first, then run the DES simulation.</Typography>
        </Paper>
      )}
    </Stack>
  )
}

// --- Sub-components ---

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, color: color || 'text.primary', fontSize: 18 }}>{value}</Typography>
    </Paper>
  )
}

function TimelineChart({ result }: { result: DESResult }) {
  const maxTime = result.summary.simulationDurationMs || 1
  const requests = result.requests.slice(0, 50) // Show first 50
  const rowHeight = 18
  const width = 800
  const leftMargin = 50

  return (
    <svg width={width} height={requests.length * rowHeight + 30} style={{ display: 'block', minWidth: width }}>
      {/* Time axis */}
      {[0, 0.25, 0.5, 0.75, 1].map(frac => (
        <g key={frac}>
          <line x1={leftMargin + frac * (width - leftMargin - 10)} y1={0} x2={leftMargin + frac * (width - leftMargin - 10)} y2={requests.length * rowHeight} stroke="#e2e8f0" strokeWidth="0.5" />
          <text x={leftMargin + frac * (width - leftMargin - 10)} y={requests.length * rowHeight + 14} fontSize="9" fill="#94a3b8" textAnchor="middle">
            {Math.round(frac * maxTime)}ms
          </text>
        </g>
      ))}

      {/* Request lanes */}
      {requests.map((req, i) => {
        const x1 = leftMargin + (req.startTime / maxTime) * (width - leftMargin - 10)
        const x2 = leftMargin + (req.endTime / maxTime) * (width - leftMargin - 10)
        const barWidth = Math.max(2, x2 - x1)
        const y = i * rowHeight + 2
        const color = req.failed ? '#ef4444' : req.retryCount > 0 ? '#f59e0b' : '#0f766e'

        return (
          <g key={req.requestId}>
            <text x={2} y={y + 12} fontSize="9" fill="#64748b">#{req.requestId}</text>
            <rect x={x1} y={y} width={barWidth} height={rowHeight - 4} rx="3" fill={color} opacity={0.7} />
            {barWidth > 40 && (
              <text x={x1 + 4} y={y + 11} fontSize="8" fill="#fff" fontWeight="bold">
                {Math.round(req.latency)}ms
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function getEventColor(type: string): string {
  switch (type) {
    case 'REQUEST_RECEIVED': return '#dbeafe'
    case 'AGENT_START': return '#d1fae5'
    case 'AGENT_END': return '#ecfdf5'
    case 'MCP_CALL_START': return '#ede9fe'
    case 'MCP_CALL_END': return '#f5f3ff'
    case 'RAG_QUERY_START': return '#dbeafe'
    case 'RAG_QUERY_END': return '#eff6ff'
    case 'RETRY_EVENT': return '#fef3c7'
    case 'RESPONSE_RETURNED': return '#f0fdf4'
    default: return '#f1f5f9'
  }
}
