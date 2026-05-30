import { ChangeEvent, useRef, useState } from 'react'
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
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import {
  AddRounded,
  CalculateRounded,
  DeleteOutlineRounded,
  ExpandMoreRounded,
  FavoriteRounded,
  FileDownloadOutlined,
  FileUploadOutlined,
  MailOutlineRounded,
  PaidRounded,
  PlayArrowRounded,
  RestartAltRounded,
} from '@mui/icons-material'
import { DEFAULT_AGENTS, DEFAULT_SCENARIO, MODEL_OPTIONS, PRICING_TOKENS_PER_UNIT, ROUTING_MODE_OPTIONS } from './features/topology/config'
import type {
  Agent,
  CurrencyCode,
  Edge,
  QuickEstimateState,
  RoutingMode,
  ScheduleMode,
  ScenarioState,
  SimulationReport,
  TokenSampleState,
  WorkspacePricing,
} from './features/topology/types'
import {
  cloneAgents,
  cloneEdges,
  createDefaultQuickEstimate,
  createDefaultWorkspacePricing,
  createEmptyQuickEstimate,
  createId,
  createTopologyDocument,
  formatCurrency,
  formatMetricNumber,
  getAgentVisitForecast,
  getModelLabel,
  getNextTransitions,
  getPlannedDurationSeconds,
  getPlannedStarts,
  getPlannedStartsPerEntry,
  getPricing,
  getRoutingModeShortLabel,
  getThroughputPerMinute,
  inferEntryAgents,
  parseTopologyDocument,
  sanitizeEdges,
  toNumber,
} from './features/topology/utils'
import { TokiLogo } from './components/atoms/TokiLogo'
import { TokenAssistantPanel } from './components/molecules/TokenAssistantPanel'
import { TopologyCanvas } from './components/organisms/TopologyCanvas'

type StatusState = {
  severity: 'success' | 'error' | 'info'
  message: string
}

type ContactFormState = {
  name: string
  email: string
  message: string
}

type RuntimeReadinessItem = {
  id: string
  label: string
  helper: string
  ready: boolean
}

const QUICK_ESTIMATE_RAG_INPUT_MULTIPLIER = 0.35
const QUICK_ESTIMATE_EMBEDDING_TOKENS = 60
const BUSINESS_CASE_MONTH_DAYS = 30
const EMPTY_SCENARIO: ScenarioState = {
  ...DEFAULT_SCENARIO,
  iterations: 0,
  maxDepth: 0,
  loadMultiplier: 0,
  virtualUsers: 0,
  rampUpSeconds: 0,
  thinkTimeMs: 0,
  durationSeconds: 0,
  targetThroughput: 0,
  throughputPeriodSeconds: 0,
}

const BUSINESS_TRAFFIC_PATTERNS = [
  {
    value: 'closed' as const,
    label: 'Steady active users',
    helper: 'You decide how many sessions are active at once, and each session repeats the same journey.',
  },
  {
    value: 'open' as const,
    label: 'New sessions arriving over time',
    helper: 'Fresh sessions keep arriving at a target rate regardless of when previous ones finish.',
  },
] as const

const PAYPAL_DONATE_URL = (import.meta.env.VITE_PAYPAL_DONATE_URL ?? '').trim()
const AUTHOR_CONTACT_FORM_ENDPOINT = 'https://formspree.io/f/xzdwwwzv'

function getNextCustomModelName(existingNames: string[]) {
  let index = 1

  while (existingNames.some((name) => name.toLowerCase() === `custom model ${index}`.toLowerCase())) {
    index += 1
  }

  return `Custom Model ${index}`
}

function formatInlineList(items: string[]) {
  if (items.length === 0) {
    return ''
  }

  if (items.length === 1) {
    return items[0]
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function getNormalizedModelMix(modelMix: Record<string, number>, modelOptions: Array<{ value: string; label: string }>) {
  const mix = modelOptions.map((option) => ({
    value: option.value,
    label: option.label,
    raw: Math.max(0, modelMix[option.value] ?? 0),
  }))
  const total = mix.reduce((sum, option) => sum + option.raw, 0)
  const fallbackShare = mix.length > 0 ? 1 / mix.length : 0

  return mix.map((option) => ({
    ...option,
    share: total > 0 ? option.raw / total : fallbackShare,
  }))
}

function getQuickEstimateSummary(
  estimate: QuickEstimateState,
  workspacePricing: WorkspacePricing,
  modelOptions: Array<{ value: string; label: string }>,
) {
  const normalizedMix = getNormalizedModelMix(estimate.modelMix, modelOptions)
  const monthlyVolume = Math.max(0, Math.round(estimate.monthlyVolume))
  const averageInputTokens = Math.max(0, estimate.averageInputTokens)
  const averageOutputTokens = Math.max(0, estimate.averageOutputTokens)
  const ragUsageShare = Math.min(100, Math.max(0, estimate.ragUsagePercent)) / 100
  const ragInputTokens = averageInputTokens * QUICK_ESTIMATE_RAG_INPUT_MULTIPLIER * ragUsageShare
  const embeddingTokensPerSession = QUICK_ESTIMATE_EMBEDDING_TOKENS * ragUsageShare
  const effectiveInputTokensPerSession = averageInputTokens + ragInputTokens
  const totalTokensPerSession = effectiveInputTokensPerSession + averageOutputTokens + embeddingTokensPerSession
  const costPerSession = normalizedMix.reduce((sum, option) => {
    const pricing = getPricing(option.value, workspacePricing.models)

    return sum + option.share * (
      (effectiveInputTokensPerSession / PRICING_TOKENS_PER_UNIT) * pricing.in +
      (averageOutputTokens / PRICING_TOKENS_PER_UNIT) * pricing.out +
      (embeddingTokensPerSession / PRICING_TOKENS_PER_UNIT) * workspacePricing.embeddingPricePer1M
    )
  }, 0)

  return {
    monthlyVolume,
    ragUsageShare,
    normalizedMix,
    effectiveInputTokensPerSession,
    totalTokensPerSession,
    costPerSession,
    monthlyTokens: totalTokensPerSession * monthlyVolume,
    monthlyCost: costPerSession * monthlyVolume,
  }
}

function getRuntimeScenarioMissingLabels(scenario: ScenarioState) {
  const missing: string[] = []

  if (scenario.scheduleMode === 'closed') {
    if (scenario.virtualUsers <= 0) {
      missing.push('Active sessions at once')
    }
    if (scenario.iterations <= 0) {
      missing.push('Journeys per active session')
    }
  } else {
    if (scenario.targetThroughput <= 0) {
      missing.push('New sessions per interval')
    }
    if (scenario.throughputPeriodSeconds <= 0) {
      missing.push('Interval length (seconds)')
    }
    if (scenario.durationSeconds <= 0) {
      missing.push('Planning window (seconds)')
    }
  }

  if (scenario.loadMultiplier <= 0) {
    missing.push('Prompt/response growth factor')
  }

  if (scenario.maxDepth <= 0) {
    missing.push('Max handoffs followed')
  }

  return missing
}

function getTrafficPatternHelper(mode: ScheduleMode) {
  return BUSINESS_TRAFFIC_PATTERNS.find((pattern) => pattern.value === mode)?.helper ?? 'Choose the traffic pattern that best matches the system.'
}

function getTrafficPatternLabel(mode: ScheduleMode) {
  return BUSINESS_TRAFFIC_PATTERNS.find((pattern) => pattern.value === mode)?.label ?? 'Traffic pattern'
}

export default function App() {
  const isPhoneLayout = useMediaQuery('(max-width:600px)')
  const [estimationMode, setEstimationMode] = useState<'quick' | 'detailed'>('quick')
  const [agents, setAgents] = useState<Agent[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [scenario, setScenario] = useState<ScenarioState>({ ...EMPTY_SCENARIO })
  const [report, setReport] = useState<SimulationReport | null>(null)
  const [status, setStatus] = useState<StatusState | null>(null)
  const [isTokenAssistantOpen, setTokenAssistantOpen] = useState(false)
  const [isPricingDialogOpen, setPricingDialogOpen] = useState(false)
  const [isTopologyDialogOpen, setTopologyDialogOpen] = useState(false)
  const [isContactDialogOpen, setContactDialogOpen] = useState(false)
  const [topologySelectedAgentId, setTopologySelectedAgentId] = useState<string | null>(null)
  const [workspacePricing, setWorkspacePricing] = useState<WorkspacePricing>(() => createDefaultWorkspacePricing())
  const [quickEstimate, setQuickEstimate] = useState<QuickEstimateState>(() => createEmptyQuickEstimate())
  const [newModelName, setNewModelName] = useState(() => getNextCustomModelName(MODEL_OPTIONS.map((option) => option.value)))
  const [tokenPlannerSample, setTokenPlannerSample] = useState<TokenSampleState>({ inputText: '', outputText: '' })
  const [contactForm, setContactForm] = useState<ContactFormState>({ name: '', email: '', message: '' })
  const [isSubmittingContact, setSubmittingContact] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const safeEdges = sanitizeEdges(agents, edges)
  const entryAgents = inferEntryAgents(agents, safeEdges)
  const defaultModelOrder = new Map(MODEL_OPTIONS.map((option, index) => [option.value, index]))
  const workspaceModelEntries = Array.from(new Set([
    ...MODEL_OPTIONS.map((option) => option.value),
    ...agents.flatMap((agent) => [agent.model, agent.fallbackModel]),
    ...Object.keys(workspacePricing.models),
  ]))
    .filter((model): model is string => Boolean(model))
    .map((model) => ({
      value: model,
      label: getModelLabel(model),
      rates: getPricing(model, workspacePricing.models),
      usageCount: agents.filter((agent) => agent.model === model || agent.fallbackModel === model).length,
      defaultOrder: defaultModelOrder.get(model) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => {
      if (left.defaultOrder !== right.defaultOrder) {
        return left.defaultOrder - right.defaultOrder
      }

      return left.label.localeCompare(right.label)
    })
  const workspaceModelOptions = workspaceModelEntries.map(({ value, label }) => ({ value, label }))
  const usedWorkspaceModelCount = workspaceModelEntries.filter((entry) => entry.usageCount > 0).length
  const customWorkspaceModelCount = workspaceModelEntries.filter((entry) => !MODEL_OPTIONS.some((option) => option.value === entry.value)).length
  const quickEstimateSummary = getQuickEstimateSummary(quickEstimate, workspacePricing, workspaceModelOptions)
  const quickEstimateMixTotal = workspaceModelOptions.reduce((sum, option) => sum + Math.max(0, quickEstimate.modelMix[option.value] ?? 0), 0)
  const quickEstimateMixLabel = quickEstimateMixTotal > 0
    ? quickEstimateSummary.normalizedMix
      .filter((option) => option.share > 0.005)
      .map((option) => `${option.label} ${Math.round(option.share * 100)}%`)
      .join(' · ')
    : 'Not set'
  const plannedThroughputPerMinute = agents.length > 0 ? getThroughputPerMinute(scenario, entryAgents.length) : 0
  const baselineAnswerReady = quickEstimate.monthlyVolume > 0 && quickEstimate.averageInputTokens > 0 && quickEstimate.averageOutputTokens > 0 && quickEstimateMixTotal > 0
  const minimumDesignReady = agents.length > 0 && entryAgents.length > 0
  const runtimeScenarioMissingLabels = getRuntimeScenarioMissingLabels(scenario)
  const forecastReady = Boolean(report) && (report?.plannedStarts ?? 0) > 0
  const forecastCostPerSession = report && report.plannedStarts > 0 ? report.totalCost / report.plannedStarts : 0
  const forecastTokensPerSession = report && report.plannedStarts > 0 ? report.totalTokens / report.plannedStarts : 0
  const detailedMonthlySessions = Math.round((report?.throughputPerMinute ?? 0) * 60 * 24 * BUSINESS_CASE_MONTH_DAYS)
  const answerMonthlyTokens = report ? forecastTokensPerSession * detailedMonthlySessions : baselineAnswerReady ? quickEstimateSummary.monthlyTokens : 0
  const answerMonthlyCost = report ? forecastCostPerSession * detailedMonthlySessions : baselineAnswerReady ? quickEstimateSummary.monthlyCost : 0
  const selectedCurrency = workspacePricing.currency
  const selectedCurrencyLabel = selectedCurrency === 'EUR' ? 'EUR (€)' : 'USD ($)'
  const formatCost = (value: number) => formatCurrency(value, selectedCurrency)
  const forecastLeader = report?.summary[0] ?? null
  const quickModeHelper = baselineAnswerReady
    ? 'Quick estimate mode is ready with a rough business-case answer.'
    : `Still needed: ${formatInlineList([
        ...(quickEstimate.monthlyVolume > 0 ? [] : ['Conversations per month']),
        ...(quickEstimate.averageInputTokens > 0 ? [] : ['Average prompt tokens per conversation']),
        ...(quickEstimate.averageOutputTokens > 0 ? [] : ['Average answer tokens per conversation']),
        ...(quickEstimateMixTotal > 0 ? [] : ['At least one model mix value']),
      ])}.`
  const detailedModeHelper = forecastReady
    ? 'Detailed forecast mode is ready from the current system and traffic settings.'
    : !minimumDesignReady
      ? agents.length === 0
        ? 'Add at least one agent and describe how work moves between agents.'
        : 'Add at least one valid entry path by leaving one agent without an incoming handoff.'
      : runtimeScenarioMissingLabels.length > 0
        ? `Still needed: ${formatInlineList(runtimeScenarioMissingLabels)}, then run the forecast.`
        : 'Run the forecast for the current system.'
  const currentAnswerSourceLabel = report ? 'Detailed forecast mode' : baselineAnswerReady ? 'Quick estimate mode' : 'No mode ready yet'
  const readinessItems: RuntimeReadinessItem[] = [
    {
      id: 'quick',
      label: 'Quick estimate mode',
      helper: quickModeHelper,
      ready: baselineAnswerReady,
    },
    {
      id: 'detailed',
      label: 'Detailed forecast mode',
      helper: detailedModeHelper,
      ready: forecastReady,
    },
  ]
  const answerMode = report ? 'detailed' : baselineAnswerReady ? 'baseline' : 'blocked'
  const runtimeAnswerAlertSeverity = answerMode === 'blocked' ? 'warning' : answerMode === 'baseline' ? 'info' : 'success'
  const runtimeAnswerHeadline = answerMode === 'detailed'
    ? 'Forecast ready'
    : answerMode === 'baseline'
      ? 'Early estimate only'
      : 'Not ready yet'
  const runtimeAnswerText = answerMode === 'detailed'
    ? `Plan for about ${formatMetricNumber(answerMonthlyTokens)} tokens and ${formatCost(answerMonthlyCost)} per month under the current setup. That works out to about ${formatMetricNumber(forecastTokensPerSession)} tokens per session.`
    : answerMode === 'baseline'
      ? `Early estimate: about ${formatMetricNumber(quickEstimateSummary.monthlyTokens)} tokens and ${formatCost(quickEstimateSummary.monthlyCost)} per month from the baseline inputs only. Add the system and run the forecast to make this defensible.`
      : 'No answer yet. Use Quick estimate mode for a rough business-case estimate, or use Detailed forecast mode to model agents, handoffs, and traffic.'
  const runtimeAnswerConfidence = answerMode === 'detailed'
    ? 'Medium confidence'
    : answerMode === 'baseline'
      ? 'Low confidence'
      : 'Not ready'
  const nextStepText = estimationMode === 'quick'
    ? baselineAnswerReady
      ? 'Quick estimate mode is ready. Copy the answer or switch to detailed mode for a stronger forecast.'
      : quickModeHelper
    : forecastReady
      ? 'Detailed forecast mode is ready. Copy the answer or refine the system.'
      : detailedModeHelper
  const statusAutoHideDuration = status?.severity === 'error' ? 6500 : status?.severity === 'success' ? 3600 : 4200

  const handleStatusClose = (_event?: Event | React.SyntheticEvent, reason?: string) => {
    if (reason === 'clickaway') {
      return
    }

    setStatus(null)
  }

  const openHeaderLink = (url: string, missingMessage: string) => {
    if (!url) {
      setStatus({ severity: 'info', message: missingMessage })
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const closeContactDialog = () => {
    if (isSubmittingContact) {
      return
    }

    setContactDialogOpen(false)
  }

  const submitContactForm = async () => {
    const name = contactForm.name.trim()
    const email = contactForm.email.trim()
    const message = contactForm.message.trim()

    if (!name || !email || !message) {
      setStatus({ severity: 'info', message: 'Add your name, email, and message before sending.' })
      return
    }

    if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
      setStatus({ severity: 'info', message: 'Enter a valid email address before sending.' })
      return
    }

    setSubmittingContact(true)

    try {
      const response = await fetch(AUTHOR_CONTACT_FORM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          message,
          subject: 'Toki contact request',
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { errors?: Array<{ message?: string }> } | null
        const errorMessage = payload?.errors?.[0]?.message ?? 'The message could not be sent right now.'
        throw new Error(errorMessage)
      }

      setContactForm({ name: '', email: '', message: '' })
      setContactDialogOpen(false)
      setStatus({ severity: 'success', message: 'Message sent to the author.' })
    } catch (error) {
      setStatus({ severity: 'error', message: error instanceof Error ? error.message : 'The message could not be sent right now.' })
    } finally {
      setSubmittingContact(false)
    }
  }

  const resetReport = () => {
    if (report) {
      setReport(null)
    }
  }

  const setQuickEstimateField = <K extends keyof QuickEstimateState>(field: K, value: QuickEstimateState[K]) => {
    setQuickEstimate((current) => ({ ...current, [field]: value }))
  }

  const setQuickEstimateModelMix = (model: string, value: number) => {
    setQuickEstimate((current) => ({
      ...current,
      modelMix: {
        ...current.modelMix,
        [model]: value,
      },
    }))
  }

  const setScenarioField = <K extends keyof ScenarioState>(field: K, value: ScenarioState[K]) => {
    setScenario((current) => ({ ...current, [field]: value }))
    resetReport()
  }

  const updateAgent = <K extends keyof Agent>(agentId: string, field: K, value: Agent[K]) => {
    setAgents((current) => current.map((agent) => (agent.id === agentId ? { ...agent, [field]: value } : agent)))
    resetReport()
  }

  const addAgent = () => {
    const seedAgent = DEFAULT_AGENTS[Math.min(agents.length, Math.max(DEFAULT_AGENTS.length - 1, 0))] ?? DEFAULT_AGENTS[0]
    const model = workspaceModelOptions[0]?.value ?? MODEL_OPTIONS[0]?.value ?? 'gpt-4o-mini'
    const nextId = createId('agent')
    const nextAgent: Agent = {
      ...(seedAgent ?? {
        id: nextId,
        name: `Agent ${agents.length + 1}`,
        model,
        inputTokens: 120,
        outputTokens: 80,
        fixedPromptTokens: 0,
        historyCarryoverTokens: 0,
        ragEnabled: false,
        retrievalMultiplier: 1,
        averageRetrievedChunks: 0,
        averageChunkTokens: 0,
        embeddingTokensPerRetrieval: 0,
        mcpCalls: 0,
        toolMultiplier: 0.15,
        retryProbability: 0,
        fallbackProbability: 0,
        fallbackModel: model,
        routingMode: 'fanout',
      }),
      id: nextId,
      name: `Agent ${agents.length + 1}`,
      model,
      fallbackModel: model,
    }

    setAgents((current) => [...current, nextAgent])
    resetReport()
  }

  const removeAgent = (agentId: string) => {
    setAgents((current) => current.filter((agent) => agent.id !== agentId))
    setEdges((current) => current.filter((edge) => edge.sourceId !== agentId && edge.targetId !== agentId))
    resetReport()
  }

  const addEdge = () => {
    if (agents.length < 2) {
      setStatus({ severity: 'info', message: 'Add at least two agents before creating a handoff.' })
      return
    }

    const source = agents[0]
    const target = agents.find((agent) => agent.id !== source.id) ?? agents[0]

    setEdges((current) => [
      ...current,
      {
        id: createId('edge'),
        sourceId: source.id,
        targetId: target.id,
        weight: 1,
      },
    ])
    resetReport()
  }

  const updateEdge = (edgeId: string, patch: Partial<Edge>) => {
    setEdges((current) => current.map((edge) => (edge.id === edgeId ? { ...edge, ...patch } : edge)))
    resetReport()
  }

  const removeEdge = (edgeId: string) => {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId))
    resetReport()
  }

  const setWorkspacePricingField = (model: string, field: 'in' | 'out', value: number) => {
    setWorkspacePricing((current) => ({
      ...current,
      models: {
        ...current.models,
        [model]: {
          ...getPricing(model, current.models),
          [field]: value,
        },
      },
    }))
    resetReport()
  }

  const setEmbeddingPricePer1M = (value: number) => {
    setWorkspacePricing((current) => ({ ...current, embeddingPricePer1M: value }))
    resetReport()
  }

  const setWorkspacePricingCurrency = (currency: CurrencyCode) => {
    setWorkspacePricing((current) => ({ ...current, currency }))
  }

  const addWorkspaceModel = () => {
    const trimmedName = newModelName.trim()

    if (!trimmedName) {
      setStatus({ severity: 'info', message: 'Enter a model name before creating it.' })
      return
    }

    if (workspaceModelEntries.some((entry) => entry.value.toLowerCase() === trimmedName.toLowerCase())) {
      setStatus({ severity: 'info', message: `${trimmedName} already exists.` })
      return
    }

    const seedModel = MODEL_OPTIONS[0]?.value ?? workspaceModelEntries[0]?.value ?? 'gpt-4o-mini'
    const seedRates = getPricing(seedModel, workspacePricing.models)

    setWorkspacePricing((current) => ({
      ...current,
      models: {
        ...current.models,
        [trimmedName]: { ...seedRates },
      },
    }))
    setQuickEstimate((current) => ({
      ...current,
      modelMix: {
        ...current.modelMix,
        [trimmedName]: current.modelMix[trimmedName] ?? 0,
      },
    }))
    setNewModelName(getNextCustomModelName([...workspaceModelEntries.map((entry) => entry.value), trimmedName]))
    setStatus({ severity: 'success', message: `Added ${trimmedName}.` })
  }

  const loadDemoTopology = () => {
    setAgents(cloneAgents())
    setEdges(cloneEdges())
    setScenario({ ...DEFAULT_SCENARIO })
    setWorkspacePricing(createDefaultWorkspacePricing())
    setQuickEstimate(createDefaultQuickEstimate())
    setTokenPlannerSample({ inputText: '', outputText: '' })
    setNewModelName(getNextCustomModelName(MODEL_OPTIONS.map((option) => option.value)))
    setReport(null)
    setStatus({ severity: 'success', message: 'Loaded the demo workspace.' })
  }

  const exportTopology = () => {
    const documentBody = createTopologyDocument(agents, safeEdges, scenario, workspacePricing, quickEstimate)
    const blob = new Blob([JSON.stringify(documentBody, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 16)

    link.href = url
    link.download = `toki-workspace-${timestamp}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setStatus({ severity: 'success', message: `Workspace exported: ${agents.length} agents, ${safeEdges.length} handoffs, ${usedWorkspaceModelCount} active ${usedWorkspaceModelCount === 1 ? 'model' : 'models'}.` })
  }

  const importTopology = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = parseTopologyDocument(JSON.parse(text))
      const importedModelNames = Array.from(new Set([
        ...parsed.agents.flatMap((agent) => [agent.model, agent.fallbackModel]),
        ...Object.keys(parsed.pricing?.models ?? {}),
      ]))

      setAgents(parsed.agents)
      setEdges(parsed.edges)
      setScenario(parsed.scenario)
      setWorkspacePricing(parsed.pricing ?? createDefaultWorkspacePricing())
      setQuickEstimate(parsed.quickEstimate ?? createEmptyQuickEstimate())
      setNewModelName(getNextCustomModelName([...MODEL_OPTIONS.map((option) => option.value), ...importedModelNames]))
      setReport(null)
      setStatus({ severity: 'success', message: `Imported ${file.name}: ${parsed.agents.length} agents, ${parsed.edges.length} handoffs, ${Object.keys(parsed.pricing.models).length} priced ${Object.keys(parsed.pricing.models).length === 1 ? 'model' : 'models'}.` })
    } catch (error) {
      const importMessage = error instanceof SyntaxError
        ? `${file.name} is not valid JSON.`
        : error instanceof Error
          ? error.message
          : 'Import failed.'
      setStatus({ severity: 'error', message: importMessage })
    } finally {
      input.value = ''
    }
  }

  const copyAnswer = async () => {
    if (!navigator.clipboard?.writeText) {
      setStatus({ severity: 'error', message: 'Clipboard is not available in this browser.' })
      return
    }

    const lines = [
      `Current answer: ${runtimeAnswerText}`,
      `Monthly tokens: ${formatMetricNumber(answerMonthlyTokens)}`,
      `Monthly cost: ${formatCost(answerMonthlyCost)}`,
      `Confidence: ${runtimeAnswerConfidence}`,
      `Next step: ${nextStepText}`,
    ]

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setStatus({ severity: 'success', message: 'Copied the current answer.' })
    } catch (error) {
      setStatus({ severity: 'error', message: error instanceof Error ? error.message : 'Copy failed.' })
    }
  }

  const runSimulation = () => {
    if (!minimumDesignReady) {
      setStatus({ severity: 'info', message: detailedModeHelper })
      return
    }

    const missingScenarioLabels = getRuntimeScenarioMissingLabels(scenario)
    if (missingScenarioLabels.length > 0) {
      setStatus({ severity: 'info', message: `Still needed: ${formatInlineList(missingScenarioLabels)}.` })
      return
    }

    const currentEdges = sanitizeEdges(agents, edges)
    const roots = inferEntryAgents(agents, currentEdges)
    const queue: Array<{ current: string; visits: number; depth: number }> = []
    const totals: Record<string, { visits: number; expectedAttempts: number; input: number; output: number; embedding: number; retrievedContext: number; cost: number; retryCost: number; fallbackCost: number }> = {}

    if (roots.length === 0 || agents.length === 0) {
      setStatus({ severity: 'info', message: 'Add at least one entry agent before running the forecast.' })
      return
    }

    const normalizedScenario: ScenarioState = {
      ...scenario,
      iterations: Math.max(1, scenario.iterations),
      maxDepth: Math.max(1, scenario.maxDepth),
      loadMultiplier: Math.max(0.1, scenario.loadMultiplier),
      virtualUsers: Math.max(1, scenario.virtualUsers),
      rampUpSeconds: Math.max(0, scenario.rampUpSeconds),
      thinkTimeMs: Math.max(0, scenario.thinkTimeMs),
      durationSeconds: Math.max(1, scenario.durationSeconds),
      targetThroughput: Math.max(1, scenario.targetThroughput),
      throughputPeriodSeconds: Math.max(1, scenario.throughputPeriodSeconds),
    }
    const startsPerEntry = getPlannedStartsPerEntry(normalizedScenario)

    roots.forEach((root) => {
      queue.push({ current: root.id, visits: startsPerEntry, depth: 0 })
    })

    while (queue.length > 0) {
      const next = queue.shift()
      if (!next || next.depth > normalizedScenario.maxDepth) {
        continue
      }

      const agent = agents.find((candidate) => candidate.id === next.current)
      if (!agent) {
        continue
      }

      const forecast = getAgentVisitForecast(
        agent,
        normalizedScenario.loadMultiplier,
        next.visits,
        workspacePricing.models,
        workspacePricing.embeddingPricePer1M,
      )
      const current = totals[agent.id] ?? {
        visits: 0,
        expectedAttempts: 0,
        input: 0,
        output: 0,
        embedding: 0,
        retrievedContext: 0,
        cost: 0,
        retryCost: 0,
        fallbackCost: 0,
      }

      current.visits += next.visits
      current.expectedAttempts += forecast.expectedAttempts
      current.input += forecast.inputTokens
      current.output += forecast.outputTokens
      current.embedding += forecast.embeddingTokens
      current.retrievedContext += forecast.retrievedContextTokens
      current.cost += forecast.cost
      current.retryCost += forecast.retryCost
      current.fallbackCost += forecast.fallbackCost
      totals[agent.id] = current

      const outgoingEdges = currentEdges.filter((edge) => edge.sourceId === agent.id)
      getNextTransitions(agent, outgoingEdges, next.visits).forEach((transition) => {
        queue.push({
          current: transition.targetId,
          visits: transition.visits,
          depth: next.depth + 1,
        })
      })
    }

    let totalTokens = 0
    let totalCost = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalEmbeddingTokens = 0
    let totalRetrievedContextTokens = 0

    const summary = agents
      .map((agent) => {
        const totalsForAgent = totals[agent.id] ?? {
          visits: 0,
          expectedAttempts: 0,
          input: 0,
          output: 0,
          embedding: 0,
          retrievedContext: 0,
          cost: 0,
          retryCost: 0,
          fallbackCost: 0,
        }
        const tokens = Math.round(totalsForAgent.input + totalsForAgent.output + totalsForAgent.embedding)

        totalTokens += tokens
        totalCost += totalsForAgent.cost
        totalInputTokens += Math.round(totalsForAgent.input)
        totalOutputTokens += Math.round(totalsForAgent.output)
        totalEmbeddingTokens += Math.round(totalsForAgent.embedding)
        totalRetrievedContextTokens += Math.round(totalsForAgent.retrievedContext)

        return {
          id: agent.id,
          name: agent.name,
          model: agent.model,
          visits: totalsForAgent.visits,
          expectedAttempts: totalsForAgent.expectedAttempts,
          inputTokens: Math.round(totalsForAgent.input),
          outputTokens: Math.round(totalsForAgent.output),
          embeddingTokens: Math.round(totalsForAgent.embedding),
          retrievedContextTokens: Math.round(totalsForAgent.retrievedContext),
          tokens,
          cost: totalsForAgent.cost,
          retryCost: totalsForAgent.retryCost,
          fallbackCost: totalsForAgent.fallbackCost,
          avgTokensPerVisit: totalsForAgent.visits > 0 ? tokens / totalsForAgent.visits : 0,
        }
      })
      .sort((left, right) => right.cost - left.cost)

    setReport({
      totalTokens,
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      totalEmbeddingTokens,
      totalRetrievedContextTokens,
      plannedStarts: getPlannedStarts(normalizedScenario, roots.length),
      plannedDurationSeconds: getPlannedDurationSeconds(normalizedScenario),
      throughputPerMinute: getThroughputPerMinute(normalizedScenario, roots.length),
      summary,
    })
    setStatus({ severity: 'success', message: `Forecast updated for ${agents.length} agents.` })
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        pb: 8,
        background: 'linear-gradient(180deg, #f7f2e7 0%, #f2ecdf 46%, #f6f1e7 100%)',
      }}
    >
      <Container maxWidth="lg" sx={{ pt: { xs: 2.5, md: 3.5 } }}>
        <input ref={fileInputRef} hidden type="file" accept=".json,application/json" onChange={importTopology} />

        <Paper
          elevation={0}
          sx={{
            mb: 3,
            p: { xs: 2, md: 2.5 },
            border: '1px solid rgba(219, 230, 243, 0.18)',
            background: 'linear-gradient(135deg, #0b1523 0%, #102238 54%, #143149 100%)',
            color: '#f7fafc',
            boxShadow: '0 18px 40px rgba(11, 21, 35, 0.26)',
          }}
        >
          <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end', mb: 1.25 }}>
            <Tooltip title="Donate via PayPal">
              <IconButton
                size="small"
                aria-label="Donate via PayPal"
                onClick={() => openHeaderLink(PAYPAL_DONATE_URL, 'Set VITE_PAYPAL_DONATE_URL to enable the PayPal donate button.')}
                sx={{
                  color: '#f7fafc',
                  border: '1px solid rgba(219, 230, 243, 0.28)',
                  bgcolor: 'rgba(255, 255, 255, 0.04)',
                  '&:hover': {
                    borderColor: 'rgba(247, 250, 252, 0.54)',
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                  },
                }}
              >
                <FavoriteRounded fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Contact the author">
              <IconButton
                size="small"
                aria-label="Contact the author"
                onClick={() => setContactDialogOpen(true)}
                sx={{
                  color: '#f7fafc',
                  border: '1px solid rgba(219, 230, 243, 0.28)',
                  bgcolor: 'rgba(255, 255, 255, 0.04)',
                  '&:hover': {
                    borderColor: 'rgba(247, 250, 252, 0.54)',
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                  },
                }}
              >
                <MailOutlineRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5} sx={{ justifyContent: 'space-between', alignItems: { lg: 'center' } }}>
            <Box>
              <TokiLogo light caption="Simple Runtime Token Estimator" />
              <Typography variant="body2" sx={{ mt: 1, maxWidth: 680, color: '#dbe6f3' }}>
                Fill in the basics, describe the agents and handoffs, then run the forecast. The page is intentionally linear and keeps the answer at the bottom.
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gap: 1,
                width: { xs: '100%', lg: 'auto' },
                '& .MuiButton-root': {
                  color: '#f7fafc',
                  borderColor: 'rgba(219, 230, 243, 0.28)',
                  bgcolor: 'rgba(255, 255, 255, 0.04)',
                  justifyContent: 'center',
                  '&:hover': {
                    borderColor: 'rgba(247, 250, 252, 0.54)',
                    bgcolor: 'rgba(255, 255, 255, 0.1)',
                  },
                },
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: 'repeat(3, minmax(0, 1fr))',
                  lg: 'repeat(5, max-content)',
                },
                justifyContent: { lg: 'end' },
              }}
            >
              <Button size="small" variant="outlined" startIcon={<FileUploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                Import workspace
              </Button>
              <Button size="small" variant="outlined" startIcon={<FileDownloadOutlined />} onClick={exportTopology}>
                Export workspace
              </Button>
              <Button size="small" variant="outlined" startIcon={<PaidRounded />} onClick={() => setPricingDialogOpen(true)}>
                Pricing
              </Button>
              <Button size="small" variant="outlined" startIcon={<CalculateRounded />} onClick={() => setTokenAssistantOpen(true)}>
                Token tool
              </Button>
              <Button size="small" variant="outlined" startIcon={<RestartAltRounded />} onClick={loadDemoTopology}>
                Load demo
              </Button>
            </Box>
          </Stack>
        </Paper>

        <Stack spacing={3}>
          <Paper
            sx={{
              p: { xs: 2.25, md: 2.5 },
              border: '1px solid rgba(19, 34, 56, 0.08)',
              bgcolor: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 18px 40px rgba(19, 34, 56, 0.06)',
            }}
          >
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { lg: 'center' } }}>
              <Box>
                <Typography variant="h6">Choose estimation mode</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6, maxWidth: 760 }}>
                  Toki supports two alternative modes. Quick estimate mode gives a rough answer from business volume and average token sizes. Detailed forecast mode models agents, handoffs, and traffic to produce a stronger runtime estimate.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ minWidth: { lg: 360 } }}>
                <Button variant={estimationMode === 'quick' ? 'contained' : 'outlined'} onClick={() => setEstimationMode('quick')}>
                  Quick estimate mode
                </Button>
                <Button variant={estimationMode === 'detailed' ? 'contained' : 'outlined'} onClick={() => setEstimationMode('detailed')}>
                  Detailed forecast mode
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {estimationMode === 'quick' ? (
          <Paper
            sx={{
              p: { xs: 2.25, md: 3 },
              border: '1px solid rgba(19, 34, 56, 0.08)',
              bgcolor: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 24px 60px rgba(19, 34, 56, 0.08)',
            }}
          >
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, lg: 7 }}>
                <Typography variant="h5">Quick estimate mode</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6, mb: 2.5 }}>
                  Fill this in if you only know rough business numbers: how many conversations you have, how large the prompts are, how large the answers are, and which model is usually used.
                </Typography>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Conversations per month"
                      value={quickEstimate.monthlyVolume}
                      helperText="Roughly how many full user conversations happen in one month."
                      onChange={(event) => setQuickEstimateField('monthlyVolume', Math.max(0, Math.round(toNumber(event.target.value, quickEstimate.monthlyVolume))))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Conversations using retrieval (%)"
                      value={quickEstimate.ragUsagePercent}
                      helperText="Percent of conversations that look up docs, knowledge base content, or files before answering."
                      onChange={(event) => setQuickEstimateField('ragUsagePercent', Math.min(100, Math.max(0, Math.round(toNumber(event.target.value, quickEstimate.ragUsagePercent)))))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Average prompt tokens per conversation"
                      value={quickEstimate.averageInputTokens}
                      helperText="Average size of what the system receives from the user and any attached context."
                      onChange={(event) => setQuickEstimateField('averageInputTokens', Math.max(0, Math.round(toNumber(event.target.value, quickEstimate.averageInputTokens))))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="number"
                      label="Average answer tokens per conversation"
                      value={quickEstimate.averageOutputTokens}
                      helperText="Average size of the assistant response that gets sent back."
                      onChange={(event) => setQuickEstimateField('averageOutputTokens', Math.max(0, Math.round(toNumber(event.target.value, quickEstimate.averageOutputTokens))))}
                    />
                  </Grid>
                </Grid>

                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2">Model split</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Tell Toki which model handles which share of conversations. The percentages do not need to add up exactly; Toki normalizes them automatically.
                  </Typography>
                  <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    {workspaceModelOptions.map((option) => (
                      <Grid key={option.value} size={{ xs: 12, md: 4 }}>
                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          label={`${option.label} (%)`}
                          value={quickEstimate.modelMix[option.value] ?? 0}
                          helperText="Share of conversations handled by this model."
                          onChange={(event) => setQuickEstimateModelMix(option.value, Math.max(0, Math.round(toNumber(event.target.value, quickEstimate.modelMix[option.value] ?? 0))))}
                        />
                      </Grid>
                    ))}
                  </Grid>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
                    {quickEstimateMixTotal === 100 ? 'Model mix totals 100%.' : `Model mix totals ${quickEstimateMixTotal}%.`}
                  </Typography>
                </Box>
              </Grid>

              <Grid size={{ xs: 12, lg: 5 }}>
                <Paper variant="outlined" sx={{ p: 2.25, borderColor: 'rgba(19, 34, 56, 0.08)', bgcolor: 'rgba(248, 250, 252, 0.92)' }}>
                  <Typography variant="subtitle2">Quick estimate answer</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2 }}>
                    A rough order-of-magnitude answer using only the basics.
                  </Typography>

                  <Alert severity={runtimeAnswerAlertSeverity} sx={{ mb: 2 }}>
                    <Typography variant="subtitle2">{runtimeAnswerHeadline}</Typography>
                    <Typography variant="body2" sx={{ mt: 0.75 }}>{runtimeAnswerText}</Typography>
                  </Alert>

                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                        <Typography variant="overline" color="text.secondary">Monthly cost</Typography>
                        <Typography variant="h6">{formatCost(quickEstimateSummary.monthlyCost)}</Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                        <Typography variant="overline" color="text.secondary">Cost / session</Typography>
                        <Typography variant="h6">{formatCost(quickEstimateSummary.costPerSession)}</Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                        <Typography variant="overline" color="text.secondary">Tokens / session</Typography>
                        <Typography variant="h6">{formatMetricNumber(quickEstimateSummary.totalTokensPerSession)}</Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                        <Typography variant="overline" color="text.secondary">Model mix</Typography>
                        <Typography variant="body2" sx={{ mt: 0.65 }}>{quickEstimateMixLabel}</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            </Grid>
          </Paper>
          ) : null}

          {estimationMode === 'detailed' ? (
          <>
          <Paper
            sx={{
              p: { xs: 2.25, md: 3 },
              border: '1px solid rgba(19, 34, 56, 0.08)',
              bgcolor: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 24px 60px rgba(19, 34, 56, 0.08)',
            }}
          >
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { lg: 'center' }, mb: 2.5 }}>
              <Box>
                <Typography variant="h5">Detailed mode: system design</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
                  Add the agents, then connect the handoffs between them.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: { lg: 'flex-end' } }}>
                <Chip size="small" label={`${agents.length} agents`} variant="outlined" />
                <Chip size="small" label={`${safeEdges.length} handoffs`} variant="outlined" />
                <Chip size="small" label={`${entryAgents.length} entry ${entryAgents.length === 1 ? 'point' : 'points'}`} color="primary" variant="outlined" />
                <Button
                  size="small"
                  variant="outlined"
                  disabled={agents.length === 0}
                  onClick={() => {
                    setTopologyDialogOpen(true)
                    setTopologySelectedAgentId((current) => current ?? entryAgents[0]?.id ?? agents[0]?.id ?? null)
                  }}
                >
                  View topology
                </Button>
              </Stack>
            </Stack>

            <Stack spacing={2.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                <Box>
                  <Typography variant="h6">Agents</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Focus on the main cost drivers first. Open the advanced section only when you need extra tuning.
                  </Typography>
                </Box>
                <Button startIcon={<AddRounded />} variant="contained" onClick={addAgent}>
                  Add agent
                </Button>
              </Stack>

              <Paper variant="outlined" sx={{ p: 2, borderColor: 'rgba(19, 34, 56, 0.08)', bgcolor: 'rgba(248, 250, 252, 0.72)' }}>
                <Typography variant="subtitle2">Logic controller guide</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
                  The logic controller decides what happens when an agent has more than one outgoing handoff.
                </Typography>
                <Grid container spacing={1.5} sx={{ mt: 0.35 }}>
                  {ROUTING_MODE_OPTIONS.map((option) => (
                    <Grid key={option.value} size={{ xs: 12, md: 4 }}>
                      <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                        <Typography variant="subtitle2">{option.label}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
                          {option.helper}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Paper>

              {agents.length === 0 ? (
                <Alert severity="info">No agents yet. Add the first agent to describe the system.</Alert>
              ) : (
                <Stack spacing={2}>
                  {agents.map((agent) => (
                    <Card key={agent.id} variant="outlined" sx={{ borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                      <CardContent>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2, justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="subtitle1">{agent.name}</Typography>
                            <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
                              <Chip size="small" label={getModelLabel(agent.model)} variant="outlined" />
                              <Chip size="small" label={getRoutingModeShortLabel(agent.routingMode)} variant="outlined" />
                              {agent.ragEnabled ? <Chip size="small" label="RAG" color="success" /> : null}
                            </Stack>
                          </Box>
                          <IconButton color="error" onClick={() => removeAgent(agent.id)}>
                            <DeleteOutlineRounded />
                          </IconButton>
                        </Stack>

                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, md: 4 }}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Agent name"
                              value={agent.name}
                              onChange={(event) => updateAgent(agent.id, 'name', event.target.value)}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 4 }}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Model</InputLabel>
                              <Select label="Model" value={agent.model} onChange={(event) => updateAgent(agent.id, 'model', String(event.target.value))}>
                                {workspaceModelOptions.map((option) => (
                                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                ))}
                              </Select>
                              <FormHelperText>Main model used by this agent.</FormHelperText>
                            </FormControl>
                          </Grid>
                          <Grid size={{ xs: 12, md: 4 }}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Logic controller</InputLabel>
                              <Select label="Logic controller" value={agent.routingMode} onChange={(event) => updateAgent(agent.id, 'routingMode', event.target.value as RoutingMode)}>
                                {ROUTING_MODE_OPTIONS.map((option) => (
                                  <MenuItem key={option.value} value={option.value} sx={{ alignItems: 'flex-start' }}>
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {option.label}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, whiteSpace: 'normal' }}>
                                        {option.helper}
                                      </Typography>
                                    </Box>
                                  </MenuItem>
                                ))}
                              </Select>
                              <FormHelperText>
                                {ROUTING_MODE_OPTIONS.find((option) => option.value === agent.routingMode)?.helper ?? 'Choose how this agent sends traffic across outgoing handoffs.'}
                              </FormHelperText>
                            </FormControl>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              label="Input tokens / call"
                              value={agent.inputTokens}
                              onChange={(event) => updateAgent(agent.id, 'inputTokens', Math.max(0, Math.round(toNumber(event.target.value, agent.inputTokens))))}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              label="Output tokens / call"
                              value={agent.outputTokens}
                              onChange={(event) => updateAgent(agent.id, 'outputTokens', Math.max(0, Math.round(toNumber(event.target.value, agent.outputTokens))))}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              label="Fixed prompt overhead"
                              value={agent.fixedPromptTokens}
                              onChange={(event) => updateAgent(agent.id, 'fixedPromptTokens', Math.max(0, Math.round(toNumber(event.target.value, agent.fixedPromptTokens))))}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              label="Previous messages reused"
                              value={agent.historyCarryoverTokens}
                              helperText="Tokens from earlier turns that get sent again on each new call in the same conversation. Use 0 if each call starts fresh."
                              onChange={(event) => updateAgent(agent.id, 'historyCarryoverTokens', Math.max(0, Math.round(toNumber(event.target.value, agent.historyCarryoverTokens))))}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Paper variant="outlined" sx={{ p: 2, height: '100%', borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                              <FormControlLabel
                                control={<Switch checked={agent.ragEnabled} onChange={(event) => updateAgent(agent.id, 'ragEnabled', event.target.checked)} />}
                                label="Enable RAG"
                              />
                              <TextField
                                fullWidth
                                size="small"
                                type="number"
                                label="Avg chunks retrieved"
                                value={agent.averageRetrievedChunks}
                                disabled={!agent.ragEnabled}
                                onChange={(event) => updateAgent(agent.id, 'averageRetrievedChunks', Math.max(0, toNumber(event.target.value, agent.averageRetrievedChunks)))}
                                sx={{ mt: 1.5 }}
                              />
                              <TextField
                                fullWidth
                                size="small"
                                type="number"
                                label="Avg chunk size (tokens)"
                                value={agent.averageChunkTokens}
                                disabled={!agent.ragEnabled}
                                onChange={(event) => updateAgent(agent.id, 'averageChunkTokens', Math.max(0, Math.round(toNumber(event.target.value, agent.averageChunkTokens))))}
                                sx={{ mt: 1.5 }}
                              />
                            </Paper>
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Paper variant="outlined" sx={{ p: 2, height: '100%', borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                              <TextField
                                fullWidth
                                size="small"
                                type="number"
                                label="MCP calls"
                                value={agent.mcpCalls}
                                onChange={(event) => updateAgent(agent.id, 'mcpCalls', Math.max(0, Math.round(toNumber(event.target.value, agent.mcpCalls))))}
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
                                Keep this short view focused on the main cost drivers.
                              </Typography>
                            </Paper>
                          </Grid>
                        </Grid>

                        <Accordion disableGutters elevation={0} sx={{ mt: 2, border: '1px solid rgba(19, 34, 56, 0.08)', bgcolor: 'rgba(248, 250, 252, 0.72)' }}>
                          <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                            <Box>
                              <Typography variant="subtitle2">Advanced agent settings</Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                                Retrieval multiplier, tool expansion, retries, and fallback behavior.
                              </Typography>
                            </Box>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Grid container spacing={2}>
                              <Grid size={{ xs: 12, md: 4 }}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  slotProps={{ htmlInput: { step: 0.1, min: 1 } }}
                                  label="Retrieval multiplier"
                                  value={agent.retrievalMultiplier}
                                  disabled={!agent.ragEnabled}
                                  onChange={(event) => updateAgent(agent.id, 'retrievalMultiplier', Math.max(1, toNumber(event.target.value, agent.retrievalMultiplier)))}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, md: 4 }}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  label="Embedding tokens / retrieval"
                                  value={agent.embeddingTokensPerRetrieval}
                                  disabled={!agent.ragEnabled}
                                  onChange={(event) => updateAgent(agent.id, 'embeddingTokensPerRetrieval', Math.max(0, Math.round(toNumber(event.target.value, agent.embeddingTokensPerRetrieval))))}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, md: 4 }}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  slotProps={{ htmlInput: { step: 0.05, min: 0 } }}
                                  label="Tool multiplier"
                                  value={agent.toolMultiplier}
                                  disabled={agent.mcpCalls === 0}
                                  onChange={(event) => updateAgent(agent.id, 'toolMultiplier', Math.max(0, toNumber(event.target.value, agent.toolMultiplier)))}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, md: 4 }}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  slotProps={{ htmlInput: { step: 0.01, min: 0, max: 1 } }}
                                  label="Retry probability"
                                  value={agent.retryProbability}
                                  onChange={(event) => updateAgent(agent.id, 'retryProbability', Math.min(1, Math.max(0, toNumber(event.target.value, agent.retryProbability))))}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, md: 4 }}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  slotProps={{ htmlInput: { step: 0.01, min: 0, max: 1 } }}
                                  label="Fallback probability"
                                  value={agent.fallbackProbability}
                                  onChange={(event) => updateAgent(agent.id, 'fallbackProbability', Math.min(1, Math.max(0, toNumber(event.target.value, agent.fallbackProbability))))}
                                />
                              </Grid>
                              <Grid size={{ xs: 12, md: 4 }}>
                                <FormControl fullWidth size="small">
                                  <InputLabel>Fallback model</InputLabel>
                                  <Select label="Fallback model" value={agent.fallbackModel} disabled={agent.fallbackProbability === 0} onChange={(event) => updateAgent(agent.id, 'fallbackModel', String(event.target.value))}>
                                    {workspaceModelOptions.map((option) => (
                                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              </Grid>
                            </Grid>
                          </AccordionDetails>
                        </Accordion>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}

              <Divider />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                <Box>
                  <Typography variant="h6">Handoffs</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Connect one agent to another and set the weight for that handoff.
                  </Typography>
                </Box>
                <Button startIcon={<AddRounded />} variant="outlined" onClick={addEdge} disabled={agents.length < 2}>
                  Add handoff
                </Button>
              </Stack>

              {safeEdges.length === 0 ? (
                <Alert severity="info">No handoffs yet. If you leave it that way, each agent acts like its own entry point.</Alert>
              ) : (
                <Stack spacing={2}>
                  {safeEdges.map((edge) => (
                    <Card key={edge.id} variant="outlined" sx={{ borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                      <CardContent>
                        <Stack direction="row" sx={{ mb: 2, justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box>
                            <Typography variant="subtitle2">{edge.id}</Typography>
                            <Typography variant="caption" color="text.secondary">Routing handoff</Typography>
                          </Box>
                          <IconButton color="error" size="small" onClick={() => removeEdge(edge.id)}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Stack>

                        <Stack spacing={2}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Source agent</InputLabel>
                            <Select label="Source agent" value={edge.sourceId} onChange={(event) => updateEdge(edge.id, { sourceId: String(event.target.value) })}>
                              {agents.map((agent) => (
                                <MenuItem key={agent.id} value={agent.id}>{agent.name}</MenuItem>
                              ))}
                            </Select>
                            <FormHelperText>Agent that sends work into this handoff.</FormHelperText>
                          </FormControl>
                          <FormControl fullWidth size="small">
                            <InputLabel>Target agent</InputLabel>
                            <Select label="Target agent" value={edge.targetId} onChange={(event) => updateEdge(edge.id, { targetId: String(event.target.value) })}>
                              {agents.map((agent) => (
                                <MenuItem key={agent.id} value={agent.id}>{agent.name}</MenuItem>
                              ))}
                            </Select>
                            <FormHelperText>Agent that receives work when this handoff is taken.</FormHelperText>
                          </FormControl>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
                            label="Weight"
                            value={edge.weight}
                            helperText="Fan-out multiplies traffic. Weighted mode treats this as branch weight."
                            onChange={(event) => updateEdge(edge.id, { weight: Math.max(0, toNumber(event.target.value, edge.weight)) })}
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper
            sx={{
              p: { xs: 2.25, md: 3 },
              border: '1px solid rgba(19, 34, 56, 0.08)',
              bgcolor: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 24px 60px rgba(19, 34, 56, 0.08)',
            }}
          >
            <Typography variant="h5">Detailed mode: traffic forecast</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2.5 }}>
              Translate the business traffic into a concrete runtime forecast.
            </Typography>

            <Stack spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Demand pattern</InputLabel>
                <Select
                  label="Demand pattern"
                  value={scenario.scheduleMode}
                  onChange={(event) => setScenarioField('scheduleMode', event.target.value as ScheduleMode)}
                >
                  {BUSINESS_TRAFFIC_PATTERNS.map((pattern) => (
                    <MenuItem key={pattern.value} value={pattern.value}>
                      <Stack spacing={0.15}>
                        <Typography variant="body2">{pattern.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{pattern.helper}</Typography>
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>{getTrafficPatternHelper(scenario.scheduleMode)}</FormHelperText>
              </FormControl>

              {scenario.scheduleMode === 'closed' ? (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Active sessions at once"
                      value={scenario.virtualUsers}
                      onChange={(event) => setScenarioField('virtualUsers', Math.max(0, Math.round(toNumber(event.target.value, scenario.virtualUsers))))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Journeys per active session"
                      value={scenario.iterations}
                      onChange={(event) => setScenarioField('iterations', Math.max(0, Math.round(toNumber(event.target.value, scenario.iterations))))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Rollout window (seconds)"
                      value={scenario.rampUpSeconds}
                      onChange={(event) => setScenarioField('rampUpSeconds', Math.max(0, Math.round(toNumber(event.target.value, scenario.rampUpSeconds))))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Idle time between journeys (ms)"
                      value={scenario.thinkTimeMs}
                      onChange={(event) => setScenarioField('thinkTimeMs', Math.max(0, Math.round(toNumber(event.target.value, scenario.thinkTimeMs))))}
                    />
                  </Grid>
                </Grid>
              ) : (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Delivery capacity"
                      value={scenario.virtualUsers}
                      onChange={(event) => setScenarioField('virtualUsers', Math.max(0, Math.round(toNumber(event.target.value, scenario.virtualUsers))))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="New sessions per interval"
                      value={scenario.targetThroughput}
                      onChange={(event) => setScenarioField('targetThroughput', Math.max(0, toNumber(event.target.value, scenario.targetThroughput)))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Interval length (seconds)"
                      value={scenario.throughputPeriodSeconds}
                      onChange={(event) => setScenarioField('throughputPeriodSeconds', Math.max(0, Math.round(toNumber(event.target.value, scenario.throughputPeriodSeconds))))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      type="number"
                      label="Planning window (seconds)"
                      value={scenario.durationSeconds}
                      onChange={(event) => setScenarioField('durationSeconds', Math.max(0, Math.round(toNumber(event.target.value, scenario.durationSeconds))))}
                    />
                  </Grid>
                </Grid>
              )}

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    type="number"
                    slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
                    label="Prompt/response growth factor"
                    value={scenario.loadMultiplier}
                    onChange={(event) => setScenarioField('loadMultiplier', Math.max(0, toNumber(event.target.value, scenario.loadMultiplier)))}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Max handoffs followed"
                    value={scenario.maxDepth}
                    onChange={(event) => setScenarioField('maxDepth', Math.max(0, Math.round(toNumber(event.target.value, scenario.maxDepth))))}
                  />
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Chip label={getTrafficPatternLabel(scenario.scheduleMode)} variant="outlined" />
                <Chip label={`${formatMetricNumber(plannedThroughputPerMinute)} starts / min`} variant="outlined" />
                <Chip label={`Growth x${scenario.loadMultiplier.toFixed(1)}`} variant="outlined" />
              </Stack>

              <Button fullWidth size="large" variant="contained" startIcon={<PlayArrowRounded />} onClick={runSimulation}>
                Run forecast
              </Button>
            </Stack>
          </Paper>
          </>
          ) : null}

          <Paper
            sx={{
              p: { xs: 2.25, md: 3 },
              border: '1px solid rgba(19, 34, 56, 0.08)',
              bgcolor: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(14px)',
              boxShadow: '0 24px 60px rgba(19, 34, 56, 0.08)',
            }}
          >
            <Typography variant="h5">Current answer</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              This answer uses whichever mode is currently ready.
            </Typography>

            <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: 'wrap' }}>
              <Chip size="small" label={currentAnswerSourceLabel} color={report ? 'success' : baselineAnswerReady ? 'info' : 'default'} variant="outlined" />
            </Stack>

            <Alert severity={runtimeAnswerAlertSeverity} sx={{ mt: 2.5 }}>
              <Typography variant="subtitle2">{runtimeAnswerHeadline}</Typography>
              <Typography variant="body2" sx={{ mt: 0.75 }}>{runtimeAnswerText}</Typography>
            </Alert>

            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                  <Typography variant="overline" color="text.secondary">Monthly tokens</Typography>
                  <Typography variant="h6">{formatMetricNumber(answerMonthlyTokens)}</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                  <Typography variant="overline" color="text.secondary">Monthly cost</Typography>
                  <Typography variant="h6">{formatCost(answerMonthlyCost)}</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                  <Typography variant="overline" color="text.secondary">Confidence</Typography>
                  <Typography variant="h6">{runtimeAnswerConfidence}</Typography>
                </Paper>
              </Grid>
            </Grid>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 2.5 }}>
              {(answerMode === 'baseline' || answerMode === 'detailed') ? (
                <Button variant="contained" onClick={copyAnswer}>
                  Copy answer
                </Button>
              ) : null}
            </Stack>

            <Accordion disableGutters elevation={0} sx={{ mt: 2.5, border: '1px solid rgba(19, 34, 56, 0.08)', bgcolor: 'rgba(248, 250, 252, 0.72)' }}>
              <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                <Box>
                  <Typography variant="subtitle2">Checks and details</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                    {nextStepText}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1.1}>
                  {readinessItems.map((item) => (
                    <Paper key={item.id} variant="outlined" sx={{ p: 1.25, borderColor: item.ready ? 'rgba(15, 118, 110, 0.24)' : 'rgba(19, 34, 56, 0.08)' }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                        <Box>
                          <Typography variant="subtitle2">{item.label}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>
                            {item.helper}
                          </Typography>
                        </Box>
                        <Chip size="small" label={item.ready ? 'Ready' : 'Missing'} color={item.ready ? 'success' : 'warning'} variant="outlined" />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>

                {forecastLeader ? (
                  <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                    <Typography variant="subtitle2">Largest cost driver</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {`${forecastLeader.name} currently leads the forecast at ${formatCost(forecastLeader.cost)} and ${formatMetricNumber(forecastLeader.tokens)} tokens.`}
                    </Typography>
                  </Paper>
                ) : null}

                {report ? (
                  <Stack spacing={1.25} sx={{ mt: 2 }}>
                    {report.summary.map((summary) => (
                      <Paper key={summary.id} variant="outlined" sx={{ p: 1.25, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                          <Box>
                            <Typography variant="subtitle2">{summary.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{getModelLabel(summary.model)}</Typography>
                          </Box>
                          <Box sx={{ textAlign: { sm: 'right' } }}>
                            <Typography variant="subtitle2">{formatCost(summary.cost)}</Typography>
                            <Typography variant="caption" color="text.secondary">{`${formatMetricNumber(summary.tokens)} tokens`}</Typography>
                          </Box>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : null}
              </AccordionDetails>
            </Accordion>
          </Paper>
        </Stack>

        <Dialog open={isTopologyDialogOpen} onClose={() => setTopologyDialogOpen(false)} maxWidth="xl" fullWidth fullScreen={isPhoneLayout}>
          <DialogTitle>System topology</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                This map shows how agents connect, where traffic enters the system, and the estimated spend profile for each node. Click any node to highlight its connected handoffs.
              </Typography>
              <TopologyCanvas
                agents={agents}
                edges={safeEdges}
                entryAgents={entryAgents}
                selectedAgentId={topologySelectedAgentId}
                report={report}
                workspacePricing={workspacePricing}
                onSelectAgent={setTopologySelectedAgentId}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTopologyDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={isPricingDialogOpen} onClose={() => setPricingDialogOpen(false)} maxWidth="lg" fullWidth fullScreen={isPhoneLayout}>
          <DialogTitle>
            <Stack spacing={0.65}>
              <Typography variant="h6">Workspace pricing and model catalog</Typography>
              <Typography variant="body2" color="text.secondary">
                Maintain the shared model catalog and the exact provider rates used in forecasts, estimates, and topology cost views.
              </Typography>
            </Stack>
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5} sx={{ pt: 0.5 }}>
              <Paper variant="outlined" sx={{ p: 2, borderColor: 'rgba(19, 34, 56, 0.08)', bgcolor: 'rgba(248, 250, 252, 0.68)' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}>
                  <Box>
                    <Typography variant="subtitle2">Catalog summary</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45 }}>
                      Provider rates in this workspace are stored per 1,000,000 tokens. Toki uses the same catalog across quick estimates, detailed forecasts, and topology cost views.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    <Chip size="small" label={selectedCurrencyLabel} variant="outlined" />
                    <Chip size="small" label={`${workspaceModelEntries.length} catalog models`} variant="outlined" />
                    <Chip size="small" label={`${usedWorkspaceModelCount} in use`} color="primary" variant="outlined" />
                    <Chip size="small" label={`${customWorkspaceModelCount} custom`} variant="outlined" />
                  </Stack>
                </Stack>
              </Paper>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2, borderColor: 'rgba(19, 34, 56, 0.08)', height: '100%' }}>
                    <Typography variant="subtitle2">Pricing basis</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
                      Choose the display currency and set the embedding rate used when retrieval is enabled.
                    </Typography>
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Forecast currency</InputLabel>
                          <Select label="Forecast currency" value={selectedCurrency} onChange={(event) => setWorkspacePricingCurrency(event.target.value as CurrencyCode)}>
                            <MenuItem value="USD">USD ($)</MenuItem>
                            <MenuItem value="EUR">EUR (€)</MenuItem>
                          </Select>
                          <FormHelperText>Labels and totals switch currency, but Toki does not auto-convert the numeric rates you already entered.</FormHelperText>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField
                          fullWidth
                          size="small"
                          type="number"
                          slotProps={{ htmlInput: { step: 0.0001, min: 0 } }}
                          label={`Embedding cost (${selectedCurrency} / 1M tokens)`}
                          helperText={`Equivalent to ${formatCost(workspacePricing.embeddingPricePer1M / 1000)} per 1K tokens.`}
                          value={workspacePricing.embeddingPricePer1M}
                          onChange={(event) => setEmbeddingPricePer1M(toNumber(event.target.value, workspacePricing.embeddingPricePer1M))}
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12, lg: 6 }}>
                  <Paper variant="outlined" sx={{ p: 2, borderColor: 'rgba(19, 34, 56, 0.08)', height: '100%' }}>
                    <Typography variant="subtitle2">Custom models</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
                      Add models that are missing from the default catalog so they become available in agents and quick estimates.
                    </Typography>
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                      <Grid size={{ xs: 12, md: 8 }}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Custom model name"
                          helperText={customWorkspaceModelCount > 0 ? `${customWorkspaceModelCount} custom ${customWorkspaceModelCount === 1 ? 'model is' : 'models are'} already in this workspace.` : 'No custom models added yet.'}
                          value={newModelName}
                          onChange={(event) => setNewModelName(event.target.value)}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, md: 4 }}>
                        <Button fullWidth variant="contained" startIcon={<AddRounded />} onClick={addWorkspaceModel} sx={{ height: '100%' }}>
                          Add model
                        </Button>
                      </Grid>
                    </Grid>
                  </Paper>
                </Grid>
              </Grid>

              <Paper variant="outlined" sx={{ borderColor: 'rgba(19, 34, 56, 0.08)', overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid rgba(19, 34, 56, 0.08)', bgcolor: 'rgba(248, 250, 252, 0.6)' }}>
                  <Typography variant="subtitle2">Model rates</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45 }}>
                    Edit the exact provider rates below. Input means prompt-side tokens sent to the model. Output means generated answer tokens returned by the model.
                  </Typography>
                </Box>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Model</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Usage</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 180 }}>{`Input (${selectedCurrency} / 1M)`}</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 180 }}>{`Output (${selectedCurrency} / 1M)`}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Quick reference</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {workspaceModelEntries.map((entry) => (
                        <TableRow key={entry.value} hover>
                          <TableCell>
                            <Typography variant="subtitle2">{entry.label}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>
                              {entry.value}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={entry.usageCount > 0 ? `${entry.usageCount} ${entry.usageCount === 1 ? 'agent' : 'agents'}` : 'Not used'}
                              color={entry.usageCount > 0 ? 'primary' : 'default'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              slotProps={{ htmlInput: { step: 0.0001, min: 0 } }}
                              value={entry.rates.in}
                              onChange={(event) => setWorkspacePricingField(entry.value, 'in', toNumber(event.target.value, entry.rates.in))}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              type="number"
                              slotProps={{ htmlInput: { step: 0.0001, min: 0 } }}
                              value={entry.rates.out}
                              onChange={(event) => setWorkspacePricingField(entry.value, 'out', toNumber(event.target.value, entry.rates.out))}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {`≈ ${formatCost(entry.rates.in / 1000)} / 1K input`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                              {`≈ ${formatCost(entry.rates.out / 1000)} / 1K output`}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Paper>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPricingDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={isTokenAssistantOpen} onClose={() => setTokenAssistantOpen(false)} maxWidth="md" fullWidth fullScreen={isPhoneLayout}>
          <DialogTitle>Token tool</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5} sx={{ pt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Paste representative input and output text to estimate token volume before filling in the numeric fields manually.
              </Typography>

              <TokenAssistantPanel
                showContainer={false}
                showApplyActions={false}
                title="Token tool"
                description="Paste representative prompt and response text to estimate token volume."
                tokenSample={tokenPlannerSample}
                onTokenSampleChange={(field, value) => {
                  setTokenPlannerSample((current) => ({
                    ...current,
                    [field]: value,
                  }))
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={() => setTokenAssistantOpen(false)}>
              Close
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={isContactDialogOpen} onClose={closeContactDialog} maxWidth="sm" fullWidth fullScreen={isPhoneLayout}>
          <DialogTitle>Contact the author</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.25} sx={{ pt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Send a short message directly from the app. Delivery is handled behind the scenes by Formspree.
              </Typography>
              <TextField
                autoFocus
                fullWidth
                size="small"
                label="Your name"
                value={contactForm.name}
                onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
              />
              <TextField
                fullWidth
                size="small"
                type="email"
                label="Your email"
                value={contactForm.email}
                onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
              />
              <TextField
                fullWidth
                multiline
                minRows={5}
                label="Message"
                placeholder="What do you want to ask or report?"
                value={contactForm.message}
                onChange={(event) => setContactForm((current) => ({ ...current, message: event.target.value }))}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeContactDialog} disabled={isSubmittingContact}>
              Cancel
            </Button>
            <Button variant="contained" onClick={submitContactForm} disabled={isSubmittingContact}>
              {isSubmittingContact ? 'Sending...' : 'Send message'}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={Boolean(status)}
          autoHideDuration={statusAutoHideDuration}
          onClose={handleStatusClose}
          anchorOrigin={{ vertical: isPhoneLayout ? 'top' : 'bottom', horizontal: isPhoneLayout ? 'center' : 'right' }}
          sx={{
            '& .MuiSnackbar-root': {
              maxWidth: '100%',
            },
          }}
        >
          <Alert
            onClose={handleStatusClose}
            severity={status?.severity ?? 'info'}
            variant="filled"
            sx={{
              width: { xs: 'calc(100vw - 24px)', sm: 420 },
              alignItems: 'center',
              borderRadius: 14,
              border: '1px solid rgba(255, 255, 255, 0.14)',
              boxShadow: '0 18px 36px rgba(11, 21, 35, 0.24)',
              backdropFilter: 'blur(14px)',
              '& .MuiAlert-message': {
                fontWeight: 600,
              },
              '&::after': {
                content: '""',
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 3,
                opacity: 0.48,
                bgcolor: 'rgba(255, 255, 255, 0.78)',
              },
            }}
          >
            {status?.message ?? ''}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  )
}