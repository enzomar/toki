import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
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
  Slider,
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
  ShareRounded,
} from '@mui/icons-material'
import {
  MODEL_OPTIONS,
  WORKSPACE_SAMPLES,
  createDefaultAgent,
  createDefaultWorkspacePricing,
} from './features/topology/config'
import type { Agent, Edge, EstimateConfig, TimeRange, WorkspacePricing } from './features/topology/types'
import {
  calculateEstimate,
  computeConversationsPerMonth,
  createEstimateConfig,
  createId,
  createTopologyDocument,
  decodeWorkspaceFromUrl,
  encodeWorkspaceToUrl,
  formatCurrency,
  formatMetricNumber,
  getModelLabel,
  getPricing,
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
  const [activeTab, setActiveTab] = useState<'calculator' | 'topology' | 'pricing' | 'token-tool' | 'help'>('calculator')
  const [topoSelectedId, setTopoSelectedId] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [samplesAnchor, setSamplesAnchor] = useState<HTMLElement | null>(null)
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null)
  const [newModelName, setNewModelName] = useState('')
  const [growthMultiplier, setGrowthMultiplier] = useState(1)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
  // Connection weight validation
  const totalOutgoingTraffic = useMemo(() => {
    const outByAgent = new Map<string, number>()
    safeEdges.forEach((e) => {
      outByAgent.set(e.sourceId, (outByAgent.get(e.sourceId) ?? 0) + e.weight)
    })
    return outByAgent
  }, [safeEdges])
  // AEIR simulation result (async, runs in background)
  const [mcReport, setMcReport] = useState<import('./features/forecasting/aeir').ExternalForecastResult | null>(null)
  const [mcRunning, setMcRunning] = useState(false)
  const [mcSimCount, setMcSimCount] = useLocalStorage<number>('v2:mcSims', 200)

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
  }, [agents, safeEdges, scaledConfig.conversationsPerMonth, pricing, mcSimCount, workspaceName])

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

  const addModel = () => {
    const name = newModelName.trim()
    if (!name) { setSnackbar({ severity: 'info', message: 'Enter a model name.' }); return }
    if (pricing.models[name]) { setSnackbar({ severity: 'info', message: `${name} already exists.` }); return }
    setPricing((c) => ({ ...c, models: { ...c.models, [name]: { in: 1, out: 4 } } }))
    setNewModelName('')
    setSnackbar({ severity: 'success', message: `Added model: ${name}` })
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

  const exportWorkspace = () => {
    const doc = createTopologyDocument(agents, safeEdges, estimateConfig, pricing)
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `${fileSlug()}-workspace.json`)
    setSnackbar({ severity: 'success', message: 'Workspace exported as JSON.' })
  }

  const exportCsv = () => {
    if (agents.length === 0) { setSnackbar({ severity: 'info', message: 'Add agents before exporting.' }); return }
    const meta = [
      ['Users', String(estimateConfig.users)],
      ['Conversations per user', String(estimateConfig.conversationsPerUser)],
      ['Time range', estimateConfig.timeRange],
      ['Conversations per month', String(estimateConfig.conversationsPerMonth)],
      [],
    ]
    const headers = ['Agent', 'Model', 'Traffic %', 'Calls/Conv', 'Input Tok/Call', 'Output Tok/Call', 'MCP Calls', 'MCP Out Tok/Call', 'MCP In Tok/Call', 'RAG Chunks', 'RAG Tok/Chunk', 'Embed Tok', 'Calls/Month', 'Input Tok/Month', 'Output Tok/Month', 'Embed Tok/Month', 'Total Tok/Month', 'Cost/Month (EUR)']
    const rows = estimate.agents.map((a) => {
      const agent = agents.find((ag) => ag.id === a.id)
      return [
        a.name, a.model, Math.round(a.trafficShare * 100), agent?.callsPerConversation ?? 0, agent?.inputTokensPerCall ?? 0, agent?.outputTokensPerCall ?? 0,
        agent?.mcpCalls ?? 0, agent?.mcpOutputTokensPerCall ?? 0, agent?.mcpInputTokensPerCall ?? 0, agent?.ragChunks ?? 0, agent?.ragChunkTokens ?? 0, agent?.ragEmbeddingTokens ?? 0,
        a.callsPerMonth, a.inputTokensPerMonth, a.outputTokensPerMonth, a.embeddingTokensPerMonth, a.totalTokensPerMonth, a.costPerMonth.toFixed(4),
      ]
    })
    const totalRow = ['TOTAL', '', '', '', '', '', '', '', '', '', '', '', '', estimate.totalInputTokens, estimate.totalOutputTokens, estimate.totalEmbeddingTokens, estimate.totalTokensPerMonth, estimate.totalCostPerMonth.toFixed(4)]
    const csvRows = [...meta, headers, ...rows, totalRow].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    downloadBlob(new Blob([csvRows], { type: 'text/csv' }), `${fileSlug()}-estimate.csv`)
    setSnackbar({ severity: 'success', message: 'Estimate exported as CSV.' })
  }

  const exportExcel = async () => {
    if (agents.length === 0) { setSnackbar({ severity: 'info', message: 'Add agents before exporting.' }); return }

    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Toki'
    workbook.created = new Date()

    // --- Sheet 1: Estimate ---
    const ws = workbook.addWorksheet('Estimate')
    const headers = ['Agent', 'Model', 'Traffic %', 'Calls/Conv', 'Input Tok/Call', 'Output Tok/Call', 'MCP Calls', 'MCP Out Tok', 'MCP In Tok', 'RAG Chunks', 'Chunk Tok', 'Embed Tok', 'Calls/Month', 'Input Tok/Month', 'Output Tok/Month', 'Embed Tok/Month', 'Total Tok/Month', 'Cost/Month (EUR)']
    const headerRow = ws.addRow(headers)
    headerRow.font = { bold: true }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

    const dataStartRow = 2
    estimate.agents.forEach((a, i) => {
      const agent = agents.find((ag) => ag.id === a.id)
      const r = dataStartRow + i
      const row = ws.addRow([
        a.name, a.model, Math.round(a.trafficShare * 100),
        agent?.callsPerConversation ?? 0, agent?.inputTokensPerCall ?? 0, agent?.outputTokensPerCall ?? 0,
        agent?.mcpCalls ?? 0, agent?.mcpOutputTokensPerCall ?? 0, agent?.mcpInputTokensPerCall ?? 0,
        agent?.ragChunks ?? 0, agent?.ragChunkTokens ?? 0, agent?.ragEmbeddingTokens ?? 0,
        a.callsPerMonth, a.inputTokensPerMonth, a.outputTokensPerMonth, a.embeddingTokensPerMonth,
        // Col Q: Total Tok/Month (formula)
        null,
        // Col R: Cost/Month
        a.costPerMonth,
      ])
      // Set formula for Total Tokens (col 17 = Q): =N+O+P
      row.getCell(17).value = { formula: `N${r}+O${r}+P${r}`, result: a.totalTokensPerMonth }
      row.getCell(18).numFmt = '€#,##0.0000'
    })

    // Total row with SUM formulas
    const lastDataRow = dataStartRow + estimate.agents.length - 1
    const totalRow = ws.addRow([
      'TOTAL', '', '', '', '', '', '', '', '', '', '', '',
      null, null, null, null, null, null,
    ])
    totalRow.font = { bold: true }
    totalRow.getCell(13).value = { formula: `SUM(M${dataStartRow}:M${lastDataRow})`, result: estimate.agents.reduce((s, a) => s + a.callsPerMonth, 0) }
    totalRow.getCell(14).value = { formula: `SUM(N${dataStartRow}:N${lastDataRow})`, result: estimate.totalInputTokens }
    totalRow.getCell(15).value = { formula: `SUM(O${dataStartRow}:O${lastDataRow})`, result: estimate.totalOutputTokens }
    totalRow.getCell(16).value = { formula: `SUM(P${dataStartRow}:P${lastDataRow})`, result: estimate.totalEmbeddingTokens }
    totalRow.getCell(17).value = { formula: `SUM(Q${dataStartRow}:Q${lastDataRow})`, result: estimate.totalTokensPerMonth }
    totalRow.getCell(18).value = { formula: `SUM(R${dataStartRow}:R${lastDataRow})`, result: estimate.totalCostPerMonth }
    totalRow.getCell(18).numFmt = '€#,##0.0000'

    // Auto-width columns
    ws.columns.forEach((col) => { col.width = 16 })
    ws.getColumn(1).width = 24
    ws.getColumn(2).width = 20

    // --- Sheet 2: Summary ---
    const totalRowNum = lastDataRow + 1
    const summary = workbook.addWorksheet('Summary')
    const sumHeader = summary.addRow(['Metric', 'Value'])
    sumHeader.font = { bold: true }
    summary.addRow(['Users', estimateConfig.users])
    summary.addRow(['Conversations per user', estimateConfig.conversationsPerUser])
    summary.addRow(['Time range', estimateConfig.timeRange])
    summary.addRow(['Conversations/Month', estimateConfig.conversationsPerMonth])
    // Row 6: Total Tokens references Estimate sheet
    const tokRow = summary.addRow(['Total Tokens/Month', null])
    tokRow.getCell(2).value = { formula: `Estimate!Q${totalRowNum}`, result: estimate.totalTokensPerMonth }
    // Row 7: Total Cost references Estimate sheet
    const costRow = summary.addRow(['Total Cost/Month (EUR)', null])
    costRow.getCell(2).value = { formula: `Estimate!R${totalRowNum}`, result: estimate.totalCostPerMonth }
    costRow.getCell(2).numFmt = '€#,##0.0000'
    // Row 8: Cost/Conversation = TotalCost / Conversations
    const cpcRow = summary.addRow(['Cost/Conversation (EUR)', null])
    cpcRow.getCell(2).value = { formula: `B7/B5`, result: estimate.costPerConversation }
    cpcRow.getCell(2).numFmt = '€#,##0.000000'
    summary.addRow(['Agents', agents.length])
    summary.addRow(['Confidence', estimate.confidence])
    summary.addRow(['Best case (EUR/month)', estimate.bestCaseCostPerMonth])
    summary.addRow(['Worst case (EUR/month)', estimate.worstCaseCostPerMonth])
    summary.getColumn(1).width = 28
    summary.getColumn(2).width = 20

    // --- Generate and download ---
    const buffer = await workbook.xlsx.writeBuffer()
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileSlug()}-estimate.xlsx`)
    setSnackbar({ severity: 'success', message: 'Estimate exported as Excel (.xlsx).' })
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function fileSlug() {
    return workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'toki'
  }

  const shareWorkspace = async () => {
    if (agents.length === 0) { setSnackbar({ severity: 'info', message: 'Add agents before sharing.' }); return }
    const doc = createTopologyDocument(agents, safeEdges, estimateConfig, pricing)
    const shareUrl = encodeWorkspaceToUrl(doc)
    try {
      await navigator.clipboard.writeText(shareUrl)
      setSnackbar({ severity: 'success', message: 'Share link copied to clipboard.' })
    } catch {
      // Fallback: show the URL in a prompt
      window.prompt('Copy this share link:', shareUrl)
    }
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
      `Workspace: ${workspaceName}`,
      `Conversations/month: ${estimateConfig.conversationsPerMonth.toLocaleString()} (${estimateConfig.users} users × ${estimateConfig.conversationsPerUser} conv/${estimateConfig.timeRange})`,
      `Monthly tokens: ${formatMetricNumber(estimate.totalTokensPerMonth)} (${formatMetricNumber(estimate.totalInputTokens)} in / ${formatMetricNumber(estimate.totalOutputTokens)} out)`,
      `Agents: ${agents.length}`,
      '',
      ...estimate.agents.map((a) => {
        const agent = agents.find((ag) => ag.id === a.id)
        const parts = [
          `${a.name} (${getModelLabel(a.model)})`,
          `${Math.round(a.trafficShare * 100)}% traffic`,
          `${formatMetricNumber(a.totalTokensPerMonth)} tok/mo`,
        ]
        if (agent?.mcpCalls) parts.push(`MCP ×${agent.mcpCalls}`)
        if (agent?.ragEnabled) parts.push(`RAG ${agent.ragChunks} chunks`)
        return `  ${parts.join(' · ')}`
      }),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setSnackbar({ severity: 'success', message: 'Estimate copied (tokens + traffic).' })
    } catch { setSnackbar({ severity: 'error', message: 'Copy failed.' }) }
  }

  // --- Render ---

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f8', display: 'flex', flexDirection: 'column' }}>
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
            <input ref={fileInputRef} hidden type="file" accept=".json" onChange={importWorkspace} />
            <Button size="small" startIcon={<FileUploadOutlined />} onClick={() => fileInputRef.current?.click()}>Import</Button>
            <Button size="small" startIcon={<FileDownloadOutlined />} onClick={(e) => setExportAnchor(e.currentTarget)}>Export</Button>
            <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
              <MenuItem onClick={() => { exportWorkspace(); setExportAnchor(null) }}>
                <ListItemText primary="Workspace (JSON)" secondary="Full workspace with agents, connections, and settings" slotProps={{ secondary: { variant: 'caption' } }} />
              </MenuItem>
              <MenuItem onClick={() => { exportCsv(); setExportAnchor(null) }}>
                <ListItemText primary="Estimate (CSV)" secondary="Cost breakdown table for spreadsheets" slotProps={{ secondary: { variant: 'caption' } }} />
              </MenuItem>
              <MenuItem onClick={() => { exportExcel(); setExportAnchor(null) }}>
                <ListItemText primary="Estimate (Excel)" secondary="Excel workbook with estimate and summary sheets" slotProps={{ secondary: { variant: 'caption' } }} />
              </MenuItem>
            </Menu>
            <Button size="small" startIcon={<ShareRounded />} onClick={shareWorkspace}>Share</Button>
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
            <Tab disabled icon={<Divider orientation="vertical" sx={{ height: 20 }} />} sx={{ minWidth: 8, px: 0, opacity: '1 !important' }} value="" />
            <Tab label="Pricing" value="pricing" />
            <Tab label="Token Tool" value="token-tool" />
            <Tab label="Help" value="help" />
          </Tabs>
        </Stack>
      </Paper>

      <Container maxWidth="xl" sx={{ py: 3, pb: 7 }}>
        {activeTab === 'calculator' ? (
          <Grid container spacing={3}>
            {/* Left: Agent line items */}
            <Grid size={{ xs: 12, lg: 8 }}>
              <Stack spacing={2}>
                {/* Volume input */}
                <Paper sx={{ p: 2.5 }}>
                  <Typography variant="h6" sx={{ mb: 0.5 }}>Traffic volume</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    How many users do you have, and how often do they interact?
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Number of users"
                        placeholder="e.g. 5000"
                        value={estimateConfig.users || ''}
                        helperText="Active users in the selected time range."
                        onChange={(e) => {
                          const users = Math.max(0, Math.round(toNumber(e.target.value, 0)))
                          setEstimateConfig((c) => ({ ...c, users, conversationsPerMonth: computeConversationsPerMonth(users, c.conversationsPerUser, c.timeRange) }))
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Conversations per user"
                        placeholder="e.g. 10"
                        value={estimateConfig.conversationsPerUser || ''}
                        helperText="Average conversations each user has."
                        onChange={(e) => {
                          const conv = Math.max(0, toNumber(e.target.value, 0))
                          setEstimateConfig((c) => ({ ...c, conversationsPerUser: conv, conversationsPerMonth: computeConversationsPerMonth(c.users, conv, c.timeRange) }))
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <FormControl fullWidth>
                        <InputLabel>Time range</InputLabel>
                        <Select
                          label="Time range"
                          value={estimateConfig.timeRange}
                          onChange={(e) => {
                            const tr = e.target.value as TimeRange
                            setEstimateConfig((c) => ({ ...c, timeRange: tr, conversationsPerMonth: computeConversationsPerMonth(c.users, c.conversationsPerUser, tr) }))
                          }}
                        >
                          <MenuItem value="day">Per day</MenuItem>
                          <MenuItem value="week">Per week</MenuItem>
                          <MenuItem value="month">Per month</MenuItem>
                          <MenuItem value="year">Per year</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                  {estimateConfig.conversationsPerMonth > 0 && (
                    <Chip
                      label={`≈ ${estimateConfig.conversationsPerMonth.toLocaleString()} conversations / month`}
                      color="primary"
                      variant="outlined"
                      sx={{ mt: 2 }}
                    />
                  )}
                </Paper>

                {/* Agents */}
                <Paper sx={{ p: 2.5 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box>
                      <Typography variant="h6">Agents</Typography>
                      <Typography variant="body2" color="text.secondary">Each agent is a cost line item. Add the LLM agents in your system.</Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      {agents.length > 1 && (
                        <FormControl size="small" sx={{ minWidth: 130 }}>
                          <InputLabel>Bulk model</InputLabel>
                          <Select label="Bulk model" value="" onChange={(e) => { if (e.target.value) bulkChangeModel(String(e.target.value)) }}>
                            {modelOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                          </Select>
                        </FormControl>
                      )}
                      <Button startIcon={<AddRounded />} variant="contained" onClick={addAgent}>Add agent</Button>
                    </Stack>
                  </Stack>

                  {agents.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderStyle: 'dashed' }}>
                      <Typography variant="h6" sx={{ mb: 1 }}>Get started</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Load a sample architecture to explore, or add your first agent manually.</Typography>
                      <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center' }}>
                        <Button variant="contained" startIcon={<ScienceRounded />} onClick={(e) => setSamplesAnchor(e.currentTarget)}>Load a sample</Button>
                        <Button variant="outlined" startIcon={<AddRounded />} onClick={addAgent}>Add agent</Button>
                      </Stack>
                    </Paper>
                  ) : (
                    <Stack spacing={2}>
                      {agents.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          costPerMonth={estimate.agents.find((a) => a.id === agent.id)?.costPerMonth ?? 0}
                          formatCost={formatCost}
                          modelOptions={modelOptions}
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
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Traffic % is an absolute probability — "50%" means 50% of conversations trigger that agent. Values don't need to sum to 100% because one conversation can trigger multiple specialists.
                      </Typography>
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
                            <TextField size="small" type="number" label="Traffic %" value={Math.round(edge.weight * 100)} sx={{ width: 100 }} slotProps={{ htmlInput: { step: 5, min: 0, max: 100 } }} onChange={(e) => updateEdge(edge.id, { weight: Math.max(0, Math.min(1, toNumber(e.target.value, edge.weight * 100) / 100)) })} />
                            <IconButton size="small" color="error" onClick={() => removeEdge(edge.id)}><DeleteOutlineRounded fontSize="small" /></IconButton>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                  {/* Connection weight validation */}
                  {safeEdges.length > 0 && (() => {
                    const notes: string[] = []
                    totalOutgoingTraffic.forEach((total, agentId) => {
                      const name = agents.find((a) => a.id === agentId)?.name ?? agentId
                      notes.push(`${name}: ${Math.round(total * 100)}% outgoing`)
                    })
                    return notes.length > 0 ? (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Traffic summary: {notes.join(' · ')}
                      </Typography>
                    ) : null
                  })()}
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
                          Monte Carlo{mcRunning ? ' …' : ''}
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
                      <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber(mcReport.breakdown_base_tokens + mcReport.breakdown_rag_tokens + mcReport.breakdown_mcp_tokens) : '—'}</Typography></Grid>
                      {/* Output tokens row */}
                      <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>↑ Output</Typography></Grid>
                      <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block' }}>{formatMetricNumber(estimate.totalOutputTokens)}</Typography></Grid>
                      <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber((mcReport.tokens_expected_per_conv * scaledConfig.conversationsPerMonth) - (mcReport.breakdown_base_tokens + mcReport.breakdown_rag_tokens + mcReport.breakdown_mcp_tokens)) : '—'}</Typography></Grid>
                      {/* Embedding tokens row */}
                      {(estimate.totalEmbeddingTokens > 0 || (mcReport && mcReport.breakdown_embedding_tokens > 0)) && (
                        <>
                          <Grid size={4}><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>⟡ Embedding</Typography></Grid>
                          <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block' }}>{formatMetricNumber(estimate.totalEmbeddingTokens)}</Typography></Grid>
                          <Grid size={4}><Typography variant="caption" sx={{ fontSize: 10, textAlign: 'center', display: 'block', color: mcReport ? 'text.primary' : 'text.disabled' }}>{mcReport ? formatMetricNumber(mcReport.breakdown_embedding_tokens) : '—'}</Typography></Grid>
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
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          AEIR simulation{mcRunning ? ' · running…' : mcReport ? ` (${mcReport.simulation_count} runs)` : ''}
                        </Typography>
                        <FormControl size="small" sx={{ minWidth: 80 }}>
                          <Select value={mcSimCount} onChange={(e) => setMcSimCount(Number(e.target.value))} sx={{ fontSize: 11, height: 22 }}>
                            <MenuItem value={50}>50</MenuItem>
                            <MenuItem value={100}>100</MenuItem>
                            <MenuItem value={200}>200</MenuItem>
                            <MenuItem value={500}>500</MenuItem>
                          </Select>
                        </FormControl>
                      </Stack>
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
                        <Typography variant="caption" color="text.secondary">
                          MC: {Math.round(mcReport.confidence_score * 100)}%
                        </Typography>
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
          </Grid>
        ) : activeTab === 'topology' ? (
          /* Topology tab */
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: topoSelectedId ? 8 : 12 }}>
              <Paper sx={{ p: 2.5 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Box>
                    <Typography variant="h6">System topology</Typography>
                    <Typography variant="body2" color="text.secondary">Click a node to inspect. Double-click to isolate its subgraph.</Typography>
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
                />
              </Paper>
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
        ) : activeTab === 'token-tool' ? (
          /* Token Tool tab — inline version */
          <TokenToolTab />
        ) : activeTab === 'pricing' ? (
          /* Pricing tab */
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>Model pricing</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Set the cost per 1M tokens for each model. These rates are used to calculate the monthly cost estimate.
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <TextField
                  fullWidth size="small" type="number"
                  label="Embedding cost (EUR / 1M tokens)"
                  value={pricing.embeddingPricePer1M}
                  slotProps={{ htmlInput: { step: 0.001, min: 0 } }}
                  onChange={(e) => setPricing((c) => ({ ...c, embeddingPricePer1M: Math.max(0, toNumber(e.target.value, c.embeddingPricePer1M)) }))}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth size="small"
                    label="New model name"
                    placeholder="e.g. gemini-2.5-pro"
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addModel() }}
                  />
                  <Button variant="contained" onClick={addModel} sx={{ whiteSpace: 'nowrap' }}>Add model</Button>
                </Stack>
              </Grid>
            </Grid>

            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 600 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Model</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 180 }}>Input (EUR / 1M)</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 180 }}>Output (EUR / 1M)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Used by</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 50 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.keys(pricing.models).map((model) => {
                    const rates = getPricing(model, pricing.models)
                    const usedBy = agents.filter((a) => a.model === model).length
                    const isBuiltIn = MODEL_OPTIONS.some((o) => o.value === model)
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
                        <TableCell>
                          {!isBuiltIn && (
                            <Tooltip title={usedBy > 0 ? 'Remove agents using this model first' : 'Remove model'}>
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  disabled={usedBy > 0}
                                  onClick={() => setPricing((c) => {
                                    const next = { ...c.models }
                                    delete next[model]
                                    return { ...c, models: next }
                                  })}
                                >
                                  <DeleteOutlineRounded fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>
          </Paper>
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
            Created with love and vibe coding.
          </Typography>
        </Stack>
      </Box>

      <Snackbar open={Boolean(snackbar)} autoHideDuration={3500} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: isPhone ? 'top' : 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar(null)} severity={snackbar?.severity ?? 'info'} variant="filled" sx={{ borderRadius: 12 }}>
          {snackbar?.message ?? ''}
        </Alert>
      </Snackbar>
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
