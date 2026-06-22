/**
 * DES Tab — Discrete Event Simulation page
 * 
 * Shows: Controls, LLM Performance, Timeline, System Load, Summary Metrics
 * LLM performance settings are editable directly on this page.
 */
import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
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
import { SpeedRounded } from '@mui/icons-material'
import type { Agent, Edge, LLMPerformanceSettings, WorkspacePricing } from '../features/topology/types'
import { formatMetricNumber, formatCurrency, getPricing } from '../features/topology/utils'
import { runDES } from '../features/des'
import type { DESConfig, DESResult, TrafficPattern } from '../features/des'

type Props = {
  agents: Agent[]
  edges: Edge[]
  pricing: WorkspacePricing
  llmPerformance: LLMPerformanceSettings
  setLLMPerformance: Dispatch<SetStateAction<LLMPerformanceSettings>>
}

export function DESTab({ agents, edges, pricing, llmPerformance, setLLMPerformance }: Props) {
  const [numRequests, setNumRequests] = useState(100)
  const [requestsPerSecond, setRequestsPerSecond] = useState(10)
  const [trafficPattern, setTrafficPattern] = useState<TrafficPattern>('constant')
  const [maxConcurrency, setMaxConcurrency] = useState(50)
  const [seed, setSeed] = useState(42)
  const [result, setResult] = useState<DESResult | null>(null)
  const [running, setRunning] = useState(false)

  const updatePerf = <K extends keyof LLMPerformanceSettings>(key: K, value: LLMPerformanceSettings[K]) => {
    setLLMPerformance((prev) => ({ ...prev, [key]: value }))
  }

  const buildConfig = (): DESConfig => ({
    numRequests,
    trafficPattern,
    requestsPerSecond,
    maxSimulationTime: 60_000,
    seed,
    maxConcurrency,
    llmTokensPerSecond: 50, // fallback; per-model speed from pricing.models[model].tokensPerSecond is used at sim time
    llmOverheadMs: llmPerformance.llmOverheadMs,
    mcpLatencyMinMs: llmPerformance.mcpLatencyMinMs,
    mcpLatencyMaxMs: llmPerformance.mcpLatencyMaxMs,
    ragLatencyMinMs: llmPerformance.ragLatencyMinMs,
    ragLatencyMaxMs: llmPerformance.ragLatencyMaxMs,
    retryDelayMs: llmPerformance.retryDelayMs,
    retryProbability: llmPerformance.retryProbability,
  })

  const runSimulation = () => {
    if (agents.length === 0) return
    setRunning(true)
    setTimeout(() => {
      const cfg = buildConfig()
      const res = runDES(agents, edges, pricing, cfg)
      setResult(res)
      setRunning(false)
    }, 10)
  }

  const config = buildConfig()
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
            <Tooltip title="Total number of incoming requests to simulate." arrow placement="top">
              <TextField fullWidth size="small" type="number" label="Requests" value={numRequests}
                onChange={(e) => setNumRequests(Math.max(1, Math.min(10000, Number(e.target.value) || 100)))} />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Tooltip title="Sustained incoming request rate." arrow placement="top">
              <TextField fullWidth size="small" type="number" label="RPS" value={requestsPerSecond}
                onChange={(e) => setRequestsPerSecond(Math.max(0.1, Number(e.target.value) || 10))} helperText="Requests/sec" />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Tooltip title="Constant = Poisson. Burst = 3x every 5s. Spike = 10x at 30%." arrow placement="top">
              <FormControl fullWidth size="small">
                <InputLabel>Traffic pattern</InputLabel>
                <Select label="Traffic pattern" value={trafficPattern}
                  onChange={(e) => setTrafficPattern(e.target.value as TrafficPattern)}>
                  <MenuItem value="constant">Constant</MenuItem>
                  <MenuItem value="burst">Burst (3x every 5s)</MenuItem>
                  <MenuItem value="spike">Spike (10x at 30%)</MenuItem>
                </Select>
              </FormControl>
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Tooltip title="Max simultaneous requests. Excess queued." arrow placement="top">
              <TextField fullWidth size="small" type="number" label="Max concurrency" value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(Math.max(1, Number(e.target.value) || 50))} />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Tooltip title="Random seed for reproducible results." arrow placement="top">
              <TextField fullWidth size="small" type="number" label="Seed" value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 42)} />
            </Tooltip>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Agents: {agents.length} · Edges: {edges.length}
            </Typography>
          </Grid>
        </Grid>

        {/* LLM Performance Parameters */}
        <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(15,118,110,0.02)', borderRadius: 2, border: '1px solid rgba(15,118,110,0.1)' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
            <SpeedRounded sx={{ fontSize: 18, color: '#0f766e' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              LLM Performance
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              Tok/sec is per model (set in Pricing)
            </Typography>
          </Stack>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Tooltip title="Fixed overhead per LLM call (network + prompt processing)" arrow>
                <TextField fullWidth size="small" type="number" label="LLM overhead (ms)"
                  value={llmPerformance.llmOverheadMs}
                  slotProps={{ htmlInput: { min: 0, step: 50 } }}
                  onChange={(e) => updatePerf('llmOverheadMs', Math.max(0, Number(e.target.value) || 200))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Tooltip title="MCP tool call minimum latency" arrow>
                <TextField fullWidth size="small" type="number" label="MCP min (ms)"
                  value={llmPerformance.mcpLatencyMinMs}
                  slotProps={{ htmlInput: { min: 0, step: 50 } }}
                  onChange={(e) => updatePerf('mcpLatencyMinMs', Math.max(0, Number(e.target.value) || 200))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Tooltip title="MCP tool call maximum latency" arrow>
                <TextField fullWidth size="small" type="number" label="MCP max (ms)"
                  value={llmPerformance.mcpLatencyMaxMs}
                  slotProps={{ htmlInput: { min: 0, step: 100 } }}
                  onChange={(e) => updatePerf('mcpLatencyMaxMs', Math.max(llmPerformance.mcpLatencyMinMs, Number(e.target.value) || 2000))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Tooltip title="RAG vector search minimum latency" arrow>
                <TextField fullWidth size="small" type="number" label="RAG min (ms)"
                  value={llmPerformance.ragLatencyMinMs}
                  slotProps={{ htmlInput: { min: 0, step: 10 } }}
                  onChange={(e) => updatePerf('ragLatencyMinMs', Math.max(0, Number(e.target.value) || 50))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Tooltip title="RAG vector search maximum latency" arrow>
                <TextField fullWidth size="small" type="number" label="RAG max (ms)"
                  value={llmPerformance.ragLatencyMaxMs}
                  slotProps={{ htmlInput: { min: 0, step: 50 } }}
                  onChange={(e) => updatePerf('ragLatencyMaxMs', Math.max(llmPerformance.ragLatencyMinMs, Number(e.target.value) || 500))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Tooltip title="Failure probability per call (transient errors, rate limits)" arrow>
                <TextField fullWidth size="small" type="number" label="Retry prob"
                  value={llmPerformance.retryProbability}
                  slotProps={{ htmlInput: { min: 0, max: 0.5, step: 0.01 } }}
                  onChange={(e) => updatePerf('retryProbability', Math.max(0, Math.min(0.5, Number(e.target.value) || 0.05)))} />
              </Tooltip>
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <Tooltip title="Delay before retrying a failed call" arrow>
                <TextField fullWidth size="small" type="number" label="Retry delay (ms)"
                  value={llmPerformance.retryDelayMs}
                  slotProps={{ htmlInput: { min: 100, step: 100 } }}
                  onChange={(e) => updatePerf('retryDelayMs', Math.max(100, Number(e.target.value) || 1000))} />
              </Tooltip>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* Topology & Assumptions */}
      {agents.length > 0 && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Workflow Topology & Assumptions</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            The DES simulator uses the following agent configuration. Latency assumptions come from Settings.
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
                  const modelSpeed = getPricing(agent.model, pricing.models).tokensPerSecond
                  const estLatency = Math.round(
                    (agent.outputTokensPerCall / modelSpeed) * 1000
                    + config.llmOverheadMs
                    + (agent.mcpCalls * ((config.mcpLatencyMinMs + config.mcpLatencyMaxMs) / 2))
                    + (agent.ragEnabled ? ((config.ragLatencyMinMs + config.ragLatencyMaxMs) / 2) : 0)
                  )
                  return (
                    <tr key={agent.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{agent.name}</td>
                      <td style={{ padding: '6px 8px', color: '#64748b' }}>{agent.model}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{agent.callsPerConversation}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{agent.inputTokensPerCall}/{agent.outputTokensPerCall}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{agent.mcpCalls > 0 ? `\u00d7${agent.mcpCalls}` : '\u2014'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{agent.ragEnabled ? `${agent.ragChunks}\u00d7${agent.ragChunkTokens}` : '\u2014'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: estLatency > 5000 ? '#ef4444' : estLatency > 2000 ? '#f59e0b' : '#10b981' }}>~{estLatency}ms</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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

          {/* Event Log */}
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

      {/* Infrastructure Sizing */}
      {result && (
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Infrastructure Sizing</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Estimated compute for {config.trafficPattern} traffic at {config.requestsPerSecond} RPS.
          </Typography>
          {(() => {
            const peakRPS = config.trafficPattern === 'spike' ? config.requestsPerSecond * 10 : config.trafficPattern === 'burst' ? config.requestsPerSecond * 3 : config.requestsPerSecond
            const avgLatencySec = result.summary.latency_avg / 1000
            const concurrencyNeeded = Math.ceil(peakRPS * avgLatencySec)
            const cpuCores = Math.max(1, Math.ceil(concurrencyNeeded * 0.1))
            const memoryGB = Math.max(0.5, (concurrencyNeeded * 50) / 1024)
            const nodesNeeded = Math.max(1, Math.ceil(Math.max(cpuCores / 4, memoryGB / 8)))
            const storagePerDayGB = (result.summary.totalRequests * (result.events.length / result.summary.totalRequests) * 100 * 24 * 3600 / (result.summary.simulationDurationMs / 1000)) / (1024 * 1024 * 1024)
            const networkMbps = (result.summary.avgTokensPerRequest * 4 * peakRPS * 8) / (1024 * 1024)
            return (
              <Grid container spacing={2}>
                <Grid size={4}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Total CPU</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: cpuCores > 16 ? 'error.main' : 'text.primary' }}>{cpuCores} vCPU</Typography>
                    <Typography variant="caption" color="text.secondary">{concurrencyNeeded} concurrent</Typography>
                  </Paper>
                </Grid>
                <Grid size={4}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Total RAM</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: memoryGB > 32 ? 'error.main' : 'text.primary' }}>{memoryGB.toFixed(1)} GB</Typography>
                    <Typography variant="caption" color="text.secondary">{concurrencyNeeded} reqs x 50MB</Typography>
                  </Paper>
                </Grid>
                <Grid size={4}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Nodes (4vCPU/8GB)</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: nodesNeeded > 10 ? 'warning.main' : 'text.primary' }}>{nodesNeeded}</Typography>
                    <Typography variant="caption" color="text.secondary">{Math.ceil(cpuCores / nodesNeeded)} vCPU/node</Typography>
                  </Paper>
                </Grid>
                <Grid size={4}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Peak Concurrency</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{concurrencyNeeded}</Typography>
                    <Typography variant="caption" color="text.secondary">{peakRPS} RPS x {avgLatencySec.toFixed(1)}s</Typography>
                  </Paper>
                </Grid>
                <Grid size={4}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Storage / day</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{storagePerDayGB > 1 ? `${storagePerDayGB.toFixed(1)} GB` : `${Math.round(storagePerDayGB * 1024)} MB`}</Typography>
                  </Paper>
                </Grid>
                <Grid size={4}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Network (peak)</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{networkMbps > 1 ? `${networkMbps.toFixed(1)} Mbps` : `${Math.round(networkMbps * 1024)} Kbps`}</Typography>
                  </Paper>
                </Grid>
              </Grid>
            )
          })()}
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(15,118,110,0.04)', borderRadius: 1.5, border: '1px solid rgba(15,118,110,0.1)' }}>
            <Typography variant="caption" color="text.secondary">
              <strong>Sizing assumptions:</strong> 0.1 vCPU per concurrent request · 50MB per context · 4 vCPU / 8GB per node. Orchestration layer only.
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
  const requests = result.requests.slice(0, 50)
  const rowHeight = 18
  const width = 800
  const leftMargin = 50

  return (
    <svg width={width} height={requests.length * rowHeight + 30} style={{ display: 'block', minWidth: width }}>
      {[0, 0.25, 0.5, 0.75, 1].map(frac => (
        <g key={frac}>
          <line x1={leftMargin + frac * (width - leftMargin - 10)} y1={0} x2={leftMargin + frac * (width - leftMargin - 10)} y2={requests.length * rowHeight} stroke="#e2e8f0" strokeWidth="0.5" />
          <text x={leftMargin + frac * (width - leftMargin - 10)} y={requests.length * rowHeight + 14} fontSize="9" fill="#94a3b8" textAnchor="middle">
            {Math.round(frac * maxTime)}ms
          </text>
        </g>
      ))}
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
