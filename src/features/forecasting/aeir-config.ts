/**
 * AEIR Simulation Configuration
 * 
 * All tunable parameters for the Monte Carlo simulation.
 * These were previously hardcoded in the compiler and engine.
 * Users can override them per-workspace.
 */

export type AEIRSimConfig = {
  // --- Traffic variance ---
  /** CV for user count variance (default 0 = no variance, deterministic user count) */
  users_cv: number
  /** CV for conversations-per-user variance (default 0 = no variance) */
  conversations_cv: number

  // --- Token variance ---
  /** Coefficient of variation for token distributions (default 0.15 = 15%) */
  token_cv: number
  /** CV for calls_per_execution sampling (default 0.10) */
  calls_cv: number

  // --- RAG parameters ---
  /** CV for RAG chunk count sampling (default 0.20) */
  rag_chunk_count_cv: number
  /** CV for RAG chunk size sampling (default 0.25) */
  rag_chunk_size_cv: number
  /** RAG amplification factor α for redundancy/overlap (default 1.5) */
  rag_amplification_factor: number

  // --- MCP tool parameters ---
  /** Probability of chaining an additional tool call (default 0.20) */
  mcp_chain_probability: number
  /** Max chain depth ceiling (default 5) */
  mcp_max_chain_depth: number
  /** Probability of retry on tool failure (default 0.15) */
  mcp_retry_probability: number
  /** Max retry ceiling (default 3) */
  mcp_max_retries: number
  /** Schema tokens as fraction of request tokens (default 0.40) */
  mcp_schema_fraction: number

  // --- Engine parameters ---
  /** Max recursion depth for composite/nested graphs (default 8) */
  max_recursion_depth: number
  /** Alignment threshold ±% for MC vs deterministic (default 0.15) */
  alignment_threshold: number
}

export const DEFAULT_AEIR_SIM_CONFIG: AEIRSimConfig = {
  users_cv: 0,
  conversations_cv: 0,
  token_cv: 0.15,
  calls_cv: 0.10,
  rag_chunk_count_cv: 0.20,
  rag_chunk_size_cv: 0.25,
  rag_amplification_factor: 1.50,
  mcp_chain_probability: 0.20,
  mcp_max_chain_depth: 5,
  mcp_retry_probability: 0.15,
  mcp_max_retries: 3,
  mcp_schema_fraction: 0.40,
  max_recursion_depth: 8,
  alignment_threshold: 0.15,
}

/** Field metadata for UI rendering */
export const AEIR_SIM_CONFIG_META: Record<keyof AEIRSimConfig, { label: string; help: string; min: number; max: number; step: number }> = {
  users_cv: { label: 'User count variance', help: 'Coefficient of variation for monthly active users. 0 = fixed user count (deterministic). 0.20 = ±20% variance in user volume month-to-month.', min: 0, max: 0.50, step: 0.05 },
  conversations_cv: { label: 'Conversations/user variance', help: 'Coefficient of variation for conversations per user. 0 = fixed rate. 0.30 = some users talk much more than others.', min: 0, max: 0.50, step: 0.05 },
  token_cv: { label: 'Token variance (CV)', help: 'Coefficient of variation applied to input/output token sampling. Higher = more spread in p90/p99.', min: 0.01, max: 0.50, step: 0.01 },
  calls_cv: { label: 'Calls variance (CV)', help: 'Variance on the number of LLM calls per execution.', min: 0.01, max: 0.50, step: 0.01 },
  rag_chunk_count_cv: { label: 'RAG chunk count CV', help: 'Variance on how many chunks are retrieved per RAG call.', min: 0.05, max: 0.60, step: 0.05 },
  rag_chunk_size_cv: { label: 'RAG chunk size CV', help: 'Variance on the token size of each retrieved chunk.', min: 0.05, max: 0.60, step: 0.05 },
  rag_amplification_factor: { label: 'RAG amplification (α)', help: 'Multiplier for RAG context tokens to account for overlap, formatting, and metadata. 1.0 = no overhead, 2.0 = double.', min: 1.0, max: 3.0, step: 0.1 },
  mcp_chain_probability: { label: 'MCP chain probability', help: 'Probability that a tool call triggers another chained call. Models recursive tool invocations.', min: 0, max: 0.80, step: 0.05 },
  mcp_max_chain_depth: { label: 'MCP max chain depth', help: 'Maximum number of chained tool calls before stopping. Higher = more tail risk.', min: 1, max: 10, step: 1 },
  mcp_retry_probability: { label: 'MCP retry probability', help: 'Probability that a tool call fails and is retried. Each retry adds request+response tokens.', min: 0, max: 0.50, step: 0.05 },
  mcp_max_retries: { label: 'MCP max retries', help: 'Maximum retry attempts per tool call.', min: 0, max: 5, step: 1 },
  mcp_schema_fraction: { label: 'MCP schema fraction', help: 'Schema overhead as a fraction of request tokens (tool definitions sent to LLM).', min: 0.1, max: 1.0, step: 0.05 },
  max_recursion_depth: { label: 'Max recursion depth', help: 'Maximum nesting depth for composite/hierarchical agent graphs.', min: 1, max: 20, step: 1 },
  alignment_threshold: { label: 'Alignment threshold', help: 'How much MC expected can deviate from deterministic before flagging drift (±%).', min: 0.05, max: 0.50, step: 0.05 },
}
