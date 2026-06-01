import { ChangeEvent, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import {
  AddRounded,
  DeleteOutlineRounded,
  DeleteForeverRounded,
  ExpandMoreRounded,
  FavoriteRounded,
  FileDownloadOutlined,
  FileUploadOutlined,
  MailOutlineRounded,
  ContentCopyRounded,
  ScienceRounded,
} from '@mui/icons-material'
import {
  MODEL_OPTIONS,
  WORKSPACE_SAMPLES,
  createDefaultAgent,
  createDefaultWorkspacePricing,
} from './features/topology/config'
import type { Agent, CurrencyCode, Edge, EstimateConfig, WorkspacePricing } from './features/topology/types'
import {
  calculateEstimate,
  createId,
  createTopologyDocument,
  formatCurrency,
  formatMetricNumber,
  getModelLabel,
  getPricing,
  inferEntryAgents,
  parseTopologyDocument,
  sanitizeEdges,
  toNumber,
} from './features/topology/utils'
import { useLocalStorage } from './hooks/useLocalStorage'
import { TokiLogo } from './components/atoms/TokiLogo'
import { TopologyCanvas } from './components/organisms/TopologyCanvas'

const PAYPAL_DONATE_URL = (import.meta.env.VITE_PAYPAL_DONATE_URL ?? '').trim()

export default function App() {
  const isPhone = useMediaQuery('(max-width:600px)')

  // Persisted state
  const [agents, setAgents] = useLocalStorage<Agent[]>('v2:agents', [])
  const [edges, setEdges] = useLocalStorage<Edge[]>('v2:edges', [])
  const [estimateConfig, setEstimateConfig] = useLocalStorage<EstimateConfig>('v2:estimate', { conversationsPerMonth: 0 })
  const [pricing, setPricing] = useLocalStorage<WorkspacePricing>('v2:pricing', createDefaultWorkspacePricing)

  // UI state
  const [activeTab, setActiveTab] = useState<'calculator' | 'topology' | 'pricing'>('calculator')
  const [topoSelectedId, setTopoSelectedId] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [samplesAnchor, setSamplesAnchor] = useState<HTMLElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Derived
  const safeEdges = useMemo(() => sanitizeEdges(agents, edges), [agents, edges])
  const entryAgents = useMemo(() => inferEntryAgents(agents, safeEdges), [agents, safeEdges])
  const estimate = useMemo(() => calculateEstimate(agents, estimateConfig, pricing), [agents, estimateConfig, pricing])
  const formatCost = (v: number) => formatCurrency(v, pricing.currency)

  // --- Actions ---

  const addAgent = () => {
    setAgents((cur) => [...cur, createDefaultAgent(cur.length)])
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
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('toki:'))
    keys.forEach((k) => localStorage.removeItem(k))
    window.location.reload()
  }

  const loadSample = (sampleId: string) => {
    const sample = WORKSPACE_SAMPLES.find((s) => s.id === sampleId)
    if (!sample) return
    setAgents(sample.agents.map((a) => ({ ...a })))
    setEdges(sample.edges.map((e) => ({ ...e })))
    setEstimateConfig({ conversationsPerMonth: sample.conversationsPerMonth })
    setSnackbar({ severity: 'success', message: `Loaded: ${sample.label}` })
  }

  const exportWorkspace = () => {
    const doc = createTopologyDocument(agents, safeEdges, estimateConfig, pricing)
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `toki-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setSnackbar({ severity: 'success', message: 'Workspace exported.' })
  }

  const importWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    try {
      const parsed = parseTopologyDocument(JSON.parse(await file.text()))
      setAgents(parsed.agents)
      setEdges(parsed.edges)
      setEstimateConfig(parsed.estimate)
      setPricing(parsed.pricing)
      setSnackbar({ severity: 'success', message: `Imported: ${parsed.agents.length} agents.` })
    } catch (err) {
      setSnackbar({ severity: 'error', message: err instanceof Error ? err.message : 'Import failed.' })
    } finally {
      event.currentTarget.value = ''
    }
  }

  const copyEstimate = async () => {
    const lines = [
      `Monthly cost: ${formatCost(estimate.totalCostPerMonth)}`,
      `Cost per conversation: ${formatCost(estimate.costPerConversation)}`,
      `Monthly tokens: ${formatMetricNumber(estimate.totalTokensPerMonth)}`,
      `Conversations/month: ${estimateConfig.conversationsPerMonth.toLocaleString()}`,
      `Agents: ${agents.length}`,
      '',
      ...estimate.agents.map((a) => `  ${a.name} (${getModelLabel(a.model)}): ${formatCost(a.costPerMonth)}/mo — ${formatMetricNumber(a.totalTokensPerMonth)} tokens`),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setSnackbar({ severity: 'success', message: 'Estimate copied.' })
    } catch { setSnackbar({ severity: 'error', message: 'Copy failed.' }) }
  }

  // --- Render ---

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f8' }}>
      {/* Header */}
      <Paper elevation={0} sx={{ px: { xs: 2, md: 3 }, py: 1.5, background: 'linear-gradient(135deg, #0b1523 0%, #102238 54%, #143149 100%)', color: '#f7fafc' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <TokiLogo light caption="Token Cost Calculator" />
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Donate"><IconButton size="small" sx={{ color: '#f7fafc' }} onClick={() => PAYPAL_DONATE_URL ? window.open(PAYPAL_DONATE_URL, '_blank') : setSnackbar({ severity: 'info', message: 'Set VITE_PAYPAL_DONATE_URL to enable.' })}><FavoriteRounded fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Contact"><IconButton size="small" sx={{ color: '#f7fafc' }} onClick={() => setSnackbar({ severity: 'info', message: 'Contact: formspree.io/f/xzdwwwzv' })}><MailOutlineRounded fontSize="small" /></IconButton></Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {/* Toolbar */}
      <Paper elevation={0} sx={{ px: { xs: 2, md: 3 }, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#fff' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileInputRef} hidden type="file" accept=".json" onChange={importWorkspace} />
          <Button size="small" startIcon={<FileUploadOutlined />} onClick={() => fileInputRef.current?.click()}>Import</Button>
          <Button size="small" startIcon={<FileDownloadOutlined />} onClick={exportWorkspace}>Export</Button>
          <Divider orientation="vertical" flexItem />
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
          <Divider orientation="vertical" flexItem />
          <Button size="small" color="error" startIcon={<DeleteForeverRounded />} onClick={resetWorkspace}>Reset</Button>
          <Box sx={{ flexGrow: 1 }} />
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0 } }}>
            <Tab label="Calculator" value="calculator" />
            <Tab label="Topology" value="topology" />
            <Tab label="Pricing" value="pricing" />
          </Tabs>
        </Stack>
      </Paper>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {activeTab === 'calculator' ? (
          <Grid container spacing={3}>
            {/* Left: Agent line items */}
            <Grid size={{ xs: 12, lg: 8 }}>
              <Stack spacing={2}>
                {/* Volume input */}
                <Paper sx={{ p: 2.5 }}>
                  <Typography variant="h6" sx={{ mb: 1.5 }}>Monthly volume</Typography>
                  <TextField
                    fullWidth
                    type="number"
                    label="Conversations per month"
                    placeholder="e.g. 50000"
                    value={estimateConfig.conversationsPerMonth || ''}
                    helperText="Total end-user conversations your system handles monthly."
                    onChange={(e) => setEstimateConfig({ conversationsPerMonth: Math.max(0, Math.round(toNumber(e.target.value, 0))) })}
                  />
                </Paper>

                {/* Agents */}
                <Paper sx={{ p: 2.5 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box>
                      <Typography variant="h6">Agents</Typography>
                      <Typography variant="body2" color="text.secondary">Each agent is a cost line item. Add the LLM agents in your system.</Typography>
                    </Box>
                    <Button startIcon={<AddRounded />} variant="contained" onClick={addAgent}>Add agent</Button>
                  </Stack>

                  {agents.length === 0 ? (
                    <Alert severity="info">No agents yet. Add your first agent to start estimating costs.</Alert>
                  ) : (
                    <Stack spacing={2}>
                      {agents.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          costPerMonth={estimate.agents.find((a) => a.id === agent.id)?.costPerMonth ?? 0}
                          formatCost={formatCost}
                          onUpdate={(patch) => updateAgent(agent.id, patch)}
                          onRemove={() => removeAgent(agent.id)}
                        />
                      ))}
                    </Stack>
                  )}
                </Paper>

                {/* Connections */}
                {agents.length >= 2 && (
                <Paper sx={{ p: 2.5 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box>
                      <Typography variant="h6">Connections</Typography>
                      <Typography variant="body2" color="text.secondary">Define how agents hand off work to each other.</Typography>
                    </Box>
                    <Button startIcon={<AddRounded />} variant="outlined" onClick={addEdge}>Add connection</Button>
                  </Stack>
                  {safeEdges.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No connections. Each agent operates independently.</Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {safeEdges.map((edge) => (
                        <Paper key={edge.id} variant="outlined" sx={{ p: 1.5 }}>
                          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                              <InputLabel>From</InputLabel>
                              <Select label="From" value={edge.sourceId} onChange={(e) => updateEdge(edge.id, { sourceId: String(e.target.value) })}>
                                {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                              </Select>
                            </FormControl>
                            <Typography color="text.secondary">→</Typography>
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                              <InputLabel>To</InputLabel>
                              <Select label="To" value={edge.targetId} onChange={(e) => updateEdge(edge.id, { targetId: String(e.target.value) })}>
                                {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                              </Select>
                            </FormControl>
                            <TextField size="small" type="number" label="Weight" value={edge.weight} sx={{ width: 90 }} slotProps={{ htmlInput: { step: 0.1, min: 0 } }} onChange={(e) => updateEdge(edge.id, { weight: Math.max(0, toNumber(e.target.value, edge.weight)) })} />
                            <IconButton size="small" color="error" onClick={() => removeEdge(edge.id)}><DeleteOutlineRounded fontSize="small" /></IconButton>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Paper>
                )}
              </Stack>
            </Grid>

            {/* Right: Cost summary (sticky) */}
            <Grid size={{ xs: 12, lg: 4 }}>
              <Paper sx={{ p: 2.5, position: { lg: 'sticky' }, top: { lg: 16 } }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Estimated cost</Typography>
                  <Tooltip title="Copy estimate">
                    <IconButton size="small" onClick={copyEstimate} disabled={agents.length === 0}>
                      <ContentCopyRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>

                <Stack spacing={2}>
                  <Box sx={{ textAlign: 'center', py: 2, bgcolor: 'rgba(15, 118, 110, 0.04)', borderRadius: 2 }}>
                    <Typography variant="overline" color="text.secondary">Monthly cost</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
                      {formatCost(estimate.totalCostPerMonth)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatCost(estimate.costPerConversation)} per conversation
                    </Typography>
                  </Box>

                  <Divider />

                  <Grid container spacing={1.5}>
                    <Grid size={6}>
                      <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10 }}>Input tokens/mo</Typography>
                      <Typography variant="subtitle2">{formatMetricNumber(estimate.totalInputTokens)}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10 }}>Output tokens/mo</Typography>
                      <Typography variant="subtitle2">{formatMetricNumber(estimate.totalOutputTokens)}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10 }}>Embedding tokens/mo</Typography>
                      <Typography variant="subtitle2">{formatMetricNumber(estimate.totalEmbeddingTokens)}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10 }}>Total tokens/mo</Typography>
                      <Typography variant="subtitle2">{formatMetricNumber(estimate.totalTokensPerMonth)}</Typography>
                    </Grid>
                  </Grid>

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
                            <Typography variant="caption" color="text.secondary">{getModelLabel(a.model)}</Typography>
                          </Box>
                          <Typography variant="subtitle2">{formatCost(a.costPerMonth)}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                  )}

                  <Divider />

                  <FormControl size="small" fullWidth>
                    <InputLabel>Currency</InputLabel>
                    <Select label="Currency" value={pricing.currency} onChange={(e) => setPricing((c) => ({ ...c, currency: e.target.value as CurrencyCode }))}>
                      <MenuItem value="USD">USD ($)</MenuItem>
                      <MenuItem value="EUR">EUR (€)</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        ) : activeTab === 'topology' ? (
          /* Topology tab */
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>System topology</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Visual map of agents and connections. Click a node to highlight its edges.
            </Typography>
            <TopologyCanvas
              agents={agents}
              edges={safeEdges}
              entryAgents={entryAgents}
              selectedAgentId={topoSelectedId}
              report={null}
              workspacePricing={pricing}
              onSelectAgent={setTopoSelectedId}
            />
          </Paper>
        ) : (
          /* Pricing tab */
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>Model pricing</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Set the cost per 1M tokens for each model. These rates are used to calculate the monthly cost estimate.
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Display currency</InputLabel>
                  <Select label="Display currency" value={pricing.currency} onChange={(e) => setPricing((c) => ({ ...c, currency: e.target.value as CurrencyCode }))}>
                    <MenuItem value="USD">USD ($)</MenuItem>
                    <MenuItem value="EUR">EUR (€)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  fullWidth size="small" type="number"
                  label={`Embedding cost (${pricing.currency} / 1M tokens)`}
                  value={pricing.embeddingPricePer1M}
                  slotProps={{ htmlInput: { step: 0.001, min: 0 } }}
                  onChange={(e) => setPricing((c) => ({ ...c, embeddingPricePer1M: Math.max(0, toNumber(e.target.value, c.embeddingPricePer1M)) }))}
                />
              </Grid>
            </Grid>

            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 600 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Model</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 180 }}>{`Input (${pricing.currency} / 1M)`}</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 180 }}>{`Output (${pricing.currency} / 1M)`}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Used by</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.keys(pricing.models).map((model) => {
                    const rates = getPricing(model, pricing.models)
                    const usedBy = agents.filter((a) => a.model === model).length
                    return (
                      <TableRow key={model} hover>
                        <TableCell>
                          <Typography variant="subtitle2">{getModelLabel(model)}</Typography>
                          <Typography variant="caption" color="text.secondary">{model}</Typography>
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small" type="number" fullWidth
                            value={rates.in}
                            slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
                            onChange={(e) => setPricing((c) => ({ ...c, models: { ...c.models, [model]: { ...getPricing(model, c.models), in: Math.max(0, toNumber(e.target.value, rates.in)) } } }))}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small" type="number" fullWidth
                            value={rates.out}
                            slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
                            onChange={(e) => setPricing((c) => ({ ...c, models: { ...c.models, [model]: { ...getPricing(model, c.models), out: Math.max(0, toNumber(e.target.value, rates.out)) } } }))}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={usedBy > 0 ? `${usedBy} agent${usedBy > 1 ? 's' : ''}` : 'None'} color={usedBy > 0 ? 'primary' : 'default'} variant="outlined" />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>
          </Paper>
        )}
      </Container>

      <Snackbar open={Boolean(snackbar)} autoHideDuration={3500} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: isPhone ? 'top' : 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar(null)} severity={snackbar?.severity ?? 'info'} variant="filled" sx={{ borderRadius: 12 }}>
          {snackbar?.message ?? ''}
        </Alert>
      </Snackbar>
    </Box>
  )
}

// --- Agent Card Component ---

function AgentCard(props: {
  agent: Agent
  costPerMonth: number
  formatCost: (v: number) => string
  onUpdate: (patch: Partial<Agent>) => void
  onRemove: () => void
}) {
  const { agent } = props

  return (
    <Card variant="outlined" sx={{ borderColor: 'rgba(19, 34, 56, 0.1)' }}>
      <CardContent sx={{ pb: '16px !important' }}>
        {/* Header row */}
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box>
              <Typography variant="subtitle1">{agent.name}</Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
                <Chip size="small" label={getModelLabel(agent.model)} variant="outlined" />
                {agent.ragEnabled && <Chip size="small" label="RAG" color="success" variant="outlined" />}
                {agent.mcpCalls > 0 && <Chip size="small" label={`MCP ×${agent.mcpCalls}`} color="secondary" variant="outlined" />}
              </Stack>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip label={props.formatCost(props.costPerMonth) + '/mo'} color="primary" size="small" />
            <IconButton size="small" color="error" onClick={props.onRemove} aria-label="Remove agent">
              <DeleteOutlineRounded fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        {/* Core fields */}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth size="small" label="Name" value={agent.name} onChange={(e) => props.onUpdate({ name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Model</InputLabel>
              <Select label="Model" value={agent.model} onChange={(e) => props.onUpdate({ model: String(e.target.value) })}>
                {MODEL_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth size="small" type="number" label="LLM calls / conversation" value={agent.callsPerConversation} slotProps={{ htmlInput: { min: 0, step: 1 } }} onChange={(e) => props.onUpdate({ callsPerConversation: Math.max(0, toNumber(e.target.value, agent.callsPerConversation)) })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" type="number" label="Input tokens / call" value={agent.inputTokensPerCall} onChange={(e) => props.onUpdate({ inputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.inputTokensPerCall))) })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" type="number" label="Output tokens / call" value={agent.outputTokensPerCall} onChange={(e) => props.onUpdate({ outputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.outputTokensPerCall))) })} />
          </Grid>
        </Grid>

        {/* RAG section */}
        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(248, 250, 252, 0.8)', borderRadius: 1.5 }}>
          <FormControlLabel
            control={<Switch size="small" checked={agent.ragEnabled} onChange={(e) => props.onUpdate({ ragEnabled: e.target.checked, ragChunks: e.target.checked && agent.ragChunks === 0 ? 4 : agent.ragChunks, ragChunkTokens: e.target.checked && agent.ragChunkTokens === 0 ? 150 : agent.ragChunkTokens, ragEmbeddingTokens: e.target.checked && agent.ragEmbeddingTokens === 0 ? 60 : agent.ragEmbeddingTokens })} />}
            label={<Typography variant="body2" sx={{ fontWeight: 600 }}>RAG retrieval</Typography>}
          />
          {agent.ragEnabled && (
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 4 }}>
                <TextField fullWidth size="small" type="number" label="Chunks" value={agent.ragChunks} onChange={(e) => props.onUpdate({ ragChunks: Math.max(0, toNumber(e.target.value, agent.ragChunks)) })} />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField fullWidth size="small" type="number" label="Tokens/chunk" value={agent.ragChunkTokens} onChange={(e) => props.onUpdate({ ragChunkTokens: Math.max(0, Math.round(toNumber(e.target.value, agent.ragChunkTokens))) })} />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField fullWidth size="small" type="number" label="Embed tokens" value={agent.ragEmbeddingTokens} onChange={(e) => props.onUpdate({ ragEmbeddingTokens: Math.max(0, Math.round(toNumber(e.target.value, agent.ragEmbeddingTokens))) })} />
              </Grid>
            </Grid>
          )}
        </Box>

        {/* MCP section */}
        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(248, 250, 252, 0.8)', borderRadius: 1.5 }}>
          <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
            <Grid size={{ xs: 6 }}>
              <TextField fullWidth size="small" type="number" label="MCP tool calls / conversation" value={agent.mcpCalls} onChange={(e) => props.onUpdate({ mcpCalls: Math.max(0, Math.round(toNumber(e.target.value, agent.mcpCalls))) })} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField fullWidth size="small" type="number" label="Extra tokens / MCP call" value={agent.mcpTokensPerCall} disabled={agent.mcpCalls === 0} onChange={(e) => props.onUpdate({ mcpTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.mcpTokensPerCall))) })} />
            </Grid>
          </Grid>
        </Box>
      </CardContent>
    </Card>
  )
}
