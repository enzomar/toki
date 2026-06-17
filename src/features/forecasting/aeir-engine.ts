/**
 * AEIR Execution Engine — Production Grade
 * 
 * Graph-walking Monte Carlo simulation with:
 * - BFS traversal per run (edges are Bernoulli gates)
 * - Per-node cost tracking using actual model pricing
 * - Geometric chain/retry depth modeling
 * - Correct history growth (geometric series per-call)
 * - Embedding tokens properly costed
 * - Dominant path analysis
 * 
 * Performance: ≤500 iterations, <2000ms for 100-node graphs
 */

import type {
  AEIRGraph,
  AEIRNode,
  AEIREdge,
  AgentNode,
  ToolNode,
  RAGNode,
  RouterNode,
  CompositeNode,
  AEIRExecutionContext,
  AEIRSimulationResult,
  AEIRNodeResult,
  ExternalForecastResult,
  DominantNode,
} from './aeir-types'
import type { WorkspacePricing } from '../topology/types'
import { getEffectivePricing } from '../topology/utils'
import {
  createRng,
  sampleTruncatedNormal,
  bernoulli,
  computePercentiles,
  validateAEIRGraph,
} from './aeir-utils'
import type { AEIRSimConfig } from './aeir-config'
import { DEFAULT_AEIR_SIM_CONFIG } from './aeir-config'

const PRICING_TOKENS_PER_UNIT = 1_000_000

// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC BASELINE (aligned with calculateEstimate)
// ═══════════════════════════════════════════════════════════════════════

function computeDeterministicBaseline(
  graph: AEIRGraph,
  pricing: WorkspacePricing,
): { tokens: number; cost: number; inputTokens: number; outputTokens: number } {
  let totalTokens = 0
  let totalCost = 0
  let totalInput = 0
  let totalOutput = 0

  for (const node of graph.nodes) {
    const p = node.execution_probability
    if (p === 0) continue

    const calls = node.calls_per_execution.mean
    const inp = node.input_dist.mean * calls * p
    const out = node.output_dist.mean * calls * p

    totalInput += inp
    totalOutput += out
    totalTokens += inp + out

    // Per-node cost using actual model pricing
    const mp = getEffectivePricing(node.model, pricing)
    const uncached = inp * (1 - node.cache_rate)
    const cached = inp * node.cache_rate
    totalCost += (uncached / PRICING_TOKENS_PER_UNIT) * mp.in
      + (cached / PRICING_TOKENS_PER_UNIT) * mp.cached_in
      + (out / PRICING_TOKENS_PER_UNIT) * mp.out

    // RAG: add context tokens + embedding cost (not baked into input_dist for RAG nodes)
    if (node.type === 'rag') {
      const rn = node as RAGNode
      const ragContext = rn.chunk_count_dist.mean * rn.chunk_size_dist.mean * rn.amplification_factor * calls * p
      const emb = rn.embedding_tokens * calls * p
      totalInput += ragContext
      totalTokens += ragContext + emb
      totalOutput += emb
      totalCost += (ragContext / PRICING_TOKENS_PER_UNIT) * mp.in // RAG context is input
      totalCost += (emb / PRICING_TOKENS_PER_UNIT) * pricing.embeddingPricePer1M * (1 - ((pricing.volumeDiscountPercent ?? 0) / 100))
    }
  }

  return { tokens: Math.round(totalTokens), cost: totalCost, inputTokens: Math.round(totalInput), outputTokens: Math.round(totalOutput) }
}

// ═══════════════════════════════════════════════════════════════════════
// SINGLE SIMULATION RUN — Graph-walking Monte Carlo
// ═══════════════════════════════════════════════════════════════════════

type RunResult = {
  totalTokens: number
  totalCost: number
  totalInput: number
  totalOutput: number
  breakdown: { base: number; rag: number; mcp: number; embedding: number; reasoning: number }
  nodeTokens: Map<string, number>
  nodeCosts: Map<string, number>
}

/**
 * Simulate one conversation by walking the AEIR graph.
 * Each edge is a Bernoulli gate — if the dice says no, that path is not taken.
 * This naturally models conditional execution, fan-out, and routing.
 */
function simulateOneConversation(
  graph: AEIRGraph,
  rng: () => number,
  pricing: WorkspacePricing,
  cfg: AEIRSimConfig,
  depth: number = 0,
): RunResult {
  const result: RunResult = {
    totalTokens: 0, totalCost: 0, totalInput: 0, totalOutput: 0,
    breakdown: { base: 0, rag: 0, mcp: 0, embedding: 0, reasoning: 0 },
    nodeTokens: new Map(),
    nodeCosts: new Map(),
  }

  if (depth > cfg.max_recursion_depth) return result

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))

  // Build adjacency: source → edges[]
  const outEdges = new Map<string, AEIREdge[]>()
  for (const e of graph.edges) {
    const arr = outEdges.get(e.source_id) || []
    arr.push(e)
    outEdges.set(e.source_id, arr)
  }

  // BFS from entry nodes. Each edge is rolled independently per run.
  const queue = [...graph.entry_ids]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) continue

    // --- Execute this node ---
    const exec = executeNode(node, rng, pricing, cfg, depth)
    if (exec) {
      result.totalTokens += exec.tokens
      result.totalCost += exec.cost
      result.totalInput += exec.input
      result.totalOutput += exec.output
      result.nodeTokens.set(nodeId, exec.tokens)
      result.nodeCosts.set(nodeId, exec.cost)
      // Accumulate breakdown
      result.breakdown.base += exec.breakdown.base
      result.breakdown.rag += exec.breakdown.rag
      result.breakdown.mcp += exec.breakdown.mcp
      result.breakdown.embedding += exec.breakdown.embedding
      result.breakdown.reasoning += exec.breakdown.reasoning
    }

    // --- Traverse outgoing edges (Bernoulli gates) ---
    const edges = outEdges.get(nodeId) || []

    // Determine routing mode from node (RouterNode stores it)
    const routingMode = node.type === 'router' ? (node as RouterNode).routing_mode : 'weighted'

    if (routingMode === 'interleave' && edges.length > 0) {
      // Round-robin: pick one edge uniformly
      const idx = Math.floor(rng() * edges.length)
      const chosenEdge = edges[idx]
      if (!visited.has(chosenEdge.target_id)) {
        queue.push(chosenEdge.target_id)
      }
    } else {
      // Weighted / Fan-out: each edge is an independent Bernoulli gate
      for (const edge of edges) {
        if (bernoulli(rng, edge.probability)) {
          if (!visited.has(edge.target_id)) {
            queue.push(edge.target_id)
          }
        }
      }
    }
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════
// NODE EXECUTION — Per-node token sampling with proper modeling
// ═══════════════════════════════════════════════════════════════════════

type NodeExecResult = {
  tokens: number
  cost: number
  input: number
  output: number
  breakdown: { base: number; rag: number; mcp: number; embedding: number; reasoning: number }
}

function executeNode(
  node: AEIRNode,
  rng: () => number,
  pricing: WorkspacePricing,
  cfg: AEIRSimConfig,
  depth: number,
): NodeExecResult | null {
  // Node activation: Bernoulli with execution_probability
  // (For entry nodes this is 1.0, for downstream it encodes whether this
  // specific path was taken — but graph traversal already handles that.
  // We still check execution_probability for nodes that have conditional
  // activation independent of graph structure.)
  // Skip this check for nodes reached via graph traversal (prob is already
  // encoded in edge traversal). Only apply if < 1 to model internal conditionals.
  if (node.execution_probability < 1.0 && !bernoulli(rng, node.execution_probability)) {
    return null
  }

  // Sample number of calls
  const numCalls = Math.max(1, Math.round(sampleTruncatedNormal(
    rng,
    node.calls_per_execution.mean,
    node.calls_per_execution.stddev,
    node.calls_per_execution.min,
    node.calls_per_execution.max,
  )))

  const bd = { base: 0, rag: 0, mcp: 0, embedding: 0, reasoning: 0 }
  let totalIn = 0
  let totalOut = 0
  let totalEmb = 0

  // Get history growth factor
  const hgf = getHGF(node)

  // --- Sample token consumption per call ---
  for (let call = 0; call < numCalls; call++) {
    // History growth: geometric per-call. Call 0 = base, call 1 = base×hgf, ...
    const growthMul = hgf > 1 ? Math.pow(hgf, call) : 1

    let inp = sampleTruncatedNormal(rng, node.input_dist.mean, node.input_dist.stddev, node.input_dist.min, node.input_dist.max)
    inp = Math.round(inp * growthMul)

    const out = sampleTruncatedNormal(rng, node.output_dist.mean, node.output_dist.stddev, node.output_dist.min, node.output_dist.max)

    totalIn += inp
    totalOut += out
  }

  // --- Type-specific token additions ---
  switch (node.type) {
    case 'agent':
      bd.base += totalIn + totalOut
      break

    case 'rag': {
      const rn = node as RAGNode
      // RAG retrieval: re-sample chunks per call
      for (let call = 0; call < numCalls; call++) {
        const chunks = Math.round(sampleTruncatedNormal(rng, rn.chunk_count_dist.mean, rn.chunk_count_dist.stddev, rn.chunk_count_dist.min, rn.chunk_count_dist.max))
        const chunkSz = Math.round(sampleTruncatedNormal(rng, rn.chunk_size_dist.mean, rn.chunk_size_dist.stddev, rn.chunk_size_dist.min, rn.chunk_size_dist.max))
        const ragTok = Math.round(chunks * chunkSz * rn.amplification_factor)
        totalIn += ragTok
        bd.rag += ragTok
        // Embedding
        totalEmb += rn.embedding_tokens
        bd.embedding += rn.embedding_tokens
      }
      // MCP on RAG node (multi-capability)
      if (rn.has_mcp && rn.mcp_response_tokens) {
        const mcpTok = sampleChainedMCP(rng, rn.mcp_schema_tokens!, rn.mcp_request_tokens!, rn.mcp_response_tokens, rn.mcp_chain_probability || 0, rn.mcp_retry_probability || 0, cfg.mcp_max_chain_depth, cfg.mcp_max_retries)
        totalOut += mcpTok
        bd.mcp += mcpTok
      }
      bd.base += totalOut - (bd.mcp) // LLM output portion
      break
    }

    case 'tool': {
      const tn = node as ToolNode
      // Geometric chain/retry model
      const mcpTok = sampleChainedMCP(rng, tn.schema_tokens, tn.request_tokens, tn.response_tokens, tn.chain_probability, tn.retry_probability, cfg.mcp_max_chain_depth, cfg.mcp_max_retries)
      totalOut += mcpTok
      bd.mcp += mcpTok
      bd.base += totalIn // LLM input is base
      break
    }

    case 'router':
      bd.reasoning += totalIn + totalOut
      break

    case 'composite': {
      const cn = node as CompositeNode
      const sub = simulateOneConversation(cn.subgraph, rng, pricing, cfg, depth + 1)
      totalIn += sub.totalInput
      totalOut += sub.totalOutput
      bd.base += sub.totalTokens
      break
    }
  }

  const tokens = totalIn + totalOut + totalEmb

  // --- Per-node cost using actual model pricing ---
  const mp = getEffectivePricing(node.model, pricing)
  const uncachedIn = totalIn * (1 - node.cache_rate)
  const cachedIn = totalIn * node.cache_rate
  let cost = (uncachedIn / PRICING_TOKENS_PER_UNIT) * mp.in
    + (cachedIn / PRICING_TOKENS_PER_UNIT) * mp.cached_in
    + (totalOut / PRICING_TOKENS_PER_UNIT) * mp.out
  // Embedding priced separately (with volume discount)
  if (totalEmb > 0) {
    cost += (totalEmb / PRICING_TOKENS_PER_UNIT) * pricing.embeddingPricePer1M * (1 - ((pricing.volumeDiscountPercent ?? 0) / 100))
  }

  return { tokens, cost, input: totalIn, output: totalOut + totalEmb, breakdown: bd }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function getHGF(node: AEIRNode): number {
  switch (node.type) {
    case 'agent': return (node as AgentNode).history_growth_factor
    case 'tool': return (node as ToolNode).history_growth_factor
    case 'rag': return (node as RAGNode).history_growth_factor
    default: return 1
  }
}

/**
 * Sample MCP tool tokens with geometric chaining and retry.
 * At each step, roll chain_probability to fire another call.
 * On each call, roll retry_probability for retry (doubles that call's cost).
 */
function sampleChainedMCP(
  rng: () => number,
  schemaDist: { mean: number; stddev: number; min: number; max: number },
  requestDist: { mean: number; stddev: number; min: number; max: number },
  responseDist: { mean: number; stddev: number; min: number; max: number },
  chainProb: number,
  retryProb: number,
  maxChainDepth: number = 5,
  maxRetries: number = 3,
): number {
  let total = 0
  let depth = 0

  // Initial call
  do {
    const schema = sampleTruncatedNormal(rng, schemaDist.mean, schemaDist.stddev, schemaDist.min, schemaDist.max)
    const request = sampleTruncatedNormal(rng, requestDist.mean, requestDist.stddev, requestDist.min, requestDist.max)
    const response = sampleTruncatedNormal(rng, responseDist.mean, responseDist.stddev, responseDist.min, responseDist.max)
    let callTokens = schema + request + response

    // Retry: geometric — keep retrying while dice says yes
    let retries = 0
    while (retries < maxRetries && bernoulli(rng, retryProb)) {
      callTokens += request + response
      retries++
    }

    total += callTokens
    depth++
  } while (depth < maxChainDepth && bernoulli(rng, chainProb))

  return Math.round(total)
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN SIMULATION LOOP
// ═══════════════════════════════════════════════════════════════════════

export function runAEIRSimulation(
  graph: AEIRGraph,
  context: AEIRExecutionContext,
  pricing: WorkspacePricing,
  simConfig?: AEIRSimConfig,
): AEIRSimulationResult {
  const startTime = performance.now()
  const cfg = simConfig || DEFAULT_AEIR_SIM_CONFIG

  const validation = validateAEIRGraph(graph)
  if (!validation.valid) {
    throw new Error(`Invalid AEIR graph: ${validation.errors.join(', ')}`)
  }

  const numSims = Math.max(50, Math.min(10000, context.max_simulations))
  const rng = createRng(context.seed ?? Date.now())

  // Run N simulations
  const runs: RunResult[] = []
  for (let i = 0; i < numSims; i++) {
    runs.push(simulateOneConversation(graph, rng, pricing, cfg))
    if (performance.now() - startTime > context.limits.max_simulation_ms) {
      break
    }
  }

  // --- Aggregate ---
  const sort = (arr: number[]) => [...arr].sort((a, b) => a - b)

  const totalTokens = computePercentiles(sort(runs.map(r => r.totalTokens)))
  const totalCost = computePercentiles(sort(runs.map(r => r.totalCost)))
  const totalInput = computePercentiles(sort(runs.map(r => r.totalInput)))
  const totalOutput = computePercentiles(sort(runs.map(r => r.totalOutput)))

  const breakdownBase = computePercentiles(sort(runs.map(r => r.breakdown.base)))
  const breakdownRag = computePercentiles(sort(runs.map(r => r.breakdown.rag)))
  const breakdownMcp = computePercentiles(sort(runs.map(r => r.breakdown.mcp)))
  const breakdownEmb = computePercentiles(sort(runs.map(r => r.breakdown.embedding)))
  const breakdownReasoning = computePercentiles(sort(runs.map(r => r.breakdown.reasoning)))

  // Per-node stats
  const nodeResults: AEIRNodeResult[] = graph.nodes.map(node => {
    const tokSamples = sort(runs.map(r => r.nodeTokens.get(node.id) || 0))
    const costSamples = sort(runs.map(r => r.nodeCosts.get(node.id) || 0))
    const execCount = runs.filter(r => r.nodeTokens.has(node.id)).length

    return {
      node_id: node.id,
      label: node.label,
      type: node.type,
      model: node.model,
      tokens: computePercentiles(tokSamples),
      cost: computePercentiles(costSamples),
      execution_rate: execCount / runs.length,
    }
  })

  return {
    total_tokens: totalTokens,
    total_cost: totalCost,
    total_input: totalInput,
    total_output: totalOutput,
    breakdown: {
      base_tokens: breakdownBase,
      rag_tokens: breakdownRag,
      mcp_tokens: breakdownMcp,
      embedding_tokens: breakdownEmb,
      reasoning_tokens: breakdownReasoning,
    },
    nodes: nodeResults,
    metadata: {
      simulation_count: runs.length,
      conversations_per_month: context.conversations_per_month,
      compilation_time_ms: 0,
      simulation_time_ms: performance.now() - startTime,
      seed: context.seed,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXTERNAL SCHEMA ADAPTER
// ═══════════════════════════════════════════════════════════════════════

function analyzeDominantNodes(nodeResults: AEIRNodeResult[], totalCostExpected: number): DominantNode[] {
  return nodeResults
    .filter(n => n.cost.expected > 0)
    .map(n => ({
      node_id: n.node_id,
      label: n.label,
      type: n.type,
      model: n.model,
      cost_fraction: totalCostExpected > 0 ? n.cost.expected / totalCostExpected : 0,
      is_cost_spike: n.cost.p99 > n.cost.p50 * 3,
      tokens_expected: Math.round(n.tokens.expected),
    }))
    .sort((a, b) => b.cost_fraction - a.cost_fraction)
    .slice(0, 5)
}

export function toExternalSchema(
  sim: AEIRSimulationResult,
  graph: AEIRGraph,
  pricing: WorkspacePricing,
  compilationTimeMs: number,
  simConfig?: AEIRSimConfig,
): ExternalForecastResult {
  const cfg = simConfig || DEFAULT_AEIR_SIM_CONFIG
  const det = computeDeterministicBaseline(graph, pricing)
  const convPerMonth = sim.metadata.conversations_per_month

  // Volume variance: if users_cv or conversations_cv > 0, monthly scaling gets uncertainty
  // Combined CV for volume = sqrt(users_cv² + conversations_cv²)
  const volumeCV = Math.sqrt((cfg.users_cv || 0) ** 2 + (cfg.conversations_cv || 0) ** 2)
  // For percentile scaling: p50 = base, p90 = base × (1 + 1.28×CV), p99 = base × (1 + 2.33×CV)
  const volMultP50 = 1.0
  const volMultP90 = volumeCV > 0 ? (1 + 1.28 * volumeCV) : 1.0
  const volMultP99 = volumeCV > 0 ? (1 + 2.33 * volumeCV) : 1.0

  // Per-conversation values
  const tokP50 = Math.round(sim.total_tokens.p50)
  const tokP90 = Math.round(sim.total_tokens.p90)
  const tokP99 = Math.round(sim.total_tokens.p99)
  const tokExp = Math.round(sim.total_tokens.expected)
  const tokWorst = Math.round(sim.total_tokens.worst)

  // Monthly scale (with volume variance applied to higher percentiles)
  const costP50 = sim.total_cost.p50 * convPerMonth * volMultP50
  const costP90 = sim.total_cost.p90 * convPerMonth * volMultP90
  const costP99 = sim.total_cost.p99 * convPerMonth * volMultP99
  const costExp = sim.total_cost.expected * convPerMonth

  // Alignment
  const alignRatio = det.tokens > 0 ? sim.total_tokens.expected / det.tokens : 1
  const alignOk = alignRatio >= (1 - cfg.alignment_threshold) && alignRatio <= (1 + cfg.alignment_threshold)

  // Confidence
  const cv = sim.total_tokens.stddev / (sim.total_tokens.expected || 1)
  const penalty = (alignOk ? 0 : 0.2) + (cv < 0.15 ? 0 : cv < 0.3 ? 0.1 : cv < 0.5 ? 0.25 : 0.4)
  const confidence = Math.max(0.1, 1 - penalty)

  // Tail risk
  const tailRisk = sim.total_tokens.p50 > 0 ? sim.total_tokens.p99 / sim.total_tokens.p50 : 1

  return {
    tokens_p50_per_conv: tokP50,
    tokens_p90_per_conv: tokP90,
    tokens_p99_per_conv: tokP99,
    tokens_expected_per_conv: tokExp,
    tokens_worst_per_conv: tokWorst,

    tokens_p50_monthly: Math.round(tokP50 * convPerMonth * volMultP50),
    tokens_p90_monthly: Math.round(tokP90 * convPerMonth * volMultP90),
    tokens_p99_monthly: Math.round(tokP99 * convPerMonth * volMultP99),
    tokens_expected_monthly: tokExp * convPerMonth,

    breakdown_base_tokens: Math.round(sim.breakdown.base_tokens.expected),
    breakdown_rag_tokens: Math.round(sim.breakdown.rag_tokens.expected),
    breakdown_mcp_tokens: Math.round(sim.breakdown.mcp_tokens.expected),
    breakdown_embedding_tokens: Math.round(sim.breakdown.embedding_tokens.expected),

    input_tokens_per_conv: Math.round(sim.total_input.expected),
    output_tokens_per_conv: Math.round(sim.total_output.expected),

    cost_p50_monthly: costP50,
    cost_p90_monthly: costP90,
    cost_p99_monthly: costP99,
    cost_expected_monthly: costExp,

    deterministic_tokens_per_conv: det.tokens,
    deterministic_cost_per_conv: det.cost,

    confidence_score: confidence,
    alignment_ratio: alignRatio,
    alignment_ok: alignOk,
    tail_risk_factor: tailRisk,

    dominant_nodes: analyzeDominantNodes(sim.nodes, sim.total_cost.expected),

    simulation_count: sim.metadata.simulation_count,
    compilation_time_ms: compilationTimeMs,
    simulation_time_ms: sim.metadata.simulation_time_ms,
    variance_tokens: sim.total_tokens.variance,
  }
}
