// --- Core domain types ---

export type Agent = {
  id: string
  name: string
  model: string
  /** Average LLM calls per conversation that hit this agent */
  callsPerConversation: number
  /** Average input tokens per LLM call */
  inputTokensPerCall: number
  /** Average output tokens per LLM call */
  outputTokensPerCall: number
  /** Multiplier for context growth across turns (1.0 = no growth, 1.5 = 50% growth per turn) */
  historyGrowthFactor: number
  /** Percentage of input tokens that hit prompt cache (0-100) */
  promptCachePercent: number
  /** Whether RAG retrieval is used before calling the LLM */
  ragEnabled: boolean
  /** Number of chunks retrieved per RAG call */
  ragChunks: number
  /** Average tokens per retrieved chunk */
  ragChunkTokens: number
  /** Embedding tokens used per retrieval */
  ragEmbeddingTokens: number
  /** Number of MCP tool calls per conversation */
  mcpCalls: number
  /** Extra output tokens generated per MCP call (tool response overhead) */
  mcpOutputTokensPerCall: number
  /** Extra input tokens per MCP call (tool result fed back as context) */
  mcpInputTokensPerCall: number
  /** Routing mode for outgoing edges */
  routingMode: RoutingMode
}

export type Edge = {
  id: string
  sourceId: string
  targetId: string
  weight: number
}

export type RoutingMode = 'fanout' | 'weighted' | 'interleave'

export type CurrencyCode = 'USD' | 'EUR'

export type ModelPricing = {
  in: number
  out: number
}

export type PricingMap = Record<string, ModelPricing>

export type WorkspacePricing = {
  models: PricingMap
  embeddingPricePer1M: number
  currency: CurrencyCode
}

export type TimeRange = 'day' | 'week' | 'month' | 'year'

export type EstimateConfig = {
  users: number
  conversationsPerUser: number
  timeRange: TimeRange
  conversationsPerMonth: number
}

// --- Cost calculation result ---

export type AgentCostBreakdown = {
  id: string
  name: string
  model: string
  /** Effective traffic share (1.0 = 100% of conversations hit this agent) */
  trafficShare: number
  callsPerMonth: number
  inputTokensPerMonth: number
  outputTokensPerMonth: number
  embeddingTokensPerMonth: number
  ragContextTokensPerMonth: number
  totalTokensPerMonth: number
  costPerMonth: number
  /** Cost saved by prompt caching */
  cacheSavingsPerMonth: number
}

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type EstimateSummary = {
  totalTokensPerMonth: number
  totalCostPerMonth: number
  totalInputTokens: number
  totalOutputTokens: number
  totalEmbeddingTokens: number
  costPerConversation: number
  /** Best case (with maximum caching, minimum traffic) */
  bestCaseCostPerMonth: number
  /** Worst case (no caching, maximum traffic, history growth) */
  worstCaseCostPerMonth: number
  confidence: ConfidenceLevel
  confidenceReasons: string[]
  agents: AgentCostBreakdown[]
}

// --- Topology layout ---

export type LayoutNode = {
  agent: Agent
  x: number
  y: number
  depth: number
}

// --- Workspace document ---

export type TopologyDocument = {
  version: string
  exportedAt: string
  topology: {
    agents: Agent[]
    edges: Edge[]
  }
  estimate: EstimateConfig
  pricing: WorkspacePricing
}
