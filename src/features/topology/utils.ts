import { DEFAULT_AGENTS, DEFAULT_EDGES, DEFAULT_SCENARIO, EMBEDDING_PRICE_PER_1M, MODEL_OPTIONS, PRICING, PRICING_TOKENS_PER_UNIT, ROUTING_MODE_OPTIONS, SCHEDULE_MODE_OPTIONS } from './config'
import type {
  Agent,
  CurrencyCode,
  Edge,
  LayoutNode,
  PricingMap,
  QuickEstimateState,
  RoutingMode,
  ScenarioState,
  ScheduleMode,
  SimulationReport,
  TokenSampleState,
  TopologyDocument,
  TraceComparisonReport,
  TraceReport,
  TraceSummary,
  WorkspacePricing,
} from './types'

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function clampProbability(value: unknown): number {
  return Math.min(1, Math.max(0, toNumber(value, 0)))
}

export function cloneAgents(): Agent[] {
  return DEFAULT_AGENTS.map((agent) => ({ ...agent }))
}

export function cloneEdges(): Edge[] {
  return DEFAULT_EDGES.map((edge) => ({ ...edge }))
}

export function clonePricingMap(pricing: PricingMap = PRICING): PricingMap {
  return Object.fromEntries(Object.entries(pricing).map(([model, rates]) => [model, { ...rates }]))
}

export function createDefaultWorkspacePricing(): WorkspacePricing {
  return {
    models: clonePricingMap(PRICING),
    embeddingPricePer1M: EMBEDDING_PRICE_PER_1M,
    currency: 'USD',
  }
}

export function createDefaultQuickEstimate(): QuickEstimateState {
  const totalAgents = Math.max(DEFAULT_AGENTS.length, 1)
  let assignedMix = 0

  const modelMix = MODEL_OPTIONS.reduce<Record<string, number>>((current, option, index) => {
    const matchingAgents = DEFAULT_AGENTS.filter((agent) => agent.model === option.value).length
    const nextValue = index === MODEL_OPTIONS.length - 1 ? Math.max(0, 100 - assignedMix) : Math.round((matchingAgents / totalAgents) * 100)

    current[option.value] = nextValue
    assignedMix += nextValue
    return current
  }, {})

  return {
    monthlyVolume: 50000,
    averageInputTokens: Math.round(DEFAULT_AGENTS.reduce((sum, agent) => sum + agent.inputTokens, 0) / totalAgents),
    averageOutputTokens: Math.round(DEFAULT_AGENTS.reduce((sum, agent) => sum + agent.outputTokens, 0) / totalAgents),
    ragUsagePercent: Math.round((DEFAULT_AGENTS.filter((agent) => agent.ragEnabled).length / totalAgents) * 100),
    modelMix,
  }
}

export function createEmptyQuickEstimate(): QuickEstimateState {
  return {
    monthlyVolume: 0,
    averageInputTokens: 0,
    averageOutputTokens: 0,
    ragUsagePercent: 0,
    modelMix: MODEL_OPTIONS.reduce<Record<string, number>>((current, option) => {
      current[option.value] = 0
      return current
    }, {}),
  }
}

export function getPricing(model: string, pricingMap: PricingMap = PRICING): { in: number; out: number } {
  return pricingMap[model] ?? { in: 0, out: 0 }
}

export function getModelLabel(model: string): string {
  return MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model
}

export function getRoutingModeLabel(mode: RoutingMode): string {
  return ROUTING_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode
}

export function getRoutingModeShortLabel(mode: RoutingMode): string {
  const label = getRoutingModeLabel(mode)
  return label.split('/')[0].trim()
}

export function getScheduleModeLabel(mode: ScheduleMode): string {
  return SCHEDULE_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode
}

export function formatCurrency(value: number, currency: CurrencyCode = 'USD'): string {
  const fractionDigits = value >= 10 ? 2 : value >= 1 ? 3 : 4

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatMetricNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  }

  return `${Math.round(value)}`
}

export function getRetrievedContextTokens(agent: Agent): number {
  if (!agent.ragEnabled) {
    return 0
  }

  return Math.round(Math.max(0, agent.averageRetrievedChunks) * Math.max(0, agent.averageChunkTokens) * Math.max(0, agent.retrievalMultiplier))
}

export function getEmbeddingTokensPerVisit(agent: Agent): number {
  if (!agent.ragEnabled) {
    return 0
  }

  return Math.max(0, Math.round(agent.embeddingTokensPerRetrieval))
}

export function getInputTokensPerVisit(agent: Agent): number {
  return Math.max(0, Math.round(agent.inputTokens + agent.fixedPromptTokens + agent.historyCarryoverTokens + getRetrievedContextTokens(agent)))
}

export function getOutputTokensPerVisit(agent: Agent): number {
  const toolExpansion = agent.mcpCalls > 0 ? 1 + agent.mcpCalls * agent.toolMultiplier : 1
  return Math.max(0, Math.round(agent.outputTokens * toolExpansion))
}

export function getAgentVisitForecast(agent: Agent, loadMultiplier = 1, visits = 1, pricingMap: PricingMap = PRICING, embeddingPricePer1M = EMBEDDING_PRICE_PER_1M): {
  expectedAttempts: number
  inputTokens: number
  outputTokens: number
  embeddingTokens: number
  retrievedContextTokens: number
  tokens: number
  cost: number
  retryCost: number
  fallbackCost: number
} {
  const safeVisits = Math.max(0, visits)
  const safeLoadMultiplier = Math.max(0.1, loadMultiplier)
  const retryAttempts = safeVisits * clampProbability(agent.retryProbability)
  const fallbackAttempts = safeVisits * clampProbability(agent.fallbackProbability)
  const primaryAttempts = safeVisits
  const sameModelAttempts = primaryAttempts + retryAttempts
  const totalAttempts = sameModelAttempts + fallbackAttempts

  const inputTokensPerAttempt = Math.round(getInputTokensPerVisit(agent) * safeLoadMultiplier)
  const outputTokensPerAttempt = Math.round(getOutputTokensPerVisit(agent) * safeLoadMultiplier)
  const embeddingTokensPerAttempt = Math.round(getEmbeddingTokensPerVisit(agent) * safeLoadMultiplier)
  const retrievedContextTokensPerAttempt = Math.round(getRetrievedContextTokens(agent) * safeLoadMultiplier)

  const inputTokens = Math.round(inputTokensPerAttempt * totalAttempts)
  const outputTokens = Math.round(outputTokensPerAttempt * totalAttempts)
  const embeddingTokens = Math.round(embeddingTokensPerAttempt * sameModelAttempts)
  const retrievedContextTokens = Math.round(retrievedContextTokensPerAttempt * totalAttempts)

  const pricing = getPricing(agent.model, pricingMap)
  const fallbackPricing = getPricing(agent.fallbackModel || agent.model, pricingMap)
  const baseCost = (inputTokensPerAttempt * primaryAttempts) / PRICING_TOKENS_PER_UNIT * pricing.in + (outputTokensPerAttempt * primaryAttempts) / PRICING_TOKENS_PER_UNIT * pricing.out + (embeddingTokensPerAttempt * primaryAttempts) / PRICING_TOKENS_PER_UNIT * embeddingPricePer1M
  const retryCost = (inputTokensPerAttempt * retryAttempts) / PRICING_TOKENS_PER_UNIT * pricing.in + (outputTokensPerAttempt * retryAttempts) / PRICING_TOKENS_PER_UNIT * pricing.out + (embeddingTokensPerAttempt * retryAttempts) / PRICING_TOKENS_PER_UNIT * embeddingPricePer1M
  const fallbackCost = (inputTokensPerAttempt * fallbackAttempts) / PRICING_TOKENS_PER_UNIT * fallbackPricing.in + (outputTokensPerAttempt * fallbackAttempts) / PRICING_TOKENS_PER_UNIT * fallbackPricing.out
  const tokens = inputTokens + outputTokens + embeddingTokens

  return {
    expectedAttempts: totalAttempts,
    inputTokens,
    outputTokens,
    embeddingTokens,
    retrievedContextTokens,
    tokens,
    cost: baseCost + retryCost + fallbackCost,
    retryCost,
    fallbackCost,
  }
}

export function getPerRunCost(agent: Agent, pricingMap: PricingMap = PRICING, embeddingPricePer1M = EMBEDDING_PRICE_PER_1M): number {
  return getAgentVisitForecast(agent, 1, 1, pricingMap, embeddingPricePer1M).cost
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function estimateTokensFromText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) {
    return 0
  }

  const characters = Array.from(trimmed).length
  const words = countWords(trimmed)
  return Math.max(1, Math.round((characters / 4 + words / 0.75) / 2))
}

export function getTokenEstimateSummary(text: string): { characters: number; words: number; tokens: number } {
  const trimmed = text.trim()

  if (!trimmed) {
    return { characters: 0, words: 0, tokens: 0 }
  }

  return {
    characters: Array.from(trimmed).length,
    words: countWords(trimmed),
    tokens: estimateTokensFromText(trimmed),
  }
}

export function createTokenSamples(agents: Agent[]): Record<string, TokenSampleState> {
  return Object.fromEntries(
    agents.map((agent) => [
      agent.id,
      {
        inputText: '',
        outputText: '',
      },
    ]),
  )
}

export function sanitizeEdges(agents: Agent[], edges: Edge[]): Edge[] {
  const ids = new Set(agents.map((agent) => agent.id))

  return edges
    .filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId))
    .map((edge) => ({
      ...edge,
      weight: Math.max(0, toNumber(edge.weight, 1)),
    }))
}

export function inferEntryAgents(agents: Agent[], edges: Edge[]): Agent[] {
  const incoming = new Set(edges.map((edge) => edge.targetId))
  const roots = agents.filter((agent) => !incoming.has(agent.id))

  if (roots.length > 0) {
    return roots
  }

  return agents.length > 0 ? [agents[0]] : []
}

function resolveAgentReference(value: unknown, agents: Agent[]): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const byId = agents.find((agent) => agent.id === value)
  if (byId) {
    return byId.id
  }

  const byName = agents.find((agent) => agent.name === value)
  if (byName) {
    return byName.id
  }

  return null
}

export function normalizeAgent(value: unknown, index: number): Agent {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const routingMode = typeof source.routingMode === 'string' ? source.routingMode : typeof source.routing_mode === 'string' ? source.routing_mode : 'fanout'
  const ragEnabled = Boolean(source.ragEnabled ?? source.rag_enabled ?? false)

  return {
    id: typeof source.id === 'string' && source.id ? source.id : createId(`agent-${index + 1}`),
    name: typeof source.name === 'string' && source.name.trim() ? source.name : `Agent ${index + 1}`,
    model: typeof source.model === 'string' && source.model ? source.model : 'gpt-4o-mini',
    inputTokens: Math.max(0, Math.round(toNumber(source.inputTokens ?? source.input_tokens, 120))),
    outputTokens: Math.max(0, Math.round(toNumber(source.outputTokens ?? source.output_tokens, 80))),
    fixedPromptTokens: Math.max(0, Math.round(toNumber(source.fixedPromptTokens ?? source.fixed_prompt_tokens, 0))),
    historyCarryoverTokens: Math.max(0, Math.round(toNumber(source.historyCarryoverTokens ?? source.history_carryover_tokens ?? source.historyTokens ?? source.history_tokens, 0))),
    ragEnabled,
    retrievalMultiplier: Math.max(1, toNumber(source.retrievalMultiplier ?? source.retrieval_multiplier, 1.25)),
    averageRetrievedChunks: Math.max(0, toNumber(source.averageRetrievedChunks ?? source.average_retrieved_chunks ?? source.avgRetrievedChunks ?? source.avg_retrieved_chunks, ragEnabled ? 4 : 0)),
    averageChunkTokens: Math.max(0, Math.round(toNumber(source.averageChunkTokens ?? source.average_chunk_tokens ?? source.avgChunkTokens ?? source.avg_chunk_tokens, ragEnabled ? 160 : 0))),
    embeddingTokensPerRetrieval: Math.max(0, Math.round(toNumber(source.embeddingTokensPerRetrieval ?? source.embedding_tokens_per_retrieval ?? source.embeddingTokens ?? source.embedding_tokens, ragEnabled ? 60 : 0))),
    mcpCalls: Math.max(0, Math.round(toNumber(source.mcpCalls ?? source.mcp_calls, 0))),
    toolMultiplier: Math.max(0, toNumber(source.toolMultiplier ?? source.tool_multiplier, 0.15)),
    retryProbability: clampProbability(source.retryProbability ?? source.retry_probability),
    fallbackProbability: clampProbability(source.fallbackProbability ?? source.fallback_probability),
    fallbackModel: typeof source.fallbackModel === 'string' && source.fallbackModel ? source.fallbackModel : typeof source.fallback_model === 'string' && source.fallback_model ? source.fallback_model : 'gpt-4o-mini',
    routingMode: routingMode === 'weighted' || routingMode === 'interleave' ? routingMode : 'fanout',
  }
}

export function normalizeScenario(value: unknown): ScenarioState {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const scheduleMode = typeof source.scheduleMode === 'string' ? source.scheduleMode : typeof source.schedule_mode === 'string' ? source.schedule_mode : 'closed'

  return {
    iterations: Math.max(1, Math.round(toNumber(source.iterations, DEFAULT_SCENARIO.iterations))),
    maxDepth: Math.max(1, Math.round(toNumber(source.maxDepth ?? source.max_depth, DEFAULT_SCENARIO.maxDepth))),
    loadMultiplier: Math.max(0.1, toNumber(source.loadMultiplier ?? source.load_multiplier, DEFAULT_SCENARIO.loadMultiplier)),
    virtualUsers: Math.max(1, Math.round(toNumber(source.virtualUsers ?? source.virtual_users ?? source.threads, DEFAULT_SCENARIO.virtualUsers))),
    rampUpSeconds: Math.max(0, Math.round(toNumber(source.rampUpSeconds ?? source.ramp_up_seconds ?? source.rampUp ?? source.ramp_up, DEFAULT_SCENARIO.rampUpSeconds))),
    thinkTimeMs: Math.max(0, Math.round(toNumber(source.thinkTimeMs ?? source.think_time_ms ?? source.thinkTime ?? source.think_time, DEFAULT_SCENARIO.thinkTimeMs))),
    durationSeconds: Math.max(1, Math.round(toNumber(source.durationSeconds ?? source.duration_seconds ?? source.duration, DEFAULT_SCENARIO.durationSeconds))),
    targetThroughput: Math.max(1, toNumber(source.targetThroughput ?? source.target_throughput, DEFAULT_SCENARIO.targetThroughput)),
    throughputPeriodSeconds: Math.max(1, Math.round(toNumber(source.throughputPeriodSeconds ?? source.throughput_period_seconds ?? source.periodSeconds, DEFAULT_SCENARIO.throughputPeriodSeconds))),
    scheduleMode: scheduleMode === 'open' ? 'open' : 'closed',
  }
}

export function normalizeEdge(value: unknown, agents: Agent[], index: number): Edge | null {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const sourceId = resolveAgentReference(source.sourceId ?? source.source, agents)
  const targetId = resolveAgentReference(source.targetId ?? source.target, agents)

  if (!sourceId || !targetId) {
    return null
  }

  return {
    id: typeof source.id === 'string' && source.id ? source.id : createId(`edge-${index + 1}`),
    sourceId,
    targetId,
    weight: Math.max(0, toNumber(source.weight, 1)),
  }
}

export function createTopologyDocument(agents: Agent[], edges: Edge[], scenario: ScenarioState, pricing: WorkspacePricing, quickEstimate: QuickEstimateState): TopologyDocument {
  return {
    version: '1.2',
    exportedAt: new Date().toISOString(),
    topology: {
      agents,
      edges: sanitizeEdges(agents, edges),
    },
    scenario,
    pricing,
    quickEstimate,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function normalizeModelPricing(value: unknown, fallback: { in: number; out: number }): { in: number; out: number } {
  const source = asRecord(value)
  return {
    in: Math.max(0, toNumber(source.in, fallback.in)),
    out: Math.max(0, toNumber(source.out, fallback.out)),
  }
}

export function normalizeWorkspacePricing(value: unknown): WorkspacePricing {
  const defaults = createDefaultWorkspacePricing()
  const source = asRecord(value)
  const rawModels = source.models ? asRecord(source.models) : source
  const rawCurrency = typeof (source.currency ?? source.currencyCode ?? source.currency_code) === 'string'
    ? String(source.currency ?? source.currencyCode ?? source.currency_code).toUpperCase()
    : defaults.currency
  const modelKeys = new Set([...Object.keys(defaults.models), ...Object.keys(rawModels)])
  const models = Object.fromEntries(
    Array.from(modelKeys).map((model) => [model, normalizeModelPricing(rawModels[model], defaults.models[model] ?? { in: 0, out: 0 })]),
  )

  return {
    models,
    embeddingPricePer1M: Math.max(0, toNumber(source.embeddingPricePer1M ?? source.embedding_price_per_1m ?? source.embeddingPricePer1K ?? source.embedding_price_per_1k, defaults.embeddingPricePer1M)),
    currency: rawCurrency === 'EUR' ? 'EUR' : 'USD',
  }
}

export function normalizeQuickEstimate(value: unknown): QuickEstimateState {
  const defaults = createDefaultQuickEstimate()
  const source = asRecord(value)
  const rawModelMix = asRecord(source.modelMix ?? source.model_mix)
  const modelKeys = new Set([...Object.keys(defaults.modelMix), ...Object.keys(rawModelMix)])
  const modelMix = Object.fromEntries(
    Array.from(modelKeys).map((model) => [model, Math.max(0, Math.round(toNumber(rawModelMix[model], defaults.modelMix[model] ?? 0)))]),
  )

  return {
    monthlyVolume: Math.max(0, Math.round(toNumber(source.monthlyVolume ?? source.monthly_volume, defaults.monthlyVolume))),
    averageInputTokens: Math.max(0, Math.round(toNumber(source.averageInputTokens ?? source.average_input_tokens, defaults.averageInputTokens))),
    averageOutputTokens: Math.max(0, Math.round(toNumber(source.averageOutputTokens ?? source.average_output_tokens, defaults.averageOutputTokens))),
    ragUsagePercent: Math.min(100, Math.max(0, Math.round(toNumber(source.ragUsagePercent ?? source.rag_usage_percent, defaults.ragUsagePercent)))),
    modelMix,
  }
}

export function parseTopologyDocument(value: unknown): {
  agents: Agent[]
  edges: Edge[]
  scenario: ScenarioState
  pricing: WorkspacePricing
  quickEstimate: QuickEstimateState
} {
  const parsed = asRecord(value)
  const rawAgents = Array.isArray(parsed.topology && (parsed.topology as { agents?: unknown }).agents)
    ? (parsed.topology as { agents: unknown[] }).agents
    : Array.isArray(parsed.agents)
      ? (parsed.agents as unknown[])
      : null

  const rawEdges = Array.isArray(parsed.topology && (parsed.topology as { edges?: unknown }).edges)
    ? (parsed.topology as { edges: unknown[] }).edges
    : Array.isArray(parsed.edges)
      ? (parsed.edges as unknown[])
      : []

  if (!rawAgents || rawAgents.length === 0) {
    throw new Error('The imported file does not contain any agents.')
  }

  const agents = rawAgents.map((agent, index) => normalizeAgent(agent, index))
  const edges = rawEdges
    .map((edge, index) => normalizeEdge(edge, agents, index))
    .filter((edge): edge is Edge => edge !== null)

  return {
    agents,
    edges: sanitizeEdges(agents, edges),
    scenario: normalizeScenario(parsed.scenario),
    pricing: normalizeWorkspacePricing(parsed.pricing),
    quickEstimate: normalizeQuickEstimate(parsed.quickEstimate),
  }
}

function getTraceSource(value: unknown): Record<string, unknown> {
  const source = asRecord(value)
  return typeof source.trace === 'object' && source.trace !== null ? (source.trace as Record<string, unknown>) : source
}

function normalizeTraceSummaryEntry(value: unknown, agents: Agent[], index: number, defaultVisits: number): TraceSummary | null {
  const source = asRecord(value)
  if (Object.keys(source).length === 0) {
    return null
  }

  const rawReference = source.id ?? source.agentId ?? source.agent_id ?? source.agent ?? source.name ?? source.label
  const matchedId = resolveAgentReference(rawReference, agents)
  const matchedAgent = matchedId
    ? agents.find((agent) => agent.id === matchedId) ?? null
    : typeof source.name === 'string'
      ? agents.find((agent) => agent.name === source.name) ?? null
      : null

  const id = matchedAgent?.id ?? (typeof source.id === 'string' && source.id ? source.id : createId(`trace-${index + 1}`))
  const name = matchedAgent?.name ?? (typeof source.name === 'string' && source.name.trim() ? source.name : typeof source.label === 'string' && source.label.trim() ? source.label : id)
  const model = typeof source.model === 'string' && source.model ? source.model : matchedAgent?.model ?? 'unknown'
  const visits = Math.max(0, toNumber(source.visits ?? source.count ?? source.samples ?? defaultVisits, defaultVisits))
  const inputTokens = Math.max(0, Math.round(toNumber(source.inputTokens ?? source.input_tokens ?? source.promptTokens ?? source.prompt_tokens ?? source.input ?? 0, 0)))
  const outputTokens = Math.max(0, Math.round(toNumber(source.outputTokens ?? source.output_tokens ?? source.completionTokens ?? source.completion_tokens ?? source.output ?? 0, 0)))
  const embeddingTokens = Math.max(0, Math.round(toNumber(source.embeddingTokens ?? source.embedding_tokens ?? 0, 0)))
  const tokens = Math.max(0, Math.round(toNumber(source.tokens ?? source.totalTokens ?? source.total_tokens, inputTokens + outputTokens + embeddingTokens)))
  const cost = Math.max(0, toNumber(source.cost ?? source.totalCost ?? source.total_cost, 0))

  return {
    id,
    name,
    model,
    visits,
    inputTokens,
    outputTokens,
    embeddingTokens,
    tokens,
    cost,
  }
}

function finalizeTraceReport(summary: TraceSummary[], importedAt: string): TraceReport {
  const orderedSummary = [...summary].sort((left, right) => right.cost - left.cost || right.tokens - left.tokens)

  return {
    importedAt,
    totalTokens: orderedSummary.reduce((sum, item) => sum + item.tokens, 0),
    totalCost: orderedSummary.reduce((sum, item) => sum + item.cost, 0),
    totalVisits: orderedSummary.reduce((sum, item) => sum + item.visits, 0),
    summary: orderedSummary,
  }
}

export function normalizeTraceReport(value: unknown, agents: Agent[]): TraceReport {
  const root = asRecord(value)
  const source = getTraceSource(value)
  const importedAt = typeof root.importedAt === 'string' && root.importedAt ? root.importedAt : typeof source.importedAt === 'string' && source.importedAt ? source.importedAt : new Date().toISOString()
  const summaryRecords = Array.isArray(source.summary)
    ? source.summary
    : Array.isArray(source.agents)
      ? source.agents
      : Array.isArray(root.summary)
        ? root.summary
        : Array.isArray(root.agents)
          ? root.agents
          : null

  if (summaryRecords && summaryRecords.length > 0) {
    const summary = summaryRecords
      .map((entry, index) => normalizeTraceSummaryEntry(entry, agents, index, 1))
      .filter((entry): entry is TraceSummary => entry !== null)

    if (summary.length === 0) {
      throw new Error('The imported trace summary does not contain any valid agent records.')
    }

    return finalizeTraceReport(summary, importedAt)
  }

  const eventRecords = Array.isArray(source.events)
    ? source.events
    : Array.isArray(root.events)
      ? root.events
      : null

  if (!eventRecords || eventRecords.length === 0) {
    throw new Error('Trace import requires a summary/agents array or an events array.')
  }

  const aggregated = new Map<string, TraceSummary>()
  eventRecords.forEach((event, index) => {
    const normalized = normalizeTraceSummaryEntry(event, agents, index, 1)
    if (!normalized) {
      return
    }

    const current = aggregated.get(normalized.id)
    if (!current) {
      aggregated.set(normalized.id, normalized)
      return
    }

    aggregated.set(normalized.id, {
      ...current,
      visits: current.visits + normalized.visits,
      inputTokens: current.inputTokens + normalized.inputTokens,
      outputTokens: current.outputTokens + normalized.outputTokens,
      embeddingTokens: current.embeddingTokens + normalized.embeddingTokens,
      tokens: current.tokens + normalized.tokens,
      cost: current.cost + normalized.cost,
    })
  })

  if (aggregated.size === 0) {
    throw new Error('The imported trace events do not contain any valid token records.')
  }

  return finalizeTraceReport(Array.from(aggregated.values()), importedAt)
}

export function compareForecastToTrace(report: SimulationReport, trace: TraceReport): TraceComparisonReport {
  const forecastById = new Map(report.summary.map((summary) => [summary.id, summary]))
  const actualById = new Map(trace.summary.map((summary) => [summary.id, summary]))
  const ids = new Set([...forecastById.keys(), ...actualById.keys()])
  const rows = Array.from(ids)
    .map((id) => {
      const forecast = forecastById.get(id)
      const actual = actualById.get(id)
      const forecastTokens = forecast?.tokens ?? 0
      const actualTokens = actual?.tokens ?? 0
      const forecastCost = forecast?.cost ?? 0
      const actualCost = actual?.cost ?? 0
      const forecastVisits = forecast?.visits ?? 0
      const actualVisits = actual?.visits ?? 0

      return {
        id,
        name: forecast?.name ?? actual?.name ?? id,
        forecastVisits,
        actualVisits,
        visitDelta: actualVisits - forecastVisits,
        forecastTokens,
        actualTokens,
        tokenDelta: actualTokens - forecastTokens,
        forecastCost,
        actualCost,
        costDelta: actualCost - forecastCost,
      }
    })
    .sort((left, right) => Math.abs(right.costDelta) - Math.abs(left.costDelta) || Math.abs(right.tokenDelta) - Math.abs(left.tokenDelta))

  return {
    totalForecastTokens: rows.reduce((sum, row) => sum + row.forecastTokens, 0),
    totalActualTokens: rows.reduce((sum, row) => sum + row.actualTokens, 0),
    totalTokenDelta: rows.reduce((sum, row) => sum + row.tokenDelta, 0),
    totalForecastCost: rows.reduce((sum, row) => sum + row.forecastCost, 0),
    totalActualCost: rows.reduce((sum, row) => sum + row.actualCost, 0),
    totalCostDelta: rows.reduce((sum, row) => sum + row.costDelta, 0),
    rows,
  }
}

export function getPlannedDurationSeconds(scenario: ScenarioState): number {
  if (scenario.scheduleMode === 'open') {
    return Math.max(1, scenario.durationSeconds)
  }

  const iterationWindowSeconds = Math.max(1, scenario.thinkTimeMs / 1000 + 1)
  return Math.max(1, Math.round(scenario.rampUpSeconds + scenario.iterations * iterationWindowSeconds))
}

export function getPlannedStartsPerEntry(scenario: ScenarioState): number {
  if (scenario.scheduleMode === 'open') {
    return Math.max(1, Math.round((scenario.targetThroughput / Math.max(1, scenario.throughputPeriodSeconds)) * scenario.durationSeconds))
  }

  return Math.max(1, scenario.virtualUsers * scenario.iterations)
}

export function getPlannedStarts(scenario: ScenarioState, entryCount: number): number {
  return getPlannedStartsPerEntry(scenario) * Math.max(1, entryCount)
}

export function getThroughputPerMinute(scenario: ScenarioState, entryCount: number): number {
  return (getPlannedStarts(scenario, entryCount) / getPlannedDurationSeconds(scenario)) * 60
}

export function getNextTransitions(agent: Agent, outgoingEdges: Edge[], visits: number): Array<{ targetId: string; visits: number }> {
  const activeEdges = outgoingEdges.filter((edge) => edge.weight > 0)

  if (activeEdges.length === 0 || visits <= 0) {
    return []
  }

  if (agent.routingMode === 'fanout') {
    return activeEdges.map((edge) => ({
      targetId: edge.targetId,
      visits: visits * edge.weight,
    }))
  }

  if (agent.routingMode === 'weighted') {
    const totalWeight = activeEdges.reduce((sum, edge) => sum + edge.weight, 0)

    if (totalWeight <= 0) {
      return []
    }

    return activeEdges.map((edge) => ({
      targetId: edge.targetId,
      visits: visits * (edge.weight / totalWeight),
    }))
  }

  const equalShare = visits / activeEdges.length
  return activeEdges.map((edge) => ({
    targetId: edge.targetId,
    visits: equalShare,
  }))
}

export function buildTopologyLayout(agents: Agent[], edges: Edge[], width: number, height: number): LayoutNode[] {
  if (agents.length === 0) {
    return []
  }

  const paddingX = 128
  const paddingY = 84

  if (edges.length === 0) {
    const columns = Math.min(3, agents.length)
    const rows = Math.ceil(agents.length / columns)
    const gapX = columns === 1 ? 0 : (width - paddingX * 2) / (columns - 1)
    const gapY = rows === 1 ? 0 : (height - paddingY * 2) / (rows - 1)

    return agents.map((agent, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      return {
        agent,
        x: paddingX + column * gapX,
        y: paddingY + row * gapY,
        depth: column,
      }
    })
  }

  const entryIds = inferEntryAgents(agents, edges).map((agent) => agent.id)
  const depthMap = new Map<string, number>()
  const queue = entryIds.map((id) => ({ id, depth: 0 }))

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    const knownDepth = depthMap.get(current.id)
    if (knownDepth !== undefined && knownDepth <= current.depth) {
      continue
    }

    depthMap.set(current.id, current.depth)
    edges
      .filter((edge) => edge.sourceId === current.id)
      .forEach((edge) => {
        queue.push({ id: edge.targetId, depth: current.depth + 1 })
      })
  }

  if (depthMap.size !== agents.length) {
    const fallbackDepth = Math.max(0, ...Array.from(depthMap.values())) + 1
    agents
      .filter((agent) => !depthMap.has(agent.id))
      .forEach((agent, index) => {
        depthMap.set(agent.id, fallbackDepth + index)
      })
  }

  const groups = new Map<number, Agent[]>()
  agents.forEach((agent) => {
    const depth = depthMap.get(agent.id) ?? 0
    const group = groups.get(depth) ?? []
    group.push(agent)
    groups.set(depth, group)
  })

  const levels = Array.from(groups.keys()).sort((a, b) => a - b)
  const maxLevel = Math.max(0, ...levels)

  return levels.flatMap((level) => {
    const group = groups.get(level) ?? []
    const x = maxLevel === 0 ? width / 2 : paddingX + (level / maxLevel) * (width - paddingX * 2)
    const gapY = group.length === 1 ? 0 : (height - paddingY * 2) / (group.length - 1)

    return group.map((agent, index) => ({
      agent,
      x,
      y: group.length === 1 ? height / 2 : paddingY + index * gapY,
      depth: level,
    }))
  })
}

export function getAgentConnections(agentId: string, edges: Edge[]): { incoming: Edge[]; outgoing: Edge[] } {
  return {
    incoming: edges.filter((edge) => edge.targetId === agentId),
    outgoing: edges.filter((edge) => edge.sourceId === agentId),
  }
}