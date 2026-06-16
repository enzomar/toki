// --- Probability Distributions ---

/**
 * A token cost represented as a distribution, not a single value.
 * Used for Monte Carlo sampling.
 */
export type TokenDistribution = {
  /** Expected (mean) value */
  expected: number
  /** Standard deviation */
  stddev: number
  /** Minimum possible value */
  min: number
  /** Maximum possible value */
  max: number
}

/**
 * Configuration for sampling a random token cost from a distribution.
 * Uses a truncated normal distribution clamped to [min, max].
 */
export type SampledCost = {
  input: number
  output: number
}

// --- Execution DAG ---

export type DAGNodeType =
  | 'planner'
  | 'retrieval'
  | 'executor'
  | 'summarizer'
  | 'validator'
  | 'mcp_tool'
  | 'rag'
  | 'router'
  | 'entry'

export type DAGNode = {
  id: string
  /** Human-readable label (agent name or tool name) */
  label: string
  /** Type of node */
  type: DAGNodeType
  /** Input token distribution per call */
  inputDist: TokenDistribution
  /** Output token distribution per call */
  outputDist: TokenDistribution
  /** Number of LLM calls this node makes per execution */
  callsPerExecution: TokenDistribution
  /** Probability this node executes at all (0-1) */
  executionProbability: number
  /** MCP tool calls triggered by this node */
  mcpTools: MCPToolCall[]
  /** RAG configuration (if applicable) */
  rag: RAGConfig | null
  /** Recursive loop parameters */
  loop: RecursiveLoop | null
  /** Sibling branches (alternative paths from this node) */
  branches: DAGBranch[]
}

export type DAGBranch = {
  targetId: string
  /** Probability of taking this branch (0-1) */
  probability: number
  /** Label for the branch */
  label: string
}

export type MCPToolCall = {
  toolName: string
  /** Request serialization token distribution */
  requestTokens: TokenDistribution
  /** Schema overhead token distribution */
  schemaTokens: TokenDistribution
  /** Response payload token distribution */
  responseTokens: TokenDistribution
  /** Probability of chaining additional tool calls from this one (0-1) */
  chainProbability: number
  /** Expected number of chain depth */
  chainDepth: number
  /** Probability of retry on failure (0-1) */
  retryProbability: number
  /** Number of retries on failure */
  retryCount: number
}

export type RAGConfig = {
  /** Number of chunks retrieved (distribution) */
  chunkCount: TokenDistribution
  /** Average tokens per chunk (distribution) */
  chunkSize: TokenDistribution
  /** Amplification factor α ∈ [1.2, 2.5] for redundancy/overlap */
  amplificationFactor: number
  /** Embedding token cost per retrieval */
  embeddingTokens: number
}

export type RecursiveLoop = {
  /** Probability of looping back (0-1) */
  loopProbability: number
  /** Maximum loop iterations */
  maxIterations: number
}

export type ExecutionDAG = {
  nodes: DAGNode[]
  /** Entry node IDs */
  entryIds: string[]
  /** Metadata */
  metadata: {
    name: string
    totalNodes: number
    simulatedNodeCount: number
  }
}

// --- Monte Carlo Simulation ---

export type SimulationConfig = {
  /** Number of Monte Carlo runs (default 1000) */
  numSimulations: number
  /** Conversation volume (conversations per month) */
  conversationsPerMonth: number
  /** Random seed for reproducibility (optional) */
  seed?: number
}

export type SimulationRun = {
  /** Total tokens consumed in this run */
  totalTokens: number
  /** Total cost in EUR */
  totalCost: number
  /** Breakdown by node (cost) */
  nodeCosts: Record<string, number>
  /** Breakdown by node (tokens) */
  nodeTokens: Record<string, number>
  /** Breakdown by category */
  categoryCosts: {
    static: number
    llm: number
    rag: number
    mcp: number
    recursive: number
  }
  /** Number of loop iterations */
  loopIterations: number
  /** Whether this run triggered a worst-case path */
  triggeredWorstCase: boolean
}

export type PercentileResult = {
  p50: number
  p90: number
  p99: number
  /** The single worst run observed */
  worstCase: number
  /** Expected (mean) value */
  expected: number
  /** Variance */
  variance: number
  /** Standard deviation */
  stddev: number
}

export type MonteCarloNodeResult = {
  nodeId: string
  label: string
  type: DAGNodeType
  tokens: PercentileResult
  cost: PercentileResult
  /** Execution probability (how often this node was hit) */
  executionRate: number
}

export type MonteCarloResult = {
  /** Total tokens across all simulations */
  totalTokens: PercentileResult
  /** Total cost across all simulations */
  totalCost: PercentileResult
  /** Static tokens (system prompts, schemas) */
  staticTokens: PercentileResult
  /** LLM reasoning tokens */
  llmTokens: PercentileResult
  /** RAG tokens */
  ragTokens: PercentileResult
  /** MCP tool tokens */
  mcpTokens: PercentileResult
  /** Recursive amplification tokens */
  recursiveTokens: PercentileResult
  /** Per-node breakdown */
  nodes: MonteCarloNodeResult[]
  /** Dominant cost paths (nodes contributing most to p90) */
  dominantPaths: DominantPath[]
  /** Simulation metadata */
  simulation: {
    numRuns: number
    conversationsPerMonth: number
    totalConversationsSimulated: number
  }
}

export type DominantPath = {
  nodeId: string
  label: string
  /** Fraction of total cost (0-1) */
  costFraction: number
  /** Whether this node is a cost spike */
  isCostSpike: boolean
  /** Suggestion for optimization */
  suggestion: string
}

// --- Optimization Suggestions ---

export type OptimizationSuggestion = {
  category: 'caching' | 'compression' | 'schema' | 'routing' | 'retrieval' | 'loop'
  severity: 'low' | 'medium' | 'high'
  description: string
  /** Estimated token savings per conversation */
  estimatedSavings: number
  /** Estimated cost savings per month */
  estimatedCostSavings: number
  affectedNodeIds: string[]
}

export type ForecastReport = {
  /** Monte Carlo forecast */
  forecast: MonteCarloResult
  /** Optimization suggestions */
  optimizations: OptimizationSuggestion[]
  /** Execution DAG used */
  dag: ExecutionDAG
}