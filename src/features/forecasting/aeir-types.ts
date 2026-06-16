/**
 * AEIR (Agent Execution Intermediate Representation) Type System
 * 
 * This is the ONLY internal data model for Toki.
 * All inputs are compiled into AEIR graphs.
 * All execution operates exclusively on AEIR.
 */

// --- Core Distribution Type ---

export type TokenDistribution = {
  mean: number
  stddev: number
  min: number
  max: number
}

// --- AEIR Node Types ---

export type AEIRNodeType = 'agent' | 'tool' | 'rag' | 'router' | 'composite'

export type BaseAEIRNode = {
  id: string
  type: AEIRNodeType
  label: string
  /** Model used for LLM calls (used for pricing) */
  model: string
  /** Probability this node executes (0-1) */
  execution_probability: number
  /** Input token distribution per execution */
  input_dist: TokenDistribution
  /** Output token distribution per execution */
  output_dist: TokenDistribution
  /** Number of calls per execution */
  calls_per_execution: TokenDistribution
  /** Cache rate (0-1) for prompt caching */
  cache_rate: number
}

export type AgentNode = BaseAEIRNode & {
  type: 'agent'
  /** History growth factor for multi-turn conversations */
  history_growth_factor: number
}

export type ToolNode = BaseAEIRNode & {
  type: 'tool'
  /** Tool name/identifier */
  tool_name: string
  /** Schema overhead tokens */
  schema_tokens: TokenDistribution
  /** Request serialization tokens */
  request_tokens: TokenDistribution
  /** Response payload tokens */
  response_tokens: TokenDistribution
  /** Probability of chaining additional tool calls (0-1) */
  chain_probability: number
  /** Expected chain depth */
  chain_depth: number
  /** Probability of retry on failure (0-1) */
  retry_probability: number
  /** Number of retries on failure */
  retry_count: number
  /** History growth factor */
  history_growth_factor: number
}

export type RAGNode = BaseAEIRNode & {
  type: 'rag'
  /** Chunk count distribution */
  chunk_count_dist: TokenDistribution
  /** Chunk size distribution */
  chunk_size_dist: TokenDistribution
  /** Amplification factor α ∈ [1.0, 3.0] for redundancy/overlap */
  amplification_factor: number
  /** Embedding tokens per retrieval */
  embedding_tokens: number
  /** History growth factor */
  history_growth_factor: number
  /** Whether this node also has MCP tool calls */
  has_mcp: boolean
  /** MCP tool parameters (when has_mcp is true) */
  mcp_schema_tokens?: TokenDistribution
  mcp_request_tokens?: TokenDistribution
  mcp_response_tokens?: TokenDistribution
  mcp_chain_probability?: number
  mcp_retry_probability?: number
}

export type RouterNode = BaseAEIRNode & {
  type: 'router'
  /** Routing strategy identifier */
  strategy: 'semantic' | 'load_balance' | 'conditional'
  /** Routing mode from original topology */
  routing_mode: 'fanout' | 'weighted' | 'interleave'
}

export type CompositeNode = BaseAEIRNode & {
  type: 'composite'
  /** Nested AEIR subgraph */
  subgraph: AEIRGraph
}

export type AEIRNode = AgentNode | ToolNode | RAGNode | RouterNode | CompositeNode

// --- AEIR Edge ---

export type AEIREdge = {
  id: string
  source_id: string
  target_id: string
  /** Probability weight (0-1) */
  probability: number
  /** Optional label */
  label?: string
}

// --- AEIR Graph ---

export type AEIRGraph = {
  /** Graph identifier */
  id: string
  /** Entry node IDs */
  entry_ids: string[]
  /** All nodes in the graph */
  nodes: AEIRNode[]
  /** All edges in the graph */
  edges: AEIREdge[]
  /** Graph metadata */
  metadata: {
    name: string
    description?: string
    version: string
  }
}

// --- Execution Context ---

export type AEIRExecutionContext = {
  /** Conversation volume */
  conversations_per_month: number
  /** Random seed for reproducibility */
  seed?: number
  /** Simulation budget (max iterations) */
  max_simulations: number
  /** Performance limits */
  limits: {
    /** Max compilation time in ms */
    max_compilation_ms: number
    /** Max simulation time in ms */
    max_simulation_ms: number
  }
}

// --- Execution Policies ---

export type AEIRExecutionPolicy = {
  /** Max recursion depth for composite nodes */
  max_recursion_depth: number
  /** Max loop iterations per node */
  max_loop_iterations: number
  /** Cycle detection enabled */
  detect_cycles: boolean
}

// --- Simulation Result ---

export type PercentileStats = {
  p50: number
  p90: number
  p99: number
  expected: number
  worst: number
  variance: number
  stddev: number
}

export type AEIRNodeResult = {
  node_id: string
  label: string
  type: AEIRNodeType
  model: string
  /** Token statistics */
  tokens: PercentileStats
  /** Cost statistics (in EUR) */
  cost: PercentileStats
  /** Execution frequency (0-1) */
  execution_rate: number
}

export type AEIRSimulationResult = {
  /** Total tokens */
  total_tokens: PercentileStats
  /** Total cost */
  total_cost: PercentileStats
  /** Breakdown by category */
  breakdown: {
    base_tokens: PercentileStats
    rag_tokens: PercentileStats
    mcp_tokens: PercentileStats
    embedding_tokens: PercentileStats
    reasoning_tokens: PercentileStats
  }
  /** Per-node results */
  nodes: AEIRNodeResult[]
  /** Simulation metadata */
  metadata: {
    simulation_count: number
    conversations_per_month: number
    compilation_time_ms: number
    simulation_time_ms: number
    seed?: number
  }
}

// --- External Schema (unchanged API contract) ---

export type ExternalForecastResult = {
  /** Core token forecasts per conversation */
  tokens_p50_per_conv: number
  tokens_p90_per_conv: number
  tokens_p99_per_conv: number
  tokens_expected_per_conv: number
  tokens_worst_per_conv: number
  
  /** Token forecasts scaled to monthly */
  tokens_p50_monthly: number
  tokens_p90_monthly: number
  tokens_p99_monthly: number
  tokens_expected_monthly: number
  
  /** Token breakdown */
  breakdown_base_tokens: number
  breakdown_rag_tokens: number
  breakdown_mcp_tokens: number
  breakdown_embedding_tokens: number
  
  /** Cost forecasts (scaled to monthly) */
  cost_p50_monthly: number
  cost_p90_monthly: number
  cost_p99_monthly: number
  cost_expected_monthly: number
  
  /** Deterministic anchor */
  deterministic_tokens_per_conv: number
  deterministic_cost_per_conv: number
  
  /** Confidence metrics */
  confidence_score: number
  alignment_ratio: number
  alignment_ok: boolean
  tail_risk_factor: number
  
  /** Per-node dominant cost contributors */
  dominant_nodes: DominantNode[]
  
  /** Metadata */
  simulation_count: number
  compilation_time_ms: number
  simulation_time_ms: number
  variance_tokens: number
}

export type DominantNode = {
  node_id: string
  label: string
  type: AEIRNodeType
  model: string
  /** Fraction of total cost (0-1) */
  cost_fraction: number
  /** Whether this node is a cost spike (p99 > 3× p50) */
  is_cost_spike: boolean
  /** Tokens expected per conv for this node */
  tokens_expected: number
}

// --- Cache Types ---

export type CompilationCacheEntry = {
  /** Hash of input topology */
  hash: string
  /** Compiled AEIR graph */
  graph: AEIRGraph
  /** Timestamp */
  timestamp: number
}

export type SimulationCacheEntry = {
  /** Hash of AEIR graph + context */
  hash: string
  /** Simulation result */
  result: AEIRSimulationResult
  /** Timestamp */
  timestamp: number
}
