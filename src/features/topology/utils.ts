import { PRICING, PRICING_TOKENS_PER_UNIT, EMBEDDING_PRICE_PER_1M, MODEL_OPTIONS } from './config'
import type {
  Agent,
  AgentCostBreakdown,
  CurrencyCode,
  Edge,
  EstimateConfig,
  EstimateSummary,
  LayoutNode,
  PricingMap,
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

export function getPricing(model: string, pricingMap: PricingMap = PRICING): { in: number; out: number } {
  return pricingMap[model] ?? { in: 0, out: 0 }
}

export function getModelLabel(model: string): string {
  return MODEL_OPTIONS.find((o) => o.value === model)?.label ?? model
}

// --- Cost calculation (no simulation, direct multiplication) ---

export function calculateAgentCost(
  agent: Agent,
  conversationsPerMonth: number,
  pricingMap: PricingMap = PRICING,
  embeddingPricePer1M: number = EMBEDDING_PRICE_PER_1M,
): AgentCostBreakdown {
  const pricing = getPricing(agent.model, pricingMap)
  const callsPerMonth = conversationsPerMonth * agent.callsPerConversation

  // Base LLM tokens
  const ragContextPerCall = agent.ragEnabled ? agent.ragChunks * agent.ragChunkTokens : 0
  const mcpOutputPerCall = agent.mcpCalls * agent.mcpTokensPerCall

  const inputPerCall = agent.inputTokensPerCall + ragContextPerCall
  const outputPerCall = agent.outputTokensPerCall + mcpOutputPerCall

  const inputTokensPerMonth = callsPerMonth * inputPerCall
  const outputTokensPerMonth = callsPerMonth * outputPerCall

  // Embedding tokens (one retrieval per call if RAG enabled)
  const embeddingTokensPerMonth = agent.ragEnabled ? callsPerMonth * agent.ragEmbeddingTokens : 0

  // RAG context tokens (already included in input, tracked separately for visibility)
  const ragContextTokensPerMonth = callsPerMonth * ragContextPerCall

  const totalTokensPerMonth = inputTokensPerMonth + outputTokensPerMonth + embeddingTokensPerMonth

  // Cost
  const inputCost = (inputTokensPerMonth / PRICING_TOKENS_PER_UNIT) * pricing.in
  const outputCost = (outputTokensPerMonth / PRICING_TOKENS_PER_UNIT) * pricing.out
  const embeddingCost = (embeddingTokensPerMonth / PRICING_TOKENS_PER_UNIT) * embeddingPricePer1M
  const costPerMonth = inputCost + outputCost + embeddingCost

  return {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    callsPerMonth,
    inputTokensPerMonth,
    outputTokensPerMonth,
    embeddingTokensPerMonth,
    ragContextTokensPerMonth: ragContextTokensPerMonth,
    totalTokensPerMonth,
    costPerMonth,
  }
}

export function calculateEstimate(
  agents: Agent[],
  config: EstimateConfig,
  pricing: WorkspacePricing,
): EstimateSummary {
  const agentBreakdowns = agents.map((agent) =>
    calculateAgentCost(agent, config.conversationsPerMonth, pricing.models, pricing.embeddingPricePer1M),
  )

  const totalTokensPerMonth = agentBreakdowns.reduce((sum, a) => sum + a.totalTokensPerMonth, 0)
  const totalCostPerMonth = agentBreakdowns.reduce((sum, a) => sum + a.costPerMonth, 0)
  const totalInputTokens = agentBreakdowns.reduce((sum, a) => sum + a.inputTokensPerMonth, 0)
  const totalOutputTokens = agentBreakdowns.reduce((sum, a) => sum + a.outputTokensPerMonth, 0)
  const totalEmbeddingTokens = agentBreakdowns.reduce((sum, a) => sum + a.embeddingTokensPerMonth, 0)
  const costPerConversation = config.conversationsPerMonth > 0 ? totalCostPerMonth / config.conversationsPerMonth : 0

  return {
    totalTokensPerMonth,
    totalCostPerMonth,
    totalInputTokens,
    totalOutputTokens,
    totalEmbeddingTokens,
    costPerConversation,
    agents: agentBreakdowns.sort((a, b) => b.costPerMonth - a.costPerMonth),
  }
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

// --- Topology layout ---

export function buildTopologyLayout(agents: Agent[], edges: Edge[], width: number, height: number): LayoutNode[] {
  if (agents.length === 0) return []

  const paddingX = 128
  const paddingY = 84

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

// --- Token estimation from text ---

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  // Heuristic: average of chars/4 and words/0.75 — good enough for planning
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

// --- Import / Export ---

export function createTopologyDocument(
  agents: Agent[],
  edges: Edge[],
  estimate: EstimateConfig,
  pricing: WorkspacePricing,
): TopologyDocument {
  return {
    version: '2.0',
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

  return {
    agents,
    edges: sanitizeEdges(agents, edges),
    estimate: {
      conversationsPerMonth: Math.max(0, Math.round(toNumber(rawEstimate.conversationsPerMonth ?? rawEstimate.monthlyVolume, 0))),
    },
    pricing: normalizePricing(rawPricing),
  }
}

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
    ragEnabled: Boolean(s.ragEnabled ?? s.rag_enabled ?? false),
    ragChunks: Math.max(0, toNumber(s.ragChunks ?? s.rag_chunks ?? s.averageRetrievedChunks, 0)),
    ragChunkTokens: Math.max(0, Math.round(toNumber(s.ragChunkTokens ?? s.rag_chunk_tokens ?? s.averageChunkTokens, 0))),
    ragEmbeddingTokens: Math.max(0, Math.round(toNumber(s.ragEmbeddingTokens ?? s.rag_embedding_tokens ?? s.embeddingTokensPerRetrieval, 0))),
    mcpCalls: Math.max(0, Math.round(toNumber(s.mcpCalls ?? s.mcp_calls, 0))),
    mcpTokensPerCall: Math.max(0, Math.round(toNumber(s.mcpTokensPerCall ?? s.mcp_tokens_per_call, 150))),
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
  const rawCurrency = String(s.currency ?? 'USD').toUpperCase()
  return {
    models,
    embeddingPricePer1M: Math.max(0, toNumber(s.embeddingPricePer1M, EMBEDDING_PRICE_PER_1M)),
    currency: rawCurrency === 'EUR' ? 'EUR' : 'USD',
  }
}
