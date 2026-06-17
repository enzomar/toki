import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  useMediaQuery,
} from '@mui/material'
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
  getModelLabel,
  parseTopologyDocument,
  sanitizeEdges,
} from './features/topology/utils'
import { useLocalStorage } from './hooks/useLocalStorage'
import { compileToAEIR } from './features/forecasting/aeir'

// Layout & Pages
import { AppShell } from './components/layout/AppShell'
import type { NavPage } from './components/layout/AppShell'
import { WorkspacePage } from './components/workspace/WorkspacePage'
import { TopologyPage } from './components/topology/TopologyPage'
import { SimulationPage } from './components/simulation/SimulationPage'
import { TokenToolPage } from './components/token-tool/TokenToolPage'
import { SettingsPage } from './components/settings/SettingsPage'
import { HelpPage } from './components/help/HelpPage'
import { McDetailDialog } from './components/McDetailDialog'

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

  // --- Persisted state ---
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
        window.history.replaceState(null, '', window.location.pathname)
      } catch { /* ignore invalid share links */ }
    }
  })

  // --- UI state ---
  const [activePage, setActivePage] = useState<NavPage>('workspace')
  const [snackbar, setSnackbar] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [samplesAnchor, setSamplesAnchor] = useState<HTMLElement | null>(null)
  const [newModelName, setNewModelName] = useState('')
  const [growthMultiplier, setGrowthMultiplier] = useState(1)
  const [showMcDetail, setShowMcDetail] = useState(false)

  // --- Derived state ---
  const scaledConfig = useMemo((): EstimateConfig => ({
    ...estimateConfig,
    conversationsPerMonth: Math.round(estimateConfig.conversationsPerMonth * growthMultiplier),
  }), [estimateConfig, growthMultiplier])

  const safeEdges = useMemo(() => sanitizeEdges(agents, edges), [agents, edges])
  const estimate = useMemo(() => calculateEstimate(agents, scaledConfig, pricing, safeEdges), [agents, scaledConfig, pricing, safeEdges])
  const formatCost = (v: number) => formatCurrency(v, 'EUR')

  const modelOptions = useMemo(() => {
    const allKeys = new Set([...MODEL_OPTIONS.map((o) => o.value), ...Object.keys(pricing.models)])
    return Array.from(allKeys).map((key) => ({ value: key, label: getModelLabel(key) }))
  }, [pricing.models])

  // --- AEIR simulation ---
  const [mcReport, setMcReport] = useState<import('./features/forecasting/aeir').ExternalForecastResult | null>(null)
  const [mcRunning, setMcRunning] = useState(false)
  const [mcSimCount, setMcSimCount] = useLocalStorage<number>('v2:mcSims', 200)
  const [simConfig, setSimConfig] = useLocalStorage<import('./features/forecasting/aeir-config').AEIRSimConfig | null>('v2:simConfig', null)

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
      } finally { setMcRunning(false) }
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

  const addEdge = (sourceId?: string, targetId?: string, weight?: number) => {
    if (agents.length < 2) { setSnackbar({ severity: 'info', message: 'Add at least two agents first.' }); return }
    const src = sourceId ?? agents[0].id
    const tgt = targetId ?? (agents.find((a) => a.id !== src)?.id ?? agents[0].id)
    setEdges((cur) => [...cur, { id: createId('edge'), sourceId: src, targetId: tgt, weight: weight ?? 1 }])
  }

  const updateEdge = (id: string, patch: Partial<Edge>) => {
    setEdges((cur) => cur.map((e) => e.id === id ? { ...e, ...patch } : e))
  }

  const removeEdge = (id: string) => {
    setEdges((cur) => cur.filter((e) => e.id !== id))
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

  const resetWorkspace = () => {
    if (!window.confirm('Clear all agents, connections, and settings?')) return
    Object.keys(localStorage).filter((k) => k.startsWith('toki:')).forEach((k) => localStorage.removeItem(k))
    window.location.replace(window.location.pathname)
  }

  // --- Render ---
  return (
    <AppShell activePage={activePage} onNavigate={setActivePage} version={APP_VERSION}>
      {activePage === 'workspace' && (
        <WorkspacePage
          workspaceName={workspaceName}
          setWorkspaceName={setWorkspaceName}
          agents={agents}
          edges={edges}
          estimateConfig={estimateConfig}
          setEstimateConfig={setEstimateConfig}
          pricing={pricing}
          setPricing={setPricing}
          estimate={estimate}
          modelOptions={modelOptions}
          addAgent={addAgent}
          removeAgent={removeAgent}
          updateAgent={updateAgent}
          addEdge={addEdge}
          updateEdge={updateEdge}
          removeEdge={removeEdge}
          mcReport={mcReport}
          mcRunning={mcRunning}
          mcSimCount={mcSimCount}
          setMcSimCount={setMcSimCount}
          simConfig={simConfig}
          setSimConfig={setSimConfig}
          scaledConfig={scaledConfig}
          growthMultiplier={growthMultiplier}
          setGrowthMultiplier={setGrowthMultiplier}
          onShowMcDetail={() => setShowMcDetail(true)}
          onImport={(parsed, importedSimConfig) => {
            setAgents(parsed.agents)
            setEdges(parsed.edges)
            setEstimateConfig(parsed.estimate)
            setPricing(parsed.pricing)
            if (importedSimConfig) setSimConfig(importedSimConfig)
          }}
          onSnackbar={setSnackbar}
          onLoadSample={(e) => setSamplesAnchor(e.currentTarget)}
          loadSample={loadSample}
          resetWorkspace={resetWorkspace}
          bulkChangeModel={bulkChangeModel}
          formatCost={formatCost}
        />
      )}

      {activePage === 'topology' && (
        <TopologyPage
          agents={agents}
          edges={safeEdges}
          pricing={pricing}
          estimate={estimate}
          modelOptions={modelOptions}
          aeirGraph={aeirGraph}
          trafficConfig={estimateConfig.conversationsPerMonth > 0 ? { users: estimateConfig.users, conversationsPerUser: estimateConfig.conversationsPerUser, conversationsPerMonth: scaledConfig.conversationsPerMonth, timeRange: estimateConfig.timeRange } : undefined}
          updateAgent={updateAgent}
          removeAgent={removeAgent}
          updateEdge={updateEdge}
          removeEdge={removeEdge}
          addEdge={(src, tgt, w) => addEdge(src, tgt, w)}
          addAgent={addAgent}
          loadSample={loadSample}
          formatCost={formatCost}
          onSnackbar={setSnackbar}
          onNavigateToWorkspace={() => setActivePage('workspace')}
        />
      )}

      {activePage === 'simulation' && (
        <SimulationPage
          agents={agents}
          edges={safeEdges}
          pricing={pricing}
        />
      )}

      {activePage === 'token-tool' && <TokenToolPage />}

      {activePage === 'settings' && (
        <SettingsPage
          pricing={pricing}
          setPricing={setPricing}
          agents={agents}
          modelOptions={modelOptions}
          newModelName={newModelName}
          setNewModelName={setNewModelName}
        />
      )}

      {activePage === 'help' && <HelpPage />}

      {/* Samples menu */}
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

      {/* MC Detail Dialog */}
      <McDetailDialog open={showMcDetail} onClose={() => setShowMcDetail(false)} mcReport={mcReport} currency={pricing.currency} />

      {/* Snackbar */}
      <Snackbar open={Boolean(snackbar)} autoHideDuration={3500} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: isPhone ? 'top' : 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar(null)} severity={snackbar?.severity ?? 'info'} variant="filled" sx={{ borderRadius: 12 }}>
          {snackbar?.message ?? ''}
        </Alert>
      </Snackbar>
    </AppShell>
  )
}
