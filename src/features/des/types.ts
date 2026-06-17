/**
 * DES (Discrete Event Simulation) Type System
 * 
 * Reuses TOKI's existing data model (Agent, Edge, WorkspacePricing).
 * Adds only execution-time concepts: events, queues, timing.
 */

// --- Event Types ---

export type DESEventType =
  | 'REQUEST_RECEIVED'
  | 'AGENT_START'
  | 'AGENT_END'
  | 'MCP_CALL_START'
  | 'MCP_CALL_END'
  | 'RAG_QUERY_START'
  | 'RAG_QUERY_END'
  | 'RETRY_EVENT'
  | 'RESPONSE_RETURNED'

export type DESEvent = {
  id: number
  type: DESEventType
  time: number           // simulation time in ms
  requestId: number      // which request this belongs to
  agentId?: string       // which agent (if agent-related)
  nodeLabel?: string     // human-readable label
  tokens?: number        // tokens consumed by this event
  cost?: number          // cost incurred
  metadata?: Record<string, unknown>
}

// --- Simulation Config ---

export type TrafficPattern = 'constant' | 'burst' | 'spike'

export type DESConfig = {
  /** Number of requests to simulate */
  numRequests: number
  /** Traffic pattern */
  trafficPattern: TrafficPattern
  /** Requests per second (for constant) or peak RPS (for burst/spike) */
  requestsPerSecond: number
  /** Max simulation time in ms (safety limit) */
  maxSimulationTime: number
  /** Random seed for reproducibility */
  seed: number
  /** Concurrency limit (max simultaneous requests) */
  maxConcurrency: number
  // --- Latency parameters (user-tunable) ---
  /** LLM token generation speed in tokens/second (default 50) */
  llmTokensPerSecond: number
  /** LLM overhead per call in ms (default 200) */
  llmOverheadMs: number
  /** MCP call latency range [min, max] in ms (default [200, 2000]) */
  mcpLatencyMinMs: number
  mcpLatencyMaxMs: number
  /** RAG query latency range [min, max] in ms (default [50, 500]) */
  ragLatencyMinMs: number
  ragLatencyMaxMs: number
  /** Retry delay in ms (default 1000) */
  retryDelayMs: number
  /** Retry probability per agent (default 0.05 = 5%) */
  retryProbability: number
}

export const DEFAULT_DES_CONFIG: DESConfig = {
  numRequests: 100,
  trafficPattern: 'constant',
  requestsPerSecond: 10,
  maxSimulationTime: 60_000,
  seed: 42,
  maxConcurrency: 50,
  llmTokensPerSecond: 50,
  llmOverheadMs: 200,
  mcpLatencyMinMs: 200,
  mcpLatencyMaxMs: 2000,
  ragLatencyMinMs: 50,
  ragLatencyMaxMs: 500,
  retryDelayMs: 1000,
  retryProbability: 0.05,
}

// --- Simulation State ---

export type QueueState = {
  agentId: string
  label: string
  queueDepth: number
  maxQueueDepth: number
  totalProcessed: number
  busyUntil: number // time when this agent becomes free
}

export type RequestTrace = {
  requestId: number
  startTime: number
  endTime: number
  latency: number
  totalTokens: number
  totalCost: number
  nodesVisited: string[]
  failed: boolean
  retryCount: number
}

// --- Simulation Result ---

export type DESResult = {
  /** All events in chronological order */
  events: DESEvent[]
  /** Per-request traces */
  requests: RequestTrace[]
  /** Queue states at end of simulation */
  queues: QueueState[]
  /** Summary metrics */
  summary: DESSummary
  /** Config used */
  config: DESConfig
  /** Wall-clock execution time */
  executionTimeMs: number
}

export type DESSummary = {
  totalRequests: number
  completedRequests: number
  failedRequests: number
  /** Latency percentiles (in ms) */
  latency_p50: number
  latency_p90: number
  latency_p95: number
  latency_p99: number
  latency_avg: number
  latency_max: number
  /** Token/cost totals */
  totalTokens: number
  totalCost: number
  avgTokensPerRequest: number
  avgCostPerRequest: number
  /** System metrics */
  maxQueueDepth: number
  avgQueueDepth: number
  failureRate: number
  totalRetries: number
  /** Throughput */
  throughputRPS: number
  simulationDurationMs: number
}
