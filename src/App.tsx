import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import {
  DeleteOutlineRounded,
  DeleteForeverRounded,
  ExpandMoreRounded,
  FavoriteRounded,
  MailOutlineRounded,
  ScienceRounded,
} from '@mui/icons-material'
import {
  MODEL_OPTIONS,
  WORKSPACE_SAMPLES,
  createDefaultAgent,
  createDefaultWorkspacePricing,
} from './features/topology/config'
import type { Agent, Edge, EstimateConfig, WorkspacePricing } from './features/topology/types'
import {
  calculateEstimate,
  createEstimateConfig,
  createId,
  decodeWorkspaceFromUrl,
  formatCurrency,
  formatMetricNumber,
  getModelLabel,
  getTokenEstimateDetails,
  inferEntryAgents,
  parseTopologyDocument,
  sanitizeEdges,
  toNumber,
} from './features/topology/utils'
import { useLocalStorage } from './hooks/useLocalStorage'
import { TokiLogo } from './components/atoms/TokiLogo'
import { TopologyCanvas } from './components/organisms/TopologyCanvas'
import { TokenToolInlineButton } from './components/TokenTool'
import { AgentEditDialog } from './components/AgentEditDialog'
import { ExportActions } from './components/ExportActions'
import { McDetailDialog } from './components/McDetailDialog'
import { EstimateSidebar } from './components/EstimateSidebar'
import { DESTab } from './components/DESTab'
import { PricingTab } from './components/PricingTab'
import { CalculatorPanel } from './components/CalculatorPanel'
import { compileToAEIR } from './features/forecasting/aeir'

const PAYPAL_DONATE_URL = (import.meta.env.VITE_PAYPAL_DONATE_URL ?? '').trim()
const APP_VERSION = __APP_VERSION__

const WORKSPACE_ADJECTIVES = ['Swift', 'Bright', 'Calm', 'Bold', 'Keen', 'Warm', 'Sharp', 'Clear', 'Fresh', 'Vivid', 'Noble', 'Agile', 'Rapid', 'Steady', 'Smart']
const WORKSPACE_NOUNS = ['Falcon', 'Horizon', 'Summit', 'Compass', 'Beacon', 'Orbit', 'Prism', 'Atlas', 'Spark', 'Vertex', 'Pulse', 'Nexus', 'Forge', 'Crest', 'Wave']

function generateWorkspaceName(): string {
  const adj = WORKSPACE_ADJECTIVES[Math.floor(Math.random() * WORKSPACE_ADJECTIVES.length)]
  const noun = WORKSPACE_NOUNS[Math.floor(Math.random() * WORKSPACE_NOUNS.length)]
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${adj} ${noun} — ${date}`
}

export default function App() {
  const isPhone = useMediaQuery('(max-width:600px)')

  // Persisted state
  const [workspaceName, setWorkspaceName] = useLocalStorage<string>('v2:name', () => generateWorkspaceName())
  const [agents, setAgents] = useLocalStorage<Agent[]>('v2:agents', [])
  const [edges, setEdges] = useLocalStorage<Edge[]>('v2:edges', [])
  const [estimateConfig, setEstimateConfig] = useLocalStorage<EstimateConfig>('v2:estimate', () => createEstimateConfig(0, 0, 'month'))
  const [pricing, setPricing] = useLocalStorage<WorkspacePricing>('v2:pricing', createDefaultWorkspacePricing)

  // Import from URL on first load
  useState(() => {
    const shared = decodeWorkspaceFromUrl()
    if (shared) {
      try {
        const parsed = parseTopologyDocument(shared)
        setAgents(parsed.agents)
        setEdges(parsed.edges)
        setEstimateConfig(parsed.estimate)
        setPricing(parsed.pricing)
        // Clean URL without reloading
        window.history.replaceState(null, '', window.location.pathname)
      } catch { /* ignore invalid share links */ }
    }
  })

  // UI state
  const [activeTab, setActiveTab] = useState<'calculator' | 'topology' | 'des' | 'pricing' | 'token-tool' | 'help'>('calculator')
  const [topoSelectedId, setTopoSelectedId] = useState<string | null>(null)
  const [topoEditDialogId, setTopoEditDialogId] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [samplesAnchor, setSamplesAnchor] = useState<HTMLElement | null>(null)
  const [newModelName, setNewModelName] = useState('')
  const [growthMultiplier, setGrowthMultiplier] = useState(1)

  // Derived — apply growth multiplier to estimate config
  const scaledConfig = useMemo((): EstimateConfig => ({
    ...estimateConfig,
    conversationsPerMonth: Math.round(estimateConfig.conversationsPerMonth * growthMultiplier),
  }), [estimateConfig, growthMultiplier])
  const safeEdges = useMemo(() => sanitizeEdges(agents, edges), [agents, edges])
  const entryAgents = useMemo(() => inferEntryAgents(agents, safeEdges), [agents, safeEdges])
  const estimate = useMemo(() => calculateEstimate(agents, scaledConfig, pricing, safeEdges), [agents, scaledConfig, pricing, safeEdges])
  const formatCost = (v: number) => formatCurrency(v, 'EUR')
  const modelOptions = useMemo(() => {
    const allKeys = new Set([...MODEL_OPTIONS.map((o) => o.value), ...Object.keys(pricing.models)])
    return Array.from(allKeys).map((key) => ({ value: key, label: getModelLabel(key) }))
  }, [pricing.models])
  // AEIR simulation result (async, runs in background)
  const [mcReport, setMcReport] = useState<import('./features/forecasting/aeir').ExternalForecastResult | null>(null)
  const [mcRunning, setMcRunning] = useState(false)
  const [mcSimCount, setMcSimCount] = useLocalStorage<number>('v2:mcSims', 200)
  const [simConfig, setSimConfig] = useLocalStorage<import('./features/forecasting/aeir-config').AEIRSimConfig | null>('v2:simConfig', null)
  const [showSimConfig, setShowSimConfig] = useState(false)
  const [showMcHelp, setShowMcHelp] = useState(false)
  const [showMcDetail, setShowMcDetail] = useState(false)

  // Compiled AEIR graph for topology display
  const aeirGraph = useMemo(() => {
    if (agents.length === 0) return null
    try {
      return compileToAEIR(agents, safeEdges, { useCache: true }).graph
    } catch { return null }
  }, [agents, safeEdges])

  // Trigger AEIR forecast when inputs change (debounced 300ms)
  useEffect(() => {
    if (agents.length === 0 || scaledConfig.conversationsPerMonth === 0) { setMcReport(null); return }
    const timer = setTimeout(async () => {
      setMcRunning(true)
      try {
        const { runAEIRForecast } = await import('./features/forecasting/aeir')
        const result = runAEIRForecast(agents, safeEdges, scaledConfig.conversationsPerMonth, pricing, { 
          numSimulations: mcSimCount,
          graphName: workspaceName,
          useCache: false,
          simConfig: simConfig ?? undefined,
        })
        setMcReport(result)
      } catch (err) { 
        console.error('AEIR forecast error:', err)
        setMcReport(null) 
      }
      finally { setMcRunning(false) }
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, safeEdges, scaledConfig.conversationsPerMonth, pricing, mcSimCount, workspaceName, simConfig])

  // --- Actions ---

  const addAgent = () => {
    setAgents((cur) => [...cur, createDefaultAgent(cur.length)])
  }

  const bulkChangeModel = (newModel: string) => {
    setAgents((cur) => cur.map((a) => ({ ...a, model: newModel })))
    setSnackbar({ severity: 'success', message: `All agents switched to ${getModelLabel(newModel)}` })
  }

  const removeAgent = (id: string) => {
    setAgents((cur) => cur.filter((a) => a.id !== id))
    setEdges((cur) => cur.filter((e) => e.sourceId !== id && e.targetId !== id))
  }

  const updateAgent = (id: string, patch: Partial<Agent>) => {
    setAgents((cur) => cur.map((a) => a.id === id ? { ...a, ...patch } : a))
  }

  const addEdge = () => {
    if (agents.length < 2) { setSnackbar({ severity: 'info', message: 'Add at least two agents first.' }); return }
    const source = agents[0]
    const target = agents.find((a) => a.id !== source.id) ?? agents[0]
    setEdges((cur) => [...cur, { id: createId('edge'), sourceId: source.id, targetId: target.id, weight: 1 }])
  }

  const updateEdge = (id: string, patch: Partial<Edge>) => {
    setEdges((cur) => cur.map((e) => e.id === id ? { ...e, ...patch } : e))
  }

  const removeEdge = (id: string) => {
    setEdges((cur) => cur.filter((e) => e.id !== id))
  }

  const resetWorkspace = () => {
    if (!window.confirm('Clear all agents, connections, and settings?')) return
    // Clear storage and reload in one shot — don't let React re-render and write state back
    Object.keys(localStorage).filter((k) => k.startsWith('toki:')).forEach((k) => localStorage.removeItem(k))
    window.location.replace(window.location.pathname)
  }

  const loadSample = (sampleId: string) => {
    const sample = WORKSPACE_SAMPLES.find((s) => s.id === sampleId)
    if (!sample) return
    setAgents(sample.agents.map((a) => ({ ...a })))
    setEdges(sample.edges.map((e) => ({ ...e })))
    const convPerUser = 10
    const users = Math.round(sample.conversationsPerMonth / convPerUser)
    setEstimateConfig(createEstimateConfig(users, convPerUser, 'month'))
    setWorkspaceName(sample.label)
    setSnackbar({ severity: 'success', message: `Loaded: ${sample.label}` })
  }

  // --- Render ---

  return (
    <Box sx={{ height: '100vh', bgcolor: '#f4f6f8', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header — sticky */}
      <Paper elevation={1} sx={{ px: { xs: 2, md: 3 }, py: 1.5, background: 'linear-gradient(135deg, #0b1523 0%, #102238 54%, #143149 100%)', color: '#f7fafc', position: 'sticky', top: 0, zIndex: 1100 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Box onClick={() => setActiveTab('calculator')} sx={{ cursor: 'pointer' }}>
              <TokiLogo light caption="Token Cost Calculator" />
            </Box>
            <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.15)', display: { xs: 'none', md: 'block' } }} />
            <TextField
              variant="standard"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              slotProps={{ input: { sx: { color: '#f7fafc', fontSize: 14, fontWeight: 600, '&::placeholder': { color: 'rgba(255,255,255,0.5)' }, '&::before': { borderBottomColor: 'rgba(255,255,255,0.2) !important' }, '&::after': { borderBottomColor: '#5eead4' }, '&:hover::before': { borderBottomColor: 'rgba(255,255,255,0.5) !important' } } } }}
              placeholder="Click to name this workspace"
              sx={{ display: { xs: 'none', md: 'flex' }, minWidth: 220, '& .MuiInput-root': { cursor: 'text' } }}
            />
          </Stack>
          <Stack direction="row" spacing={0.5}>
            {!__GITHUB_PAGES__ && <Tooltip title="Donate"><IconButton size="small" sx={{ color: '#f7fafc' }} onClick={() => PAYPAL_DONATE_URL ? window.open(PAYPAL_DONATE_URL, '_blank') : setSnackbar({ severity: 'info', message: 'Set VITE_PAYPAL_DONATE_URL to enable.' })}><FavoriteRounded fontSize="small" /></IconButton></Tooltip>}
            {!__GITHUB_PAGES__ && <Tooltip title="Contact"><IconButton size="small" sx={{ color: '#f7fafc' }} onClick={() => setSnackbar({ severity: 'info', message: 'Contact: formspree.io/f/xzdwwwzv' })}><MailOutlineRounded fontSize="small" /></IconButton></Tooltip>}
          </Stack>
        </Stack>
      </Paper>

      {/* Toolbar — sticky below header */}
      <Paper elevation={0} sx={{ px: { xs: 1.5, md: 3 }, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#fff', position: 'sticky', top: { xs: 52, md: 56 }, zIndex: 1099 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <ExportActions
              agents={agents}
              edges={safeEdges}
              estimateConfig={estimateConfig}
              scaledConfig={scaledConfig}
              pricing={pricing}
              estimate={estimate}
              mcReport={mcReport}
              simConfig={simConfig}
              workspaceName={workspaceName}
              onImport={(parsed, importedSimConfig) => {
                setAgents(parsed.agents)
                setEdges(parsed.edges)
                setEstimateConfig(parsed.estimate)
                setPricing(parsed.pricing)
                if (importedSimConfig) setSimConfig(importedSimConfig)
              }}
              onSnackbar={setSnackbar}
            />
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Button size="small" startIcon={<ScienceRounded />} onClick={(e) => setSamplesAnchor(e.currentTarget)}>Samples</Button>
            <Menu
              anchorEl={samplesAnchor}
              open={Boolean(samplesAnchor)}
              onClose={() => setSamplesAnchor(null)}
              slotProps={{ paper: { sx: { maxWidth: 380 } } }}
            >
              {WORKSPACE_SAMPLES.map((s) => (
                <MenuItem key={s.id} onClick={() => { loadSample(s.id); setSamplesAnchor(null) }} sx={{ whiteSpace: 'normal', py: 1.25 }}>
                  <ListItemText
                    primary={s.label}
                    secondary={s.description}
                    slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'caption' } }}
                  />
                </MenuItem>
              ))}
            </Menu>
            <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
            <Button size="small" color="error" startIcon={<DeleteForeverRounded />} onClick={resetWorkspace}>Reset</Button>
          </Stack>
          <Box sx={{ flexGrow: 1 }} />
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant={isPhone ? 'scrollable' : 'standard'} scrollButtons="auto" sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0, px: { xs: 1.5, sm: 2 }, fontSize: { xs: 12, sm: 13 } } }}>
            <Tab label="Calculator" value="calculator" />
            <Tab label="Topology" value="topology" />
            <Tab label="DES" value="des" />
            <Tab disabled icon={<Divider orientation="vertical" sx={{ height: 20 }} />} sx={{ minWidth: 8, px: 0, opacity: '1 !important' }} value="" />
            <Tab label="Pricing" value="pricing" />
            <Tab label="Token Tool" value="token-tool" />
            <Tab label="Help" value="help" />
          </Tabs>
        </Stack>
      </Paper>

      <Container maxWidth="xl" sx={{ py: 3, pb: 7, flex: 1, overflowY: 'auto', scrollBehavior: 'smooth' }}>
        {activeTab === 'calculator' ? (
          <Grid container spacing={3}>
            {/* Left: Agent line items */}
            <CalculatorPanel
              agents={agents}
              edges={safeEdges}
              estimateConfig={estimateConfig}
              setEstimateConfig={setEstimateConfig}
              pricing={pricing}
              modelOptions={modelOptions}
              estimate={estimate}
              addAgent={addAgent}
              removeAgent={removeAgent}
              updateAgent={updateAgent}
              addEdge={addEdge}
              updateEdge={updateEdge}
              removeEdge={removeEdge}
              setSnackbar={setSnackbar}
              formatCost={formatCost}
              bulkChangeModel={bulkChangeModel}
              onLoadSample={(e) => setSamplesAnchor(e.currentTarget)}
              renderAgentCard={(agent, costPerMonth) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  costPerMonth={costPerMonth}
                  formatCost={formatCost}
                  modelOptions={modelOptions}
                  onUpdate={(patch) => updateAgent(agent.id, patch)}
                  onRemove={() => removeAgent(agent.id)}
                />
              )}
            />

            <EstimateSidebar
              estimate={estimate}
              mcReport={mcReport}
              mcRunning={mcRunning}
              mcSimCount={mcSimCount}
              setMcSimCount={setMcSimCount}
              simConfig={simConfig}
              setSimConfig={setSimConfig}
              showMcHelp={showMcHelp}
              setShowMcHelp={setShowMcHelp}
              showSimConfig={showSimConfig}
              setShowSimConfig={setShowSimConfig}
              showMcDetail={showMcDetail}
              setShowMcDetail={setShowMcDetail}
              estimateConfig={estimateConfig}
              scaledConfig={scaledConfig}
              growthMultiplier={growthMultiplier}
              setGrowthMultiplier={setGrowthMultiplier}
              agents={agents}
              formatCost={formatCost}
            />
          </Grid>
        ) : activeTab === 'topology' ? (
          /* Topology tab */
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: topoSelectedId ? 8 : 12 }}>
              <Paper sx={{ p: 2.5 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Box>
                    <Typography variant="h6">System topology</Typography>
                    <Typography variant="body2" color="text.secondary">Visualize the topology. </Typography>
                  </Box>
                  {topoSelectedId && (
                    <Button size="small" variant="outlined" onClick={() => setTopoSelectedId(null)}>Clear selection</Button>
                  )}
                </Stack>
                <TopologyCanvas
                  agents={agents}
                  edges={safeEdges}
                  entryAgents={entryAgents}
                  selectedAgentId={topoSelectedId}
                  report={null}
                  workspacePricing={pricing}
                  onSelectAgent={setTopoSelectedId}
                  onEditAgent={setTopoEditDialogId}
                  aeirGraph={aeirGraph}
                />
              </Paper>

              {/* AEIR JSON View */}
              {aeirGraph && (
                <Paper sx={{ p: 2.5, mt: 2 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Typography variant="h6">AEIR Graph (JSON)</Typography>
                    <Button size="small" variant="outlined" onClick={() => { navigator.clipboard.writeText(JSON.stringify(aeirGraph, null, 2)); setSnackbar({ severity: 'success', message: 'AEIR JSON copied.' }) }}>Copy JSON</Button>
                  </Stack>
                  <Box sx={{ maxHeight: 400, overflowY: 'auto', bgcolor: '#0f172a', borderRadius: 2, p: 2 }}>
                    <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: '#e2e8f0', fontFamily: 'JetBrains Mono, Fira Code, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(aeirGraph, null, 2)}
                    </pre>
                  </Box>
                </Paper>
              )}
            </Grid>
            {topoSelectedId && (() => {
              const selectedAgent = agents.find((a) => a.id === topoSelectedId)
              const agentCost = estimate.agents.find((a) => a.id === topoSelectedId)
              if (!selectedAgent) return null
              const incoming = safeEdges.filter((e) => e.targetId === topoSelectedId)
              const outgoing = safeEdges.filter((e) => e.sourceId === topoSelectedId)
              const otherAgents = agents.filter((a) => a.id !== topoSelectedId)
              return (
                <Grid size={{ xs: 12, lg: 4 }}>
                  <Paper sx={{ p: 2, position: { lg: 'sticky' }, top: { lg: 16 } }}>
                    {/* Header with cost badge */}
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                      <Chip size="small" label={`${Math.round((agentCost?.trafficShare ?? 1) * 100)}% traffic`} color="primary" variant="outlined" />
                      <Chip size="small" label={`${formatCost(agentCost?.costPerMonth ?? 0)}/mo`} color="success" />
                    </Stack>

                    {/* Editable fields */}
                    <Stack spacing={1.5}>
                      <TextField size="small" label="Name" value={selectedAgent.name} onChange={(e) => updateAgent(topoSelectedId, { name: e.target.value })} fullWidth />
                      <FormControl size="small" fullWidth>
                        <InputLabel>Model</InputLabel>
                        <Select label="Model" value={selectedAgent.model} onChange={(e) => updateAgent(topoSelectedId, { model: String(e.target.value) })}>
                          {modelOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <Grid container spacing={1}>
                        <Grid size={4}><TextField size="small" type="number" label="Calls/conv" value={selectedAgent.callsPerConversation} onChange={(e) => updateAgent(topoSelectedId, { callsPerConversation: Math.max(0, toNumber(e.target.value, 1)) })} fullWidth /></Grid>
                        <Grid size={4}><TextField size="small" type="number" label="In tok" value={selectedAgent.inputTokensPerCall} onChange={(e) => updateAgent(topoSelectedId, { inputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, 0))) })} fullWidth /></Grid>
                        <Grid size={4}><TextField size="small" type="number" label="Out tok" value={selectedAgent.outputTokensPerCall} onChange={(e) => updateAgent(topoSelectedId, { outputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, 0))) })} fullWidth /></Grid>
                      </Grid>
                      <Grid container spacing={1}>
                        <Grid size={4}><TextField size="small" type="number" label="MCP calls" value={selectedAgent.mcpCalls} onChange={(e) => updateAgent(topoSelectedId, { mcpCalls: Math.max(0, Math.round(toNumber(e.target.value, 0))) })} fullWidth /></Grid>
                        <Grid size={4}><TextField size="small" type="number" label="MCP in" value={selectedAgent.mcpInputTokensPerCall} onChange={(e) => updateAgent(topoSelectedId, { mcpInputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, 0))) })} fullWidth disabled={selectedAgent.mcpCalls === 0} /></Grid>
                        <Grid size={4}><TextField size="small" type="number" label="MCP out" value={selectedAgent.mcpOutputTokensPerCall} onChange={(e) => updateAgent(topoSelectedId, { mcpOutputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, 0))) })} fullWidth disabled={selectedAgent.mcpCalls === 0} /></Grid>
                      </Grid>
                    </Stack>

                    {/* Computed metrics */}
                    <Box sx={{ mt: 1.5, p: 1, bgcolor: 'rgba(15,118,110,0.04)', borderRadius: 1 }}>
                      <Grid container spacing={0.5}>
                        <Grid size={6}><Typography variant="caption" color="text.secondary">Tokens/mo</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{formatMetricNumber(agentCost?.totalTokensPerMonth ?? 0)}</Typography></Grid>
                        <Grid size={6}><Typography variant="caption" color="text.secondary">Calls/mo</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{formatMetricNumber(agentCost?.callsPerMonth ?? 0)}</Typography></Grid>
                      </Grid>
                    </Box>

                    {/* AEIR Execution Info */}
                    {(() => {
                      const aeirNode = aeirGraph?.nodes.find(n => n.id === topoSelectedId)
                      const mcNode = mcReport?.dominant_nodes?.find(n => n.node_id === topoSelectedId)
                      if (!aeirNode) return null
                      return (
                        <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(99,102,241,0.04)', borderRadius: 1, border: '1px solid rgba(99,102,241,0.1)' }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: '#4f46e5' }}>AEIR Execution</Typography>
                          <Grid container spacing={0.5}>
                            <Grid size={6}><Typography variant="caption" color="text.secondary">Node type</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>{aeirNode.type}</Typography></Grid>
                            <Grid size={6}><Typography variant="caption" color="text.secondary">Exec probability</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{Math.round(aeirNode.execution_probability * 100)}%</Typography></Grid>
                            <Grid size={6}><Typography variant="caption" color="text.secondary">Input (mean)</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{formatMetricNumber(aeirNode.input_dist.mean)}</Typography></Grid>
                            <Grid size={6}><Typography variant="caption" color="text.secondary">Output (mean)</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{formatMetricNumber(aeirNode.output_dist.mean)}</Typography></Grid>
                            <Grid size={6}><Typography variant="caption" color="text.secondary">Calls (mean)</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{aeirNode.calls_per_execution.mean.toFixed(1)}</Typography></Grid>
                            <Grid size={6}><Typography variant="caption" color="text.secondary">Cache rate</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{Math.round(aeirNode.cache_rate * 100)}%</Typography></Grid>
                            {mcNode && (
                              <>
                                <Grid size={6}><Typography variant="caption" color="text.secondary">Cost share</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: mcNode.cost_fraction > 0.3 ? 'error.main' : 'text.primary' }}>{Math.round(mcNode.cost_fraction * 100)}%</Typography></Grid>
                                <Grid size={6}><Typography variant="caption" color="text.secondary">MC tokens</Typography><Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>{formatMetricNumber(mcNode.tokens_expected)}</Typography></Grid>
                              </>
                            )}
                          </Grid>
                          {mcNode?.is_cost_spike && (
                            <Chip size="small" label="⚡ Cost spike (p99 > 3× p50)" color="warning" sx={{ mt: 0.75, fontSize: 10 }} />
                          )}
                        </Box>
                      )
                    })()}

                    <Divider sx={{ my: 1.5 }} />

                    {/* Connections — editable */}
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>Incoming ({incoming.length})</Typography>
                    {incoming.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">Entry point — receives all traffic</Typography>
                    ) : (
                      <Stack spacing={0.5}>
                        {incoming.map((e) => (
                          <Stack key={e.id} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                            <Chip size="small" label={agents.find((a) => a.id === e.sourceId)?.name ?? '?'} variant="outlined" onClick={() => setTopoSelectedId(e.sourceId)} sx={{ cursor: 'pointer', flex: 1 }} />
                            <TextField size="small" type="number" value={Math.round(e.weight * 100)} sx={{ width: 60 }} slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }} onChange={(ev) => updateEdge(e.id, { weight: Math.max(0, Math.min(1, toNumber(ev.target.value, 0) / 100)) })} />
                            <Typography variant="caption">%</Typography>
                            <IconButton size="small" color="error" onClick={() => removeEdge(e.id)}><DeleteOutlineRounded sx={{ fontSize: 14 }} /></IconButton>
                          </Stack>
                        ))}
                      </Stack>
                    )}

                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mt: 1.5, mb: 0.5 }}>Outgoing ({outgoing.length})</Typography>
                    {outgoing.map((e) => (
                      <Stack key={e.id} direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.5 }}>
                        <Chip size="small" label={agents.find((a) => a.id === e.targetId)?.name ?? '?'} variant="outlined" color="primary" onClick={() => setTopoSelectedId(e.targetId)} sx={{ cursor: 'pointer', flex: 1 }} />
                        <TextField size="small" type="number" value={Math.round(e.weight * 100)} sx={{ width: 60 }} slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }} onChange={(ev) => updateEdge(e.id, { weight: Math.max(0, Math.min(1, toNumber(ev.target.value, 0) / 100)) })} />
                        <Typography variant="caption">%</Typography>
                        <IconButton size="small" color="error" onClick={() => removeEdge(e.id)}><DeleteOutlineRounded sx={{ fontSize: 14 }} /></IconButton>
                      </Stack>
                    ))}

                    {/* Add connection */}
                    {otherAgents.length > 0 && (
                      <Button size="small" variant="text" sx={{ mt: 1, fontSize: 11 }} onClick={() => {
                        const target = otherAgents[0]
                        setEdges((cur) => [...cur, { id: createId('edge'), sourceId: topoSelectedId, targetId: target.id, weight: 0.5 }])
                      }}>+ Add outgoing connection</Button>
                    )}

                    <Divider sx={{ my: 1.5 }} />

                    {/* Delete agent */}
                    <Button size="small" color="error" variant="outlined" fullWidth onClick={() => { removeAgent(topoSelectedId); setTopoSelectedId(null) }}>
                      Delete this agent
                    </Button>
                  </Paper>
                </Grid>
              )
            })()}
          </Grid>
        ) : activeTab === 'des' ? (
          /* DES Simulator tab */
          <DESTab agents={agents} edges={safeEdges} pricing={pricing} />
        ) : activeTab === 'token-tool' ? (
          /* Token Tool tab — inline version */
          <TokenToolTab />
        ) : activeTab === 'pricing' ? (
          /* Pricing tab */
          <PricingTab
            pricing={pricing}
            setPricing={setPricing}
            agents={agents}
            modelOptions={modelOptions}
            newModelName={newModelName}
            setNewModelName={setNewModelName}
          />
        ) : (
          /* Help tab — embedded reveal.js presentation */
          <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 3, position: 'relative' }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => window.open('/help.html', '_blank')}
              sx={{ position: 'absolute', top: 12, right: 12, zIndex: 10, bgcolor: 'rgba(15, 23, 42, 0.85)', '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.95)' } }}
            >
              Open fullscreen ↗
            </Button>
            <Box
              component="iframe"
              src="/help.html"
              sx={{ width: '100%', height: 'calc(100vh - 180px)', border: 'none', display: 'block' }}
              title="Toki Help & Presentation"
            />
          </Paper>
        )}
      </Container>

      {/* Footer — fixed at bottom */}
      <Box component="footer" sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, py: 1, px: 3, borderTop: '1px solid', borderColor: 'divider', bgcolor: '#fff', zIndex: 1000 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
          <Typography variant="caption" color="text.secondary">
            Toki v{APP_VERSION} — Token cost calculator for agentic systems
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Created with tokens.
          </Typography>
        </Stack>
      </Box>

      <Snackbar open={Boolean(snackbar)} autoHideDuration={3500} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: isPhone ? 'top' : 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar(null)} severity={snackbar?.severity ?? 'info'} variant="filled" sx={{ borderRadius: 12 }}>
          {snackbar?.message ?? ''}
        </Alert>
      </Snackbar>

      {/* Agent Edit Dialog (from topology double-click) */}
      <AgentEditDialog
        agent={agents.find(a => a.id === topoEditDialogId) ?? null}
        open={Boolean(topoEditDialogId)}
        onClose={() => setTopoEditDialogId(null)}
        onSave={(id, patch) => updateAgent(id, patch)}
        onDelete={(id) => { removeAgent(id); setTopoSelectedId(null) }}
        modelOptions={modelOptions}
      />

      {/* Monte Carlo Detail Modal */}
      <McDetailDialog open={showMcDetail} onClose={() => setShowMcDetail(false)} mcReport={mcReport} currency={pricing.currency} />
    </Box>
  )
}

// --- Token Tool Tab (inline) ---

function TokenToolTab() {
  const [text, setText] = useState('')
  const details = getTokenEstimateDetails(text)

  return (
    <Paper sx={{ p: { xs: 2, md: 3 }, maxWidth: 800 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>Token Converter</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Paste any text, JSON, prompt template, or system message to estimate its token count. Use this to figure out the right values for your agent input/output token fields.
      </Typography>

      <TextField
        fullWidth
        multiline
        minRows={8}
        maxRows={20}
        placeholder={'Paste your text here...\n\nExamples:\n- A system prompt\n- A JSON API response\n- A user message with context\n- A retrieved document chunk'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        sx={{ mb: 2 }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
          <Chip label={`${details.tokens.toLocaleString()} tokens`} color="primary" sx={{ fontWeight: 700, fontSize: 15 }} />
          <Chip label={`${details.words.toLocaleString()} words`} variant="outlined" />
          <Chip label={`${details.characters.toLocaleString()} characters`} variant="outlined" />
        </Stack>
        {text.length > 0 && (
          <Button size="small" onClick={() => setText('')}>Clear</Button>
        )}
      </Stack>

      <Divider sx={{ my: 2.5 }} />

      <Typography variant="caption" color="text.secondary">
        Token estimates use a lightweight character + word heuristic. Accuracy is within ~10% of tiktoken for English text. Good enough for cost planning — not for exact API billing.
      </Typography>
    </Paper>
  )
}

// --- Agent Card Component (collapsible) ---

function AgentCard(props: {
  agent: Agent
  costPerMonth: number
  formatCost: (v: number) => string
  modelOptions: Array<{ value: string; label: string }>
  onUpdate: (patch: Partial<Agent>) => void
  onRemove: () => void
}) {
  const { agent } = props
  const [expanded, setExpanded] = useState(true)

  return (
    <Card variant="outlined" sx={{ borderColor: 'rgba(19, 34, 56, 0.1)' }}>
      {/* Collapsed header — always visible */}
      <Stack
        direction="row"
        sx={{ px: 2, py: 1.5, justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <IconButton size="small" sx={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <ExpandMoreRounded fontSize="small" />
          </IconButton>
          <Box>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>{agent.name}</Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 0.25 }}>
              <Chip size="small" label={getModelLabel(agent.model)} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
              {agent.ragEnabled && <Chip size="small" label="RAG" color="success" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
              {agent.mcpCalls > 0 && <Chip size="small" label={`MCP ×${agent.mcpCalls}`} color="secondary" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
              <Chip size="small" label={`${agent.callsPerConversation} calls/conv`} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
            </Stack>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <Chip label={props.formatCost(props.costPerMonth) + '/mo'} color="primary" size="small" />
          <IconButton size="small" color="error" onClick={props.onRemove} aria-label="Remove agent">
            <DeleteOutlineRounded fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {/* Expandable body */}
      <Collapse in={expanded}>
        <CardContent sx={{ pt: 0, pb: '16px !important' }}>
          {/* Core fields */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth size="small" label="Name" value={agent.name} onChange={(e) => props.onUpdate({ name: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Model</InputLabel>
                <Select label="Model" value={agent.model} onChange={(e) => props.onUpdate({ model: String(e.target.value) })}>
                  {props.modelOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth size="small" type="number" label="LLM calls / conversation" value={agent.callsPerConversation} slotProps={{ htmlInput: { min: 0, step: 1 } }} onChange={(e) => props.onUpdate({ callsPerConversation: Math.max(0, toNumber(e.target.value, agent.callsPerConversation)) })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack direction="row" sx={{ alignItems: 'flex-start' }}>
                <TextField fullWidth size="small" type="number" label="Input tokens / call" value={agent.inputTokensPerCall} helperText="Prompt + context sent to the model per call." onChange={(e) => props.onUpdate({ inputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.inputTokensPerCall))) })} />
                <TokenToolInlineButton onResult={(tokens) => props.onUpdate({ inputTokensPerCall: tokens })} label="Set as input tokens" />
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack direction="row" sx={{ alignItems: 'flex-start' }}>
                <TextField fullWidth size="small" type="number" label="Output tokens / call" value={agent.outputTokensPerCall} helperText="Completion tokens generated per call." onChange={(e) => props.onUpdate({ outputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.outputTokensPerCall))) })} />
                <TokenToolInlineButton onResult={(tokens) => props.onUpdate({ outputTokensPerCall: tokens })} label="Set as output tokens" />
              </Stack>
            </Grid>
          </Grid>

          {/* MCP Tools section */}
          <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(217, 119, 6, 0.03)', border: '1px solid rgba(217, 119, 6, 0.12)', borderRadius: 1.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'secondary.dark' }}>MCP Tool Calls</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth size="small" type="number"
                  label="Tool calls / conversation"
                  value={agent.mcpCalls}
                  helperText="How many MCP tools this agent invokes per conversation."
                  onChange={(e) => props.onUpdate({ mcpCalls: Math.max(0, Math.round(toNumber(e.target.value, agent.mcpCalls))) })}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth size="small" type="number"
                  label="Output tokens / tool call"
                  value={agent.mcpOutputTokensPerCall}
                  disabled={agent.mcpCalls === 0}
                  helperText="Tokens generated per tool response."
                  onChange={(e) => props.onUpdate({ mcpOutputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.mcpOutputTokensPerCall))) })}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth size="small" type="number"
                  label="Input tokens / tool call"
                  value={agent.mcpInputTokensPerCall}
                  disabled={agent.mcpCalls === 0}
                  helperText="Tool result fed back as context."
                  onChange={(e) => props.onUpdate({ mcpInputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.mcpInputTokensPerCall))) })}
                />
              </Grid>
            </Grid>
          </Box>

          {/* Advanced: History growth + Prompt caching */}
          <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(19, 34, 56, 0.02)', border: '1px solid rgba(19, 34, 56, 0.08)', borderRadius: 1.5 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Advanced cost factors</Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth size="small" type="number"
                  label="History growth factor"
                  value={agent.historyGrowthFactor}
                  helperText="Context grows per turn (1.0 = flat, 1.3 = 30% growth). Affects multi-call agents."
                  slotProps={{ htmlInput: { step: 0.1, min: 1, max: 3 } }}
                  onChange={(e) => props.onUpdate({ historyGrowthFactor: Math.max(1, Math.min(3, toNumber(e.target.value, agent.historyGrowthFactor))) })}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth size="small" type="number"
                  label="Prompt cache hit rate (%)"
                  value={agent.promptCachePercent}
                  helperText="% of input tokens served from cache (90% cost reduction on cached portion)."
                  slotProps={{ htmlInput: { step: 5, min: 0, max: 100 } }}
                  onChange={(e) => props.onUpdate({ promptCachePercent: Math.max(0, Math.min(100, Math.round(toNumber(e.target.value, agent.promptCachePercent)))) })}
                />
              </Grid>
            </Grid>
          </Box>

          {/* RAG section */}
          <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(47, 133, 90, 0.03)', border: '1px solid rgba(47, 133, 90, 0.12)', borderRadius: 1.5 }}>
            <FormControlLabel
              control={<Switch size="small" checked={agent.ragEnabled} onChange={(e) => props.onUpdate({ ragEnabled: e.target.checked, ragChunks: e.target.checked && agent.ragChunks === 0 ? 4 : agent.ragChunks, ragChunkTokens: e.target.checked && agent.ragChunkTokens === 0 ? 150 : agent.ragChunkTokens, ragEmbeddingTokens: e.target.checked && agent.ragEmbeddingTokens === 0 ? 60 : agent.ragEmbeddingTokens })} />}
              label={<Typography variant="subtitle2" sx={{ color: 'success.dark' }}>RAG Retrieval</Typography>}
            />
            {agent.ragEnabled && (
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" type="number" label="Chunks retrieved / call" value={agent.ragChunks} helperText="Number of document chunks fetched." onChange={(e) => props.onUpdate({ ragChunks: Math.max(0, toNumber(e.target.value, agent.ragChunks)) })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" type="number" label="Tokens per chunk" value={agent.ragChunkTokens} helperText="Average size of each retrieved chunk." onChange={(e) => props.onUpdate({ ragChunkTokens: Math.max(0, Math.round(toNumber(e.target.value, agent.ragChunkTokens))) })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth size="small" type="number" label="Embedding tokens / retrieval" value={agent.ragEmbeddingTokens} helperText="Tokens used for the embedding query." onChange={(e) => props.onUpdate({ ragEmbeddingTokens: Math.max(0, Math.round(toNumber(e.target.value, agent.ragEmbeddingTokens))) })} />
                </Grid>
              </Grid>
            )}
            {!agent.ragEnabled && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Enable to add retrieval-augmented context tokens to the input cost.
              </Typography>
            )}
          </Box>
        </CardContent>
      </Collapse>
    </Card>
  )
}
