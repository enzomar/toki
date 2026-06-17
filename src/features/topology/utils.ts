import { PRICING, PRICING_TOKENS_PER_UNIT, EMBEDDING_PRICE_PER_1M, MODEL_OPTIONS } from './config'
import type {
  Agent,
  AgentCostBreakdown,
  ConfidenceLevel,
  CurrencyCode,
  Edge,
  EstimateConfig,
  EstimateSummary,
  LayoutNode,
  PricingMap,
  TimeRange,
  TopologyDocument,
  WorkspacePricing,
} from './types'

// --- ID generation ---

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

// --- Formatting ---

export function formatCurrency(value: number, currency: CurrencyCode = 'EUR'): string {
  const fractionDigits = value >= 10 ? 2 : value >= 1 ? 3 : 4
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatMetricNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return `${Math.round(value)}`
}

export function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// --- Pricing helpers ---

export function getPricing(model: string, pricingMap: PricingMap = PRICING): { in: number; out: number; cached_in: number } {
  const p = pricingMap[model]
  if (!p) return { in: 0, out: 0, cached_in: 0 }
  return { in: p.in, out: p.out, cached_in: p.cached_in ?? p.in * 0.5 }
}

/**
 * Get effective pricing after applying workspace-level discounts (batch, volume).
 */
export function getEffectivePricing(
  model: string,
  pricing: WorkspacePricing,
): { in: number; out: number; cached_in: number } {
  const base = pricing.models[model]
  if (!base) return { in: 0, out: 0, cached_in: 0 }
  
  const volumeMultiplier = 1 - ((pricing.volumeDiscountPercent ?? 0) / 100)
  
  if (pricing.useBatchPricing) {
    return {
      in: (base.batch_in ?? base.in * 0.5) * volumeMultiplier,
      out: (base.batch_out ?? base.out * 0.5) * volumeMultiplier,
      cached_in: (base.cached_in ?? base.in * 0.5) * volumeMultiplier,
    }
  }
  
  return {
    in: base.in * volumeMultiplier,
    out: base.out * volumeMultiplier,
    cached_in: (base.cached_in ?? base.in * 0.5) * volumeMultiplier,
  }
}

export function getModelLabel(model: string): string {
  return MODEL_OPTIONS.find((o) => o.value === model)?.label ?? model
}

// --- Volume helpers ---

const TIME_RANGE_TO_MONTHLY: Record<TimeRange, number> = {
  day: 30,
  week: 4.33,
  month: 1,
  year: 1 / 12,
}

export function computeConversationsPerMonth(users: number, conversationsPerUser: number, timeRange: TimeRange): number {
  return Math.round(users * conversationsPerUser * TIME_RANGE_TO_MONTHLY[timeRange])
}

export function createEstimateConfig(users: number, conversationsPerUser: number, timeRange: TimeRange): EstimateConfig {
  return {
    users,
    conversationsPerUser,
    timeRange,
    conversationsPerMonth: computeConversationsPerMonth(users, conversationsPerUser, timeRange),
  }
}

// --- Traffic share calculation (uses edge weights) ---

/**
 * Computes the effective traffic share for each agent based on topology edges.
 * An agent with no incoming edges gets 100% traffic.
 * An agent downstream of a weighted router gets its proportional share.
 */
export function computeTrafficShares(agents: Agent[], edges: Edge[]): Map<string, number> {
  const shares = new Map<string, number>()
  if (agents.length === 0) return shares

  const entries = inferEntryAgents(agents, edges)
  // Entry agents get 100% traffic
  entries.forEach((a) => shares.set(a.id, 1.0))

  // BFS propagation
  const queue = entries.map((a) => a.id)
  const visited = new Set<string>()

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const currentShare = shares.get(currentId) ?? 0
    const agent = agents.find((a) => a.id === currentId)
    if (!agent) continue

    const outgoing = edges.filter((e) => e.sourceId === currentId && e.weight > 0)
    if (outgoing.length === 0) continue

    if (agent.routingMode === 'fanout') {
      // Fan-out: each downstream gets full traffic × weight
      outgoing.forEach((e) => {
        const existing = shares.get(e.targetId) ?? 0
        shares.set(e.targetId, existing + currentShare * e.weight)
        if (!visited.has(e.targetId)) queue.push(e.targetId)
      })
    } else if (agent.routingMode === 'weighted') {
      // Weighted: each edge weight is the absolute fraction of traffic (0-1 = 0%-100%)
      // No normalization — if orchestrator sends 50% to A and 80% to B, that's what happens
      outgoing.forEach((e) => {
        const existing = shares.get(e.targetId) ?? 0
        shares.set(e.targetId, existing + currentShare * e.weight)
        if (!visited.has(e.targetId)) queue.push(e.targetId)
      })
    } else {
      // Interleave: equal split
      const equalShare = currentShare / outgoing.length
      outgoing.forEach((e) => {
        const existing = shares.get(e.targetId) ?? 0
        shares.set(e.targetId, existing + equalShare)
        if (!visited.has(e.targetId)) queue.push(e.targetId)
      })
    }
  }

  // Agents not reached by BFS get 100% (standalone)
  agents.forEach((a) => {
    if (!shares.has(a.id)) shares.set(a.id, 1.0)
  })

  return shares
}

// --- Cost calculation ---

/**
 * Computes the effective input tokens per call accounting for:
 * - Base input tokens
 * - RAG context (chunks × tokens)
 * - MCP input overhead (tool results fed back)
 * - History growth across multi-turn calls
 */
function getEffectiveInputPerCall(agent: Agent): number {
  const ragContext = agent.ragEnabled ? agent.ragChunks * agent.ragChunkTokens : 0
  const mcpInput = agent.mcpCalls * agent.mcpInputTokensPerCall
  const baseInput = agent.inputTokensPerCall + ragContext + mcpInput

  // History growth: average across all calls in a conversation
  // Call 1: base, Call 2: base × factor, Call 3: base × factor², ...
  if (agent.callsPerConversation <= 1 || agent.historyGrowthFactor <= 1) {
    return baseInput
  }

  const factor = agent.historyGrowthFactor
  const n = agent.callsPerConversation
  // Geometric series average: base × (factor^n - 1) / (n × (factor - 1))
  const avgMultiplier = (Math.pow(factor, n) - 1) / (n * (factor - 1))
  return Math.round(baseInput * avgMultiplier)
}

function getEffectiveOutputPerCall(agent: Agent): number {
  return agent.outputTokensPerCall + (agent.mcpCalls * agent.mcpOutputTokensPerCall)
}

export function calculateAgentCost(
  agent: Agent,
  conversationsPerMonth: number,
  trafficShare: number,
  pricingMap: PricingMap = PRICING,
  embeddingPricePer1M: number = EMBEDDING_PRICE_PER_1M,
): AgentCostBreakdown {
  const pricing = getPricing(agent.model, pricingMap)
  const effectiveConversations = conversationsPerMonth * trafficShare
  const callsPerMonth = effectiveConversations * agent.callsPerConversation

  const inputPerCall = getEffectiveInputPerCall(agent)
  const outputPerCall = getEffectiveOutputPerCall(agent)

  const inputTokensPerMonth = callsPerMonth * inputPerCall
  const outputTokensPerMonth = callsPerMonth * outputPerCall
  const embeddingTokensPerMonth = agent.ragEnabled ? callsPerMonth * agent.ragEmbeddingTokens : 0
  const ragContextTokensPerMonth = agent.ragEnabled ? callsPerMonth * agent.ragChunks * agent.ragChunkTokens : 0
  const totalTokensPerMonth = inputTokensPerMonth + outputTokensPerMonth + embeddingTokensPerMonth

  // Cost with caching discount
  const cacheRate = Math.min(100, Math.max(0, agent.promptCachePercent)) / 100
  const cachedInputTokens = inputTokensPerMonth * cacheRate
  const uncachedInputTokens = inputTokensPerMonth * (1 - cacheRate)

  // Use actual cached_in price from pricing model
  const inputCost = (uncachedInputTokens / PRICING_TOKENS_PER_UNIT) * pricing.in +
    (cachedInputTokens / PRICING_TOKENS_PER_UNIT) * pricing.cached_in
  const outputCost = (outputTokensPerMonth / PRICING_TOKENS_PER_UNIT) * pricing.out
  const embeddingCost = (embeddingTokensPerMonth / PRICING_TOKENS_PER_UNIT) * embeddingPricePer1M
  const costPerMonth = inputCost + outputCost + embeddingCost

  // What it would cost without caching
  const fullInputCost = (inputTokensPerMonth / PRICING_TOKENS_PER_UNIT) * pricing.in
  const cacheSavingsPerMonth = fullInputCost + outputCost + embeddingCost - costPerMonth

  return {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    trafficShare,
    callsPerMonth,
    inputTokensPerMonth,
    outputTokensPerMonth,
    embeddingTokensPerMonth,
    ragContextTokensPerMonth,
    totalTokensPerMonth,
    costPerMonth,
    cacheSavingsPerMonth,
  }
}

export function calculateEstimate(
  agents: Agent[],
  config: EstimateConfig,
  pricing: WorkspacePricing,
  edges: Edge[] = [],
): EstimateSummary {
  const trafficShares = computeTrafficShares(agents, edges)

  const agentBreakdowns = agents.map((agent) => {
    const share = trafficShares.get(agent.id) ?? 1.0
    return calculateAgentCost(agent, config.conversationsPerMonth, share, pricing.models, pricing.embeddingPricePer1M)
  })

  const totalTokensPerMonth = agentBreakdowns.reduce((sum, a) => sum + a.totalTokensPerMonth, 0)
  const totalCostPerMonth = agentBreakdowns.reduce((sum, a) => sum + a.costPerMonth, 0)
  const totalInputTokens = agentBreakdowns.reduce((sum, a) => sum + a.inputTokensPerMonth, 0)
  const totalOutputTokens = agentBreakdowns.reduce((sum, a) => sum + a.outputTokensPerMonth, 0)
  const totalEmbeddingTokens = agentBreakdowns.reduce((sum, a) => sum + a.embeddingTokensPerMonth, 0)
  const costPerConversation = config.conversationsPerMonth > 0 ? totalCostPerMonth / config.conversationsPerMonth : 0
  const tokensPerConversation = config.conversationsPerMonth > 0 ? totalTokensPerMonth / config.conversationsPerMonth : 0

  // Best case: assume 50% prompt caching on all agents
  const bestCaseCostPerMonth = totalCostPerMonth * 0.7
  // Worst case: no caching + 20% overhead for retries/errors
  const totalCacheSavings = agentBreakdowns.reduce((sum, a) => sum + a.cacheSavingsPerMonth, 0)
  const worstCaseCostPerMonth = (totalCostPerMonth + totalCacheSavings) * 1.2

  // Confidence assessment
  const { confidence, reasons } = assessConfidence(agents, config, edges)

  return {
    totalTokensPerMonth,
    totalCostPerMonth,
    totalInputTokens,
    totalOutputTokens,
    totalEmbeddingTokens,
    costPerConversation,
    tokensPerConversation,
    bestCaseCostPerMonth,
    worstCaseCostPerMonth,
    confidence,
    confidenceReasons: reasons,
    agents: agentBreakdowns.sort((a, b) => b.costPerMonth - a.costPerMonth),
  }
}

function assessConfidence(agents: Agent[], config: EstimateConfig, edges: Edge[]): { confidence: ConfidenceLevel; reasons: string[] } {
  const reasons: string[] = []
  let score = 100

  if (config.conversationsPerMonth === 0) {
    reasons.push('No traffic volume set')
    score -= 40
  }
  if (agents.length === 0) {
    reasons.push('No agents configured')
    score -= 50
  }
  if (agents.some((a) => a.inputTokensPerCall === 500 && a.outputTokensPerCall === 200)) {
    reasons.push('Some agents use default token values — measure real prompts')
    score -= 15
  }
  if (agents.some((a) => a.callsPerConversation > 1 && a.historyGrowthFactor === 1)) {
    reasons.push('Multi-turn agents without history growth factor set')
    score -= 10
  }
  if (agents.length > 1 && edges.length === 0) {
    reasons.push('Multiple agents but no connections — traffic routing not modeled')
    score -= 15
  }
  if (agents.some((a) => a.mcpCalls > 0 && a.mcpInputTokensPerCall === 0)) {
    reasons.push('MCP calls without input overhead — tool results likely feed back as context')
    score -= 10
  }
  if (agents.every((a) => a.promptCachePercent === 0) && agents.some((a) => a.inputTokensPerCall > 500)) {
    reasons.push('No prompt caching configured — consider if system prompts are reused')
    score -= 5
  }

  if (reasons.length === 0) reasons.push('All key parameters configured')

  const confidence: ConfidenceLevel = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low'
  return { confidence, reasons }
}

// --- Edge / topology helpers ---

export function sanitizeEdges(agents: Agent[], edges: Edge[]): Edge[] {
  const ids = new Set(agents.map((a) => a.id))
  return edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId))
}

export function inferEntryAgents(agents: Agent[], edges: Edge[]): Agent[] {
  const incoming = new Set(edges.map((e) => e.targetId))
  const roots = agents.filter((a) => !incoming.has(a.id))
  return roots.length > 0 ? roots : agents.length > 0 ? [agents[0]] : []
}

export function getAgentConnections(agentId: string, edges: Edge[]): { incoming: Edge[]; outgoing: Edge[] } {
  return {
    incoming: edges.filter((e) => e.targetId === agentId),
    outgoing: edges.filter((e) => e.sourceId === agentId),
  }
}

// --- Token estimation from text ---

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const chars = Array.from(trimmed).length
  const words = trimmed.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round((chars / 4 + words / 0.75) / 2))
}

export function getTokenEstimateDetails(text: string): { characters: number; words: number; tokens: number } {
  const trimmed = text.trim()
  if (!trimmed) return { characters: 0, words: 0, tokens: 0 }
  return {
    characters: Array.from(trimmed).length,
    words: trimmed.split(/\s+/).filter(Boolean).length,
    tokens: estimateTokenCount(trimmed),
  }
}

// --- Share URL encoding ---

export function encodeWorkspaceToUrl(doc: TopologyDocument): string {
  const json = JSON.stringify(doc)
  const base64 = btoa(unescape(encodeURIComponent(json)))
  const url = new URL(window.location.href)
  url.searchParams.set('workspace', base64)
  url.hash = ''
  return url.toString()
}

export function decodeWorkspaceFromUrl(): TopologyDocument | null {
  try {
    const params = new URLSearchParams(window.location.search)
    const base64 = params.get('workspace')
    if (!base64) return null
    const json = decodeURIComponent(escape(atob(base64)))
    return JSON.parse(json) as TopologyDocument
  } catch {
    return null
  }
}

// --- Import / Export ---

export function createTopologyDocument(
  agents: Agent[],
  edges: Edge[],
  estimate: EstimateConfig,
  pricing: WorkspacePricing,
): TopologyDocument {
  return {
    version: '2.1',
    exportedAt: new Date().toISOString(),
    topology: { agents, edges: sanitizeEdges(agents, edges) },
    estimate,
    pricing,
  }
}

export function parseTopologyDocument(value: unknown): {
  agents: Agent[]
  edges: Edge[]
  estimate: EstimateConfig
  pricing: WorkspacePricing
} {
  const doc = asRecord(value)
  const topo = asRecord(doc.topology)
  const rawAgents = Array.isArray(topo.agents) ? topo.agents : Array.isArray(doc.agents) ? doc.agents : []
  const rawEdges = Array.isArray(topo.edges) ? topo.edges : Array.isArray(doc.edges) ? doc.edges : []

  if (rawAgents.length === 0) {
    throw new Error('The imported file does not contain any agents.')
  }

  const agents: Agent[] = rawAgents.map((raw, i) => normalizeAgent(raw, i))
  const edges: Edge[] = rawEdges
    .map((raw, i) => normalizeEdge(raw, agents, i))
    .filter((e): e is Edge => e !== null)

  const rawEstimate = asRecord(doc.estimate)
  const rawPricing = asRecord(doc.pricing)

  const users = Math.max(0, Math.round(toNumber(rawEstimate.users, 0)))
  const conversationsPerUser = Math.max(0, toNumber(rawEstimate.conversationsPerUser ?? rawEstimate.conversations_per_user, 0))
  const timeRange = normalizeTimeRange(rawEstimate.timeRange ?? rawEstimate.time_range)
  const conversationsPerMonth = users > 0 && conversationsPerUser > 0
    ? computeConversationsPerMonth(users, conversationsPerUser, timeRange)
    : Math.max(0, Math.round(toNumber(rawEstimate.conversationsPerMonth ?? rawEstimate.monthlyVolume, 0)))

  return {
    agents,
    edges: sanitizeEdges(agents, edges),
    estimate: { users, conversationsPerUser, timeRange, conversationsPerMonth },
    pricing: normalizePricing(rawPricing),
  }
}

// --- Topology layout ---

export function buildTopologyLayout(agents: Agent[], edges: Edge[], width: number, height: number): LayoutNode[] {
  if (agents.length === 0) return []
  const paddingX = 128, paddingY = 84

  if (edges.length === 0) {
    const columns = Math.min(3, agents.length)
    const rows = Math.ceil(agents.length / columns)
    const gapX = columns === 1 ? 0 : (width - paddingX * 2) / (columns - 1)
    const gapY = rows === 1 ? 0 : (height - paddingY * 2) / (rows - 1)
    return agents.map((agent, index) => ({
      agent,
      x: paddingX + (index % columns) * gapX,
      y: paddingY + Math.floor(index / columns) * gapY,
      depth: index % columns,
    }))
  }

  const entryIds = inferEntryAgents(agents, edges).map((a) => a.id)
  const depthMap = new Map<string, number>()
  const queue = entryIds.map((id) => ({ id, depth: 0 }))

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    const known = depthMap.get(current.id)
    if (known !== undefined && known <= current.depth) continue
    depthMap.set(current.id, current.depth)
    edges.filter((e) => e.sourceId === current.id).forEach((e) => {
      queue.push({ id: e.targetId, depth: current.depth + 1 })
    })
  }

  agents.filter((a) => !depthMap.has(a.id)).forEach((a, i) => {
    depthMap.set(a.id, (Math.max(0, ...Array.from(depthMap.values())) + 1) + i)
  })

  const groups = new Map<number, Agent[]>()
  agents.forEach((a) => {
    const d = depthMap.get(a.id) ?? 0
    const g = groups.get(d) ?? []
    g.push(a)
    groups.set(d, g)
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

// --- Internal helpers ---

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function normalizeAgent(value: unknown, index: number): Agent {
  const s = asRecord(value)
  return {
    id: typeof s.id === 'string' && s.id ? s.id : createId(`agent-${index + 1}`),
    name: typeof s.name === 'string' && s.name.trim() ? s.name : `Agent ${index + 1}`,
    model: typeof s.model === 'string' && s.model ? s.model : 'gpt-4o-mini',
    callsPerConversation: Math.max(0, toNumber(s.callsPerConversation ?? s.calls_per_conversation, 1)),
    inputTokensPerCall: Math.max(0, Math.round(toNumber(s.inputTokensPerCall ?? s.input_tokens_per_call ?? s.inputTokens, 500))),
    outputTokensPerCall: Math.max(0, Math.round(toNumber(s.outputTokensPerCall ?? s.output_tokens_per_call ?? s.outputTokens, 200))),
    historyGrowthFactor: Math.max(1, toNumber(s.historyGrowthFactor ?? s.history_growth_factor, 1)),
    promptCachePercent: Math.min(100, Math.max(0, toNumber(s.promptCachePercent ?? s.prompt_cache_percent, 0))),
    ragEnabled: Boolean(s.ragEnabled ?? s.rag_enabled ?? false),
    ragChunks: Math.max(0, toNumber(s.ragChunks ?? s.rag_chunks ?? s.averageRetrievedChunks, 0)),
    ragChunkTokens: Math.max(0, Math.round(toNumber(s.ragChunkTokens ?? s.rag_chunk_tokens ?? s.averageChunkTokens, 0))),
    ragEmbeddingTokens: Math.max(0, Math.round(toNumber(s.ragEmbeddingTokens ?? s.rag_embedding_tokens ?? s.embeddingTokensPerRetrieval, 0))),
    mcpCalls: Math.max(0, Math.round(toNumber(s.mcpCalls ?? s.mcp_calls, 0))),
    mcpOutputTokensPerCall: Math.max(0, Math.round(toNumber(s.mcpOutputTokensPerCall ?? s.mcpTokensPerCall ?? s.mcp_output_tokens_per_call ?? s.mcp_tokens_per_call, 150))),
    mcpInputTokensPerCall: Math.max(0, Math.round(toNumber(s.mcpInputTokensPerCall ?? s.mcp_input_tokens_per_call, 100))),
    routingMode: normalizeRoutingMode(s.routingMode ?? s.routing_mode),
  }
}

function normalizeRoutingMode(value: unknown): Agent['routingMode'] {
  if (value === 'fanout' || value === 'interleave') return value
  return 'weighted'
}

function normalizeEdge(value: unknown, agents: Agent[], index: number): Edge | null {
  const s = asRecord(value)
  const sourceId = resolveRef(s.sourceId ?? s.source, agents)
  const targetId = resolveRef(s.targetId ?? s.target, agents)
  if (!sourceId || !targetId) return null
  return {
    id: typeof s.id === 'string' && s.id ? s.id : createId(`edge-${index + 1}`),
    sourceId,
    targetId,
    weight: Math.max(0, toNumber(s.weight, 1)),
  }
}

function resolveRef(value: unknown, agents: Agent[]): string | null {
  if (typeof value !== 'string') return null
  if (agents.find((a) => a.id === value)) return value
  const byName = agents.find((a) => a.name === value)
  return byName?.id ?? null
}

function normalizeTimeRange(value: unknown): TimeRange {
  if (value === 'day' || value === 'week' || value === 'month' || value === 'year') return value
  return 'month'
}

function normalizePricing(value: unknown): WorkspacePricing {
  const s = asRecord(value)
  const rawModels = asRecord(s.models)
  const models: PricingMap = { ...PRICING }
  for (const [key, val] of Object.entries(rawModels)) {
    const m = asRecord(val)
    models[key] = {
      in: Math.max(0, toNumber(m.in, PRICING[key]?.in ?? 0)),
      out: Math.max(0, toNumber(m.out, PRICING[key]?.out ?? 0)),
    }
  }
  return {
    models,
    embeddingPricePer1M: Math.max(0, toNumber(s.embeddingPricePer1M, EMBEDDING_PRICE_PER_1M)),
    currency: 'EUR',
  }
}
