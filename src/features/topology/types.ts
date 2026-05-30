export type Agent = {
  id: string
  name: string
  model: string
  inputTokens: number
  outputTokens: number
  fixedPromptTokens: number
  historyCarryoverTokens: number
  ragEnabled: boolean
  retrievalMultiplier: number
  averageRetrievedChunks: number
  averageChunkTokens: number
  embeddingTokensPerRetrieval: number
  mcpCalls: number
  toolMultiplier: number
  retryProbability: number
  fallbackProbability: number
  fallbackModel: string
  routingMode: RoutingMode
}

export type Edge = {
  id: string
  sourceId: string
  targetId: string
  weight: number
}

export type ScenarioState = {
  iterations: number
  maxDepth: number
  loadMultiplier: number
  virtualUsers: number
  rampUpSeconds: number
  thinkTimeMs: number
  durationSeconds: number
  targetThroughput: number
  throughputPeriodSeconds: number
  scheduleMode: ScheduleMode
}

export type RoutingMode = 'fanout' | 'weighted' | 'interleave'

export type ScheduleMode = 'closed' | 'open'

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

export type ListenerView = 'summary' | 'aggregate'

export type PlanNodeKey = 'test-plan' | 'thread-group' | 'samplers' | 'controllers' | 'listeners'

export type SimulationSummary = {
  id: string
  name: string
  model: string
  visits: number
  expectedAttempts: number
  inputTokens: number
  outputTokens: number
  embeddingTokens: number
  retrievedContextTokens: number
  tokens: number
  cost: number
  retryCost: number
  fallbackCost: number
  avgTokensPerVisit: number
}

export type SimulationReport = {
  totalTokens: number
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  totalEmbeddingTokens: number
  totalRetrievedContextTokens: number
  plannedStarts: number
  plannedDurationSeconds: number
  throughputPerMinute: number
  summary: SimulationSummary[]
}

export type TraceSummary = {
  id: string
  name: string
  model: string
  visits: number
  inputTokens: number
  outputTokens: number
  embeddingTokens: number
  tokens: number
  cost: number
}

export type TraceReport = {
  importedAt: string
  totalTokens: number
  totalCost: number
  totalVisits: number
  summary: TraceSummary[]
}

export type TraceComparisonRow = {
  id: string
  name: string
  forecastVisits: number
  actualVisits: number
  visitDelta: number
  forecastTokens: number
  actualTokens: number
  tokenDelta: number
  forecastCost: number
  actualCost: number
  costDelta: number
}

export type TraceComparisonReport = {
  totalForecastTokens: number
  totalActualTokens: number
  totalTokenDelta: number
  totalForecastCost: number
  totalActualCost: number
  totalCostDelta: number
  rows: TraceComparisonRow[]
}

export type TopologyDocument = {
  version: string
  exportedAt: string
  topology: {
    agents: Agent[]
    edges: Edge[]
  }
  scenario: ScenarioState
  pricing?: WorkspacePricing
  quickEstimate?: QuickEstimateState
}

export type LayoutNode = {
  agent: Agent
  x: number
  y: number
  depth: number
}

export type TokenSampleState = {
  inputText: string
  outputText: string
}

export type QuickEstimateState = {
  monthlyVolume: number
  averageInputTokens: number
  averageOutputTokens: number
  ragUsagePercent: number
  modelMix: Record<string, number>
}

export type PanelKey = 'agents' | 'flows'