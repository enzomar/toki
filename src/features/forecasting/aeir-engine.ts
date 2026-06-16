/**
 * AEIR Execution Engine
 * 
 * The unified probabilistic execution engine.
 * ALL execution operates exclusively on AEIR graphs.
 * 
 * Fixes applied:
 * - Uses node.model for pricing on ALL node types (not hardcoded)
 * - Correct geometric series history growth in simulation
 * - Embedding tokens properly costed
 * - Dominant path analysis included
 * - Deterministic baseline aligned with calculateEstimate formula
 * 
 * Performance targets:
 * - Simulation: ≤500 iterations, <2000ms
 */

import type {
  AEIRGraph,
  AEIRNode,
  AEIREdge,
  AgentNode,
  ToolNode,
  RAGNode,
  CompositeNode,
  AEIRExecutionContext,
  AEIRSimulationResult,
  AEIRNodeResult,
  ExternalForecastResult,
  DominantNode,
} from './aeir-types'
import type { WorkspacePricing } from '../topology/types'
import { getPricing } from '../topology/utils'
import {
  createRng,
  sampleTruncatedNormal,
  bernoulli,
  computePercentiles,
  validateAEIRGraph,
} from './aeir-utils'

const PRICING_TOKENS_PER_UNIT = 1_000_000
const MAX_RECURSION_DEPTH = 10

// --- Node Execution Result ---

type NodeExecutionResult = {
  inputTokens: number
  outputTokens: number
  embeddingTokens: number
  cost: number
  breakdown: {
    base: number
    rag: number
    mcp: number
    embedding: number
    reasoning: number
  }
}

// --- Deterministic Baseline (aligned with calculateEstimate) ---

function computeDeterministicBaseline(
  graph: AEIRGraph,
  pricing: WorkspacePricing,
): { tokens: number; cost: number; breakdown: { base: number; rag: number; mcp: number; embedding: number } } {
  let totalTokens = 0
  let totalCost = 0
  const breakdown = { base: 0, rag: 0, mcp: 0, embedding: 0 }
  
  for (const node of graph.nodes) {
    const execProb = node.execution_probability
    if (execProb === 0) continue
    
    const calls = node.calls_per_execution.mean
    const inputPerCall = node.input_dist.mean
    const outputPerCall = node.output_dist.mean
    
    // Token computation matches calculateEstimate: effectiveInput × calls × trafficShare
    const nodeInput = inputPerCall * calls * execProb
    const nodeOutput = outputPerCall * calls * execProb
    const nodeTokens = nodeInput + nodeOutput
    
    // Use the node's actual model for pricing
    const modelPricing = getPricing(node.model, pricing.models)
    
    // Cost with caching
    const uncachedInput = nodeInput * (1 - node.cache_rate)
    const cachedInput = nodeInput * node.cache_rate
    const inputCost = (uncachedInput / PRICING_TOKENS_PER_UNIT) * modelPricing.in +
                     (cachedInput / PRICING_TOKENS_PER_UNIT) * modelPricing.in * 0.1
    const outputCost = (nodeOutput / PRICING_TOKENS_PER_UNIT) * modelPricing.out
    
    totalTokens += nodeTokens
    totalCost += inputCost + outputCost
    
    // Breakdown by type
    if (node.type === 'rag') {
      const ragNode = node as RAGNode
      const ragTokens = ragNode.chunk_count_dist.mean * ragNode.chunk_size_dist.mean * 
                       ragNode.amplification_factor * calls * execProb
      const embTokens = ragNode.embedding_tokens * calls * execProb
      breakdown.rag += ragTokens
      breakdown.embedding += embTokens
      breakdown.base += nodeTokens - ragTokens
      // Add embedding cost
      totalTokens += embTokens
      totalCost += (embTokens / PRICING_TOKENS_PER_UNIT) * pricing.embeddingPricePer1M
    } else if (node.type === 'tool') {
      breakdown.mcp += nodeTokens
    } else {
      breakdown.base += nodeTokens
    }
  }
  
  return { tokens: Math.round(totalTokens), cost: totalCost, breakdown }
}

// --- Single Node Execution ---

function executeNode(
  node: AEIRNode,
  rng: () => number,
  pricing: WorkspacePricing,
  recursionDepth: number = 0,
): NodeExecutionResult | null {
  // Check execution probability
  if (!bernoulli(rng, node.execution_probability)) {
    return null
  }
  
  // Sample number of calls
  const numCalls = Math.max(1, Math.round(
    sampleTruncatedNormal(
      rng,
      node.calls_per_execution.mean,
      node.calls_per_execution.stddev,
      node.calls_per_execution.min,
      node.calls_per_execution.max
    )
  ))
  
  let totalInput = 0
  let totalOutput = 0
  let totalEmbedding = 0
  const breakdown = { base: 0, rag: 0, mcp: 0, embedding: 0, reasoning: 0 }
  
  // Execute each call with history growth applied per-call
  for (let call = 0; call < numCalls; call++) {
    let inputTokens = sampleTruncatedNormal(
      rng,
      node.input_dist.mean,
      node.input_dist.stddev,
      node.input_dist.min,
      node.input_dist.max
    )
    
    const outputTokens = sampleTruncatedNormal(
      rng,
      node.output_dist.mean,
      node.output_dist.stddev,
      node.output_dist.min,
      node.output_dist.max
    )
    
    // Apply per-call history growth (geometric series: call N gets factor^(N-1) multiplier)
    const historyFactor = getHistoryGrowthFactor(node)
    if (historyFactor > 1 && call > 0) {
      inputTokens = Math.round(inputTokens * Math.pow(historyFactor, call))
    }
    
    totalInput += inputTokens
    totalOutput += outputTokens
  }
  
  // Type-specific logic
  switch (node.type) {
    case 'agent': {
      breakdown.base += totalInput + totalOutput
      break
    }
    
    case 'rag': {
      const ragNode = node as RAGNode
      
      // Sample RAG retrieval per call
      for (let call = 0; call < numCalls; call++) {
        const chunks = sampleTruncatedNormal(
          rng,
          ragNode.chunk_count_dist.mean,
          ragNode.chunk_count_dist.stddev,
          ragNode.chunk_count_dist.min,
          ragNode.chunk_count_dist.max
        )
        
        const chunkSize = sampleTruncatedNormal(
          rng,
          ragNode.chunk_size_dist.mean,
          ragNode.chunk_size_dist.stddev,
          ragNode.chunk_size_dist.min,
          ragNode.chunk_size_dist.max
        )
        
        const ragTokens = Math.round(chunks * chunkSize * ragNode.amplification_factor)
        totalInput += ragTokens
        breakdown.rag += ragTokens
        
        // Embedding tokens
        totalEmbedding += ragNode.embedding_tokens
        breakdown.embedding += ragNode.embedding_tokens
      }
      
      // MCP tools on RAG node (multi-capability agent)
      if (ragNode.has_mcp && ragNode.mcp_response_tokens) {
        const mcpTokens = sampleMCPToolCall(rng, ragNode)
        totalOutput += mcpTokens
        breakdown.mcp += mcpTokens
      }
      
      breakdown.base += totalOutput
      break
    }
    
    case 'tool': {
      const toolNode = node as ToolNode
      
      // Sample tool execution
      const schemaTokens = sampleTruncatedNormal(rng, toolNode.schema_tokens.mean, toolNode.schema_tokens.stddev, toolNode.schema_tokens.min, toolNode.schema_tokens.max)
      const requestTokens = sampleTruncatedNormal(rng, toolNode.request_tokens.mean, toolNode.request_tokens.stddev, toolNode.request_tokens.min, toolNode.request_tokens.max)
      const responseTokens = sampleTruncatedNormal(rng, toolNode.response_tokens.mean, toolNode.response_tokens.stddev, toolNode.response_tokens.min, toolNode.response_tokens.max)
      
      let toolTokens = schemaTokens + requestTokens + responseTokens
      
      // Chain probability
      if (bernoulli(rng, toolNode.chain_probability)) {
        for (let d = 0; d < toolNode.chain_depth; d++) {
          toolTokens += responseTokens * 0.5
        }
      }
      
      // Retry probability
      if (bernoulli(rng, toolNode.retry_probability)) {
        toolTokens *= (1 + toolNode.retry_count)
      }
      
      totalOutput += toolTokens
      breakdown.mcp += toolTokens
      breakdown.base += totalInput
      break
    }
    
    case 'router': {
      breakdown.reasoning += totalInput + totalOutput
      break
    }
    
    case 'composite': {
      if (recursionDepth < MAX_RECURSION_DEPTH) {
        const compositeNode = node as CompositeNode
        const subgraphResult = simulateSingleRun(compositeNode.subgraph, rng, pricing, recursionDepth + 1)
        totalInput += subgraphResult.totalTokens / 2
        totalOutput += subgraphResult.totalTokens / 2
        breakdown.base += subgraphResult.totalTokens
      }
      break
    }
  }
  
  // Compute cost using the node's actual model pricing
  const modelPricing = getPricing(node.model, pricing.models)
  const uncachedInput = totalInput * (1 - node.cache_rate)
  const cachedInput = totalInput * node.cache_rate
  
  let cost = (uncachedInput / PRICING_TOKENS_PER_UNIT) * modelPricing.in +
             (cachedInput / PRICING_TOKENS_PER_UNIT) * modelPricing.in * 0.1 +
             (totalOutput / PRICING_TOKENS_PER_UNIT) * modelPricing.out
  
  // Add embedding cost separately
  if (totalEmbedding > 0) {
    cost += (totalEmbedding / PRICING_TOKENS_PER_UNIT) * pricing.embeddingPricePer1M
  }
  
  return {
    inputTokens: Math.round(totalInput),
    outputTokens: Math.round(totalOutput),
    embeddingTokens: Math.round(totalEmbedding),
    cost,
    breakdown,
  }
}

// --- Helpers ---

function getHistoryGrowthFactor(node: AEIRNode): number {
  if (node.type === 'agent') return (node as AgentNode).history_growth_factor
  if (node.type === 'tool') return (node as ToolNode).history_growth_factor
  if (node.type === 'rag') return (node as RAGNode).history_growth_factor
  return 1
}

function sampleMCPToolCall(rng: () => number, ragNode: RAGNode): number {
  if (!ragNode.mcp_response_tokens) return 0
  
  const schema = ragNode.mcp_schema_tokens ? sampleTruncatedNormal(rng, ragNode.mcp_schema_tokens.mean, ragNode.mcp_schema_tokens.stddev, ragNode.mcp_schema_tokens.min, ragNode.mcp_schema_tokens.max) : 0
  const request = ragNode.mcp_request_tokens ? sampleTruncatedNormal(rng, ragNode.mcp_request_tokens.mean, ragNode.mcp_request_tokens.stddev, ragNode.mcp_request_tokens.min, ragNode.mcp_request_tokens.max) : 0
  const response = sampleTruncatedNormal(rng, ragNode.mcp_response_tokens.mean, ragNode.mcp_response_tokens.stddev, ragNode.mcp_response_tokens.min, ragNode.mcp_response_tokens.max)
  
  let tokens = schema + request + response
  
  if (ragNode.mcp_chain_probability && bernoulli(rng, ragNode.mcp_chain_probability)) {
    tokens += response * 0.5
  }
  if (ragNode.mcp_retry_probability && bernoulli(rng, ragNode.mcp_retry_probability)) {
    tokens *= 2
  }
  
  return tokens
}

// --- Single Simulation Run ---

type SimulationRun = {
  totalTokens: number
  totalCost: number
  totalInput: number
  totalOutput: number
  breakdown: {
    base: number
    rag: number
    mcp: number
    embedding: number
    reasoning: number
  }
  nodeTokens: Map<string, number>
  nodeCosts: Map<string, number>
}

function simulateSingleRun(
  graph: AEIRGraph,
  rng: () => number,
  pricing: WorkspacePricing,
  recursionDepth: number = 0,
): SimulationRun {
  const result: SimulationRun = {
    totalTokens: 0,
    totalCost: 0,
    breakdown: { base: 0, rag: 0, mcp: 0, embedding: 0, reasoning: 0 },
    nodeTokens: new Map(),
    nodeCosts: new Map(),
  }
  
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))
  const edgeMap = new Map<string, AEIREdge[]>()
  for (const edge of graph.edges) {
    const edges = edgeMap.get(edge.source_id) || []
    edges.push(edge)
    edgeMap.set(edge.source_id, edges)
  }
  
  // BFS traversal
  const queue = [...graph.entry_ids]
  const visited = new Set<string>()
  
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    
    const node = nodeMap.get(nodeId)
    if (!node) continue
    
    // Execute node
    const execution = executeNode(node, rng, pricing, recursionDepth)
    if (!execution) continue
    
    // Accumulate
    const nodeTokens = execution.inputTokens + execution.outputTokens + execution.embeddingTokens
    result.totalTokens += nodeTokens
    result.totalCost += execution.cost
    result.nodeTokens.set(nodeId, nodeTokens)
    result.nodeCosts.set(nodeId, execution.cost)
    
    for (const [key, value] of Object.entries(execution.breakdown)) {
      result.breakdown[key as keyof typeof result.breakdown] += value
    }
    
    // Traverse edges probabilistically
    const outgoingEdges = edgeMap.get(nodeId) || []
    for (const edge of outgoingEdges) {
      if (bernoulli(rng, edge.probability)) {
        if (!visited.has(edge.target_id)) {
          queue.push(edge.target_id)
        }
      }
    }
  }
  
  return result
}

// --- Main Simulation ---

export function runAEIRSimulation(
  graph: AEIRGraph,
  context: AEIRExecutionContext,
  pricing: WorkspacePricing,
): AEIRSimulationResult {
  const startTime = performance.now()
  
  const validation = validateAEIRGraph(graph)
  if (!validation.valid) {
    throw new Error(`Invalid AEIR graph: ${validation.errors.join(', ')}`)
  }
  
  const numSimulations = Math.max(50, Math.min(500, context.max_simulations))
  const rng = createRng(context.seed ?? Date.now())
  
  const runs: SimulationRun[] = []
  for (let i = 0; i < numSimulations; i++) {
    runs.push(simulateSingleRun(graph, rng, pricing))
    
    if (performance.now() - startTime > context.limits.max_simulation_ms) {
      console.warn(`Simulation exceeded ${context.limits.max_simulation_ms}ms, terminating early at ${runs.length} runs`)
      break
    }
  }
  
  // Aggregate
  const totalTokensSamples = runs.map(r => r.totalTokens).sort((a, b) => a - b)
  const totalCostSamples = runs.map(r => r.totalCost).sort((a, b) => a - b)
  
  const totalTokens = computePercentiles(totalTokensSamples)
  const totalCost = computePercentiles(totalCostSamples)
  
  const breakdownBase = computePercentiles(runs.map(r => r.breakdown.base).sort((a, b) => a - b))
  const breakdownRag = computePercentiles(runs.map(r => r.breakdown.rag).sort((a, b) => a - b))
  const breakdownMcp = computePercentiles(runs.map(r => r.breakdown.mcp).sort((a, b) => a - b))
  const breakdownEmbedding = computePercentiles(runs.map(r => r.breakdown.embedding).sort((a, b) => a - b))
  const breakdownReasoning = computePercentiles(runs.map(r => r.breakdown.reasoning).sort((a, b) => a - b))
  
  const nodeResults: AEIRNodeResult[] = graph.nodes.map(node => {
    const tokenSamples = runs.map(r => r.nodeTokens.get(node.id) || 0).sort((a, b) => a - b)
    const costSamples = runs.map(r => r.nodeCosts.get(node.id) || 0).sort((a, b) => a - b)
    const executionCount = runs.filter(r => r.nodeTokens.has(node.id)).length
    
    return {
      node_id: node.id,
      label: node.label,
      type: node.type,
      model: node.model,
      tokens: computePercentiles(tokenSamples),
      cost: computePercentiles(costSamples),
      execution_rate: executionCount / runs.length,
    }
  })
  
  const simulationTimeMs = performance.now() - startTime
  
  return {
    total_tokens: totalTokens,
    total_cost: totalCost,
    breakdown: {
      base_tokens: breakdownBase,
      rag_tokens: breakdownRag,
      mcp_tokens: breakdownMcp,
      embedding_tokens: breakdownEmbedding,
      reasoning_tokens: breakdownReasoning,
    },
    nodes: nodeResults,
    metadata: {
      simulation_count: runs.length,
      conversations_per_month: context.conversations_per_month,
      compilation_time_ms: 0,
      simulation_time_ms: simulationTimeMs,
      seed: context.seed,
    },
  }
}

// --- Dominant Path Analysis ---

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

// --- External Schema Adapter ---

export function toExternalSchema(
  simulation: AEIRSimulationResult,
  graph: AEIRGraph,
  pricing: WorkspacePricing,
  compilationTimeMs: number,
): ExternalForecastResult {
  const deterministic = computeDeterministicBaseline(graph, pricing)
  const conversationsPerMonth = simulation.metadata.conversations_per_month
  
  // Per-conversation values (simulation produces per-conv figures)
  const tokensP50PerConv = Math.round(simulation.total_tokens.p50)
  const tokensP90PerConv = Math.round(simulation.total_tokens.p90)
  const tokensP99PerConv = Math.round(simulation.total_tokens.p99)
  const tokensExpectedPerConv = Math.round(simulation.total_tokens.expected)
  const tokensWorstPerConv = Math.round(simulation.total_tokens.worst)
  
  // Scale to monthly
  const tokensP50Monthly = tokensP50PerConv * conversationsPerMonth
  const tokensP90Monthly = tokensP90PerConv * conversationsPerMonth
  const tokensP99Monthly = tokensP99PerConv * conversationsPerMonth
  const tokensExpectedMonthly = tokensExpectedPerConv * conversationsPerMonth
  
  const costP50Monthly = simulation.total_cost.p50 * conversationsPerMonth
  const costP90Monthly = simulation.total_cost.p90 * conversationsPerMonth
  const costP99Monthly = simulation.total_cost.p99 * conversationsPerMonth
  const costExpectedMonthly = simulation.total_cost.expected * conversationsPerMonth
  
  // Alignment: compare MC expected vs deterministic
  const alignmentRatio = deterministic.tokens > 0 
    ? simulation.total_tokens.expected / deterministic.tokens 
    : 1.0
  const alignmentOk = alignmentRatio >= 0.85 && alignmentRatio <= 1.15
  
  // Confidence score
  const cv = simulation.total_tokens.stddev / (simulation.total_tokens.expected || 1)
  const alignmentPenalty = alignmentOk ? 0 : 0.2
  const variancePenalty = cv < 0.15 ? 0 : cv < 0.3 ? 0.1 : cv < 0.5 ? 0.25 : 0.4
  const confidenceScore = Math.max(0.1, 1 - alignmentPenalty - variancePenalty)
  
  // Tail risk
  const tailRiskFactor = simulation.total_tokens.p50 > 0 
    ? simulation.total_tokens.p99 / simulation.total_tokens.p50 
    : 1.0
  
  // Dominant node analysis
  const dominantNodes = analyzeDominantNodes(simulation.nodes, simulation.total_cost.expected)
  
  return {
    tokens_p50_per_conv: tokensP50PerConv,
    tokens_p90_per_conv: tokensP90PerConv,
    tokens_p99_per_conv: tokensP99PerConv,
    tokens_expected_per_conv: tokensExpectedPerConv,
    tokens_worst_per_conv: tokensWorstPerConv,
    
    tokens_p50_monthly: tokensP50Monthly,
    tokens_p90_monthly: tokensP90Monthly,
    tokens_p99_monthly: tokensP99Monthly,
    tokens_expected_monthly: tokensExpectedMonthly,
    
    breakdown_base_tokens: Math.round(simulation.breakdown.base_tokens.expected),
    breakdown_rag_tokens: Math.round(simulation.breakdown.rag_tokens.expected),
    breakdown_mcp_tokens: Math.round(simulation.breakdown.mcp_tokens.expected),
    breakdown_embedding_tokens: Math.round(simulation.breakdown.embedding_tokens.expected),
    
    cost_p50_monthly: costP50Monthly,
    cost_p90_monthly: costP90Monthly,
    cost_p99_monthly: costP99Monthly,
    cost_expected_monthly: costExpectedMonthly,
    
    deterministic_tokens_per_conv: deterministic.tokens,
    deterministic_cost_per_conv: deterministic.cost,
    
    confidence_score: confidenceScore,
    alignment_ratio: alignmentRatio,
    alignment_ok: alignmentOk,
    tail_risk_factor: tailRiskFactor,
    
    dominant_nodes: dominantNodes,
    
    simulation_count: simulation.metadata.simulation_count,
    compilation_time_ms: compilationTimeMs,
    simulation_time_ms: simulation.metadata.simulation_time_ms,
    variance_tokens: simulation.total_tokens.variance,
  }
}
