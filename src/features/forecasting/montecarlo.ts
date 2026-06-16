import type {
  DAGNode,
  ExecutionDAG,
  MonteCarloResult,
  MonteCarloNodeResult,
  PercentileResult,
  SimulationConfig,
  SimulationRun,
  TokenDistribution,
  DominantPath,
  OptimizationSuggestion,
  ForecastReport,
} from './types'
import { computeStaticTokens, estimateStaticCost } from './dag'
import type { WorkspacePricing } from '../topology/types'
import { getPricing } from '../topology/utils'
// import { MODEL_OPTIONS } from '../topology/config'

// --- Seeded PRNG (Mulberry32) for reproducibility ---

export function createRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- Distribution Sampling ---

/**
 * Sample from a truncated normal distribution using the Box-Muller transform.
 * Clamps result to [min, max].
 */
function sampleNormal(rng: () => number, dist: TokenDistribution): number {
  // Box-Muller transform
  const u1 = rng()
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
  const value = dist.expected + z * dist.stddev
  return Math.max(dist.min, Math.min(dist.max, Math.round(value)))
}

/**
 * Sample from a uniform distribution in [min, max].
 */
function sampleUniform(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

/**
 * Bernoulli trial — returns true with probability p.
 */
function bernoulli(rng: () => number, p: number): boolean {
  return rng() < p
}

/**
 * Sample an integer from a discrete range with triangular distribution
 * centered on the expected value.
 */
function sampleCalls(rng: () => number, dist: TokenDistribution): number {
  return Math.round(sampleNormal(rng, dist))
}

// --- Cost Computation ---

const PRICING_TOKENS_PER_UNIT = 1_000_000

function computeNodeCost(
  node: DAGNode,
  inputTokens: number,
  outputTokens: number,
  pricing: WorkspacePricing,
): number {
  const modelPricing = getPricing(node.label, pricing.models)
  const inPrice = modelPricing.in || 0.10
  const outPrice = modelPricing.out || 0.40
  return (inputTokens / PRICING_TOKENS_PER_UNIT) * inPrice +
    (outputTokens / PRICING_TOKENS_PER_UNIT) * outPrice
}

// --- Single DAG Walk ---

/**
 * Execute one Monte Carlo run: walk the DAG probabilistically,
 * sampling tokens at each node, and return the aggregated cost.
 */
function walkDAG(
  dag: ExecutionDAG,
  pricing: WorkspacePricing,
  rng: () => number,
): SimulationRun {
  const nodeTokens: Record<string, number> = {}
  const nodeCosts: Record<string, number> = {}
  const categoryCosts = { static: 0, llm: 0, rag: 0, mcp: 0, recursive: 0 }
  let loopIterations = 0
  let triggeredWorstCase = false

  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]))

  // --- Static tokens (always present) ---
  const staticTokens = computeStaticTokens(dag)
  categoryCosts.static = staticTokens

  // --- BFS traversal with probabilistic branching ---
  const queue = [...dag.entryIds]
  const visited = new Set<string>()
  const nodeActivated = new Set<string>()

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const node = nodeMap.get(currentId)
    if (!node) continue

    // Check if this node activates based on execution probability
    if (!bernoulli(rng, node.executionProbability)) {
      continue
    }
    nodeActivated.add(currentId)

    // --- Sample calls per execution ---
    const numCalls = sampleCalls(rng, node.callsPerExecution)

    // --- Sample token values for each call ---
    let totalInput = 0
    let totalOutput = 0

    for (let call = 0; call < numCalls; call++) {
      totalInput += sampleNormal(rng, node.inputDist)
      totalOutput += sampleNormal(rng, node.outputDist)
    }

    // --- RAG cost (if applicable) ---
    let ragTokens = 0
    if (node.rag) {
      const chunks = sampleNormal(rng, node.rag.chunkCount)
      const chunkSize = sampleNormal(rng, node.rag.chunkSize)
      const rawRagTokens = chunks * chunkSize
      // Apply amplification factor α
      ragTokens = Math.round(rawRagTokens * node.rag.amplificationFactor)
      // Add embedding tokens
      ragTokens += node.rag.embeddingTokens
      // RAG context feeds into the input for this node's calls
      totalInput += ragTokens * numCalls
      categoryCosts.rag += ragTokens * numCalls
    }

    // --- MCP tool cost ---
    let mcpTokens = 0
    for (const tool of node.mcpTools) {
      // Sample base tool call tokens
      const reqTokens = sampleNormal(rng, tool.requestTokens)
      const schemaTokens = sampleNormal(rng, tool.schemaTokens)
      const respTokens = sampleNormal(rng, tool.responseTokens)
      let callTokens = reqTokens + schemaTokens + respTokens

      // Tool chaining
      if (bernoulli(rng, tool.chainProbability)) {
        for (let d = 0; d < tool.chainDepth; d++) {
          callTokens += sampleNormal(rng, tool.responseTokens) * 0.5
        }
      }

      // Retry cost
      if (bernoulli(rng, tool.retryProbability)) {
        // Retry costs the same again
        callTokens *= (1 + tool.retryCount)
        triggeredWorstCase = true
      }

      mcpTokens += callTokens
    }
    // MCP output feeds into model output
    totalOutput += mcpTokens
    categoryCosts.mcp += mcpTokens

    // --- Recursive loop cost ---
    let recursiveTokens = 0
    if (node.loop && bernoulli(rng, node.loop.loopProbability)) {
      // Expected loop iterations
      const loopMul = 1 / (1 - node.loop.loopProbability)
      const actualLoops = Math.min(
        node.loop.maxIterations,
        Math.max(0, Math.round(loopMul - 1 + sampleUniform(rng, -0.5, 0.5))),
      )
      // Each loop iteration adds the same cost again
      const loopCost = (totalInput + totalOutput) * actualLoops
      recursiveTokens += loopCost
      totalInput += loopCost / 2
      totalOutput += loopCost / 2
      loopIterations += actualLoops
      categoryCosts.recursive += loopCost
    }

    // --- Compute node cost ---
    const nodePrice = computeNodeCost(node, totalInput, totalOutput, pricing)
    nodeCosts[currentId] = nodePrice
    nodeTokens[currentId] = totalInput + totalOutput
    categoryCosts.llm += totalInput + totalOutput - ragTokens - mcpTokens - recursiveTokens

    // --- Queue downstream nodes ---
    for (const branch of node.branches) {
      // Sample branch activation
      if (bernoulli(rng, branch.probability)) {
        if (!visited.has(branch.targetId)) {
          queue.push(branch.targetId)
        }
      }
    }
  }

  const totalTokens = Object.values(nodeTokens).reduce((a, b) => a + b, 0) + staticTokens
  const totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0) + estimateStaticCost(staticTokens, pricing)

  return {
    totalTokens,
    totalCost,
    nodeCosts,
    nodeTokens,
    categoryCosts,
    loopIterations,
    triggeredWorstCase,
  }
}

// --- Percentile Computation ---

function computePercentiles(sorted: number[]): { p50: number; p90: number; p99: number; worstCase: number } {
  if (sorted.length === 0) return { p50: 0, p90: 0, p99: 0, worstCase: 0 }
  const n = sorted.length
  const p50 = sorted[Math.floor(n * 0.5)]
  const p90 = sorted[Math.floor(n * 0.9)]
  const p99 = sorted[Math.floor(n * 0.99)]
  const worstCase = sorted[sorted.length - 1]
  return { p50, p90, p99, worstCase }
}

function computeStats(values: number[]): PercentileResult {
  if (values.length === 0) {
    return { p50: 0, p90: 0, p99: 0, worstCase: 0, expected: 0, variance: 0, stddev: 0 }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((s, v) => s + v, 0) / n
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const percentiles = computePercentiles(sorted)
  return {
    ...percentiles,
    expected: mean,
    variance,
    stddev: Math.sqrt(variance),
  }
}

// --- Dominant Path Analysis ---

function analyzeDominantPaths(
  nodeResults: MonteCarloNodeResult[],
  totalCost: number,
): DominantPath[] {
  const paths: DominantPath[] = nodeResults
    .map((n) => {
      const fraction = n.cost.expected / Math.max(totalCost, 0.001)
      const isSpike = n.cost.p99 > n.cost.p50 * 3
      let suggestion = ''
      if (n.type === 'mcp_tool') suggestion = 'Consider reducing MCP tool count or optimizing schemas'
      else if (n.type === 'retrieval') suggestion = 'Reduce chunk count, compress chunk size, or add caching'
      else if (n.cost.stddev > n.cost.expected * 0.5) suggestion = 'High variance — consider stabilizing response lengths'
      else if (isSpike) suggestion = 'Cost spike detected — investigate worst-case execution paths'
      else suggestion = 'Monitor for changes in usage patterns'
      return {
        nodeId: n.nodeId,
        label: n.label,
        costFraction: fraction,
        isCostSpike: isSpike,
        suggestion,
      }
    })
    .filter((p) => p.costFraction > 0.01)
    .sort((a, b) => b.costFraction - a.costFraction)
    .slice(0, 5)

  return paths
}

// --- Optimization Suggestions ---

function generateOptimizations(
  dag: ExecutionDAG,
  result: MonteCarloResult,
  _pricing: WorkspacePricing,
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = []
  const totalCostPerConv = result.totalCost.expected / Math.max(1, result.simulation.conversationsPerMonth)

  // Check for caching opportunities
  const noCacheNodes = dag.nodes.filter((n) => n.type === 'planner' || n.type === 'router')
  if (noCacheNodes.length > 0) {
    const savingsPerConv = totalCostPerConv * 0.15
    suggestions.push({
      category: 'caching',
      severity: noCacheNodes.length > 2 ? 'high' : 'medium',
      description: `${noCacheNodes.length} planning/routing nodes could benefit from system prompt caching`,
      estimatedSavings: Math.round(savingsPerConv * 1000),
      estimatedCostSavings: savingsPerConv * result.simulation.conversationsPerMonth,
      affectedNodeIds: noCacheNodes.map((n) => n.id),
    })
  }

  // Check for RAG compression opportunities
  const ragNodes = dag.nodes.filter((n) => n.rag !== null)
  for (const node of ragNodes) {
    if (node.rag) {
      const chunkCost = node.rag.chunkCount.expected * node.rag.chunkSize.expected * node.rag.amplificationFactor
      if (chunkCost > 2000) {
        suggestions.push({
          category: 'compression',
          severity: 'high',
          description: `RAG in "${node.label}" uses ${Math.round(chunkCost)} tokens/retrieval (α=${node.rag.amplificationFactor}) — consider reducing chunk count or using chunk compression`,
          estimatedSavings: Math.round(chunkCost * 0.3),
          estimatedCostSavings: (chunkCost * 0.3 / PRICING_TOKENS_PER_UNIT) * 0.15 * result.simulation.conversationsPerMonth,
          affectedNodeIds: [node.id],
        })
      }
    }
  }

  // Check for expensive MCP schemas
  for (const node of dag.nodes) {
    for (const tool of node.mcpTools) {
      if (tool.schemaTokens.expected > 500) {
        suggestions.push({
          category: 'schema',
          severity: 'medium',
          description: `MCP tool "${tool.toolName}" in "${node.label}" has large schema (${Math.round(tool.schemaTokens.expected)} tokens) — prune unused fields`,
          estimatedSavings: Math.round(tool.schemaTokens.expected * 0.4),
          estimatedCostSavings: (tool.schemaTokens.expected * 0.4 / PRICING_TOKENS_PER_UNIT) * 0.15 * result.simulation.conversationsPerMonth,
          affectedNodeIds: [node.id],
        })
      }
    }
  }

  // Check for loop amplification
  const loopNodes = dag.nodes.filter((n) => n.loop !== null && n.loop.loopProbability > 0.2)
  if (loopNodes.length > 0) {
    suggestions.push({
      category: 'loop',
      severity: 'high',
      description: `${loopNodes.length} node(s) have high loop probability (>20%) — consider adding loop limits or early exit conditions`,
      estimatedSavings: Math.round(result.recursiveTokens.p50 * 0.3),
      estimatedCostSavings: (result.recursiveTokens.p50 * 0.3 / PRICING_TOKENS_PER_UNIT) * 0.15,
      affectedNodeIds: loopNodes.map((n) => n.id),
    })
  }

  // Check for routing inefficiency
  const routers = dag.nodes.filter((n) => n.type === 'router' || n.type === 'planner')
  if (routers.length > 1) {
    suggestions.push({
      category: 'routing',
      severity: 'low',
      description: `Multiple routing nodes (${routers.length}) — consider consolidating routing logic to reduce overhead`,
      estimatedSavings: routers.length * 150, // ~150 tokens per extra router
      estimatedCostSavings: (routers.length * 150 / PRICING_TOKENS_PER_UNIT) * 0.10 * result.simulation.conversationsPerMonth,
      affectedNodeIds: routers.map((n) => n.id),
    })
  }

  return suggestions
}

// --- Main Simulation Entry Point ---

/**
 * Run a full Monte Carlo simulation on the execution DAG.
 *
 * For each of N runs:
 *   1. Walk the DAG probabilistically
 *   2. Sample token counts from distributions at each node
 *   3. Compute costs
 *   4. Aggregate into percentiles
 */
export function runMonteCarlo(
  dag: ExecutionDAG,
  config: SimulationConfig,
  pricing: WorkspacePricing,
): ForecastReport {
  const numSimulations = Math.max(100, Math.min(10000, config.numSimulations || 1000))
  const rng = config.seed !== undefined ? createRng(config.seed) : createRng(Date.now())

  // Run simulations
  const runs: SimulationRun[] = []
  for (let i = 0; i < numSimulations; i++) {
    runs.push(walkDAG(dag, pricing, rng))
  }

  // Aggregate results
  const totalTokens = runs.map((r) => r.totalTokens)
  const totalCosts = runs.map((r) => r.totalCost)
  const staticTokens = runs.map((r) => r.categoryCosts.static)
  const llmTokens = runs.map((r) => r.categoryCosts.llm)
  const ragTokens = runs.map((r) => r.categoryCosts.rag)
  const mcpTokens = runs.map((r) => r.categoryCosts.mcp)
  const recursiveTokens = runs.map((r) => r.categoryCosts.recursive)

  // Per-node aggregation
  const nodeAggregates = new Map<string, number[]>()
  const nodeCostAggregates = new Map<string, number[]>()
  for (const run of runs) {
    for (const [nodeId, tokens] of Object.entries(run.nodeCosts)) {
      const arr = nodeAggregates.get(nodeId) ?? []
      arr.push(run.nodeTokens[nodeId] ?? 0)
      nodeAggregates.set(nodeId, arr)
      const costArr = nodeCostAggregates.get(nodeId) ?? []
      costArr.push(tokens)
      nodeCostAggregates.set(nodeId, costArr)
    }
  }

  const nodeResults: MonteCarloNodeResult[] = dag.nodes.map((node) => {
    const tokenVals = nodeAggregates.get(node.id) ?? [0]
    const costVals = nodeCostAggregates.get(node.id) ?? [0]
    const activationCount = runs.filter((r) => node.id in r.nodeCosts).length
    return {
      nodeId: node.id,
      label: node.label,
      type: node.type,
      tokens: computeStats(tokenVals),
      cost: computeStats(costVals),
      executionRate: activationCount / numSimulations,
    }
  })

  const overallResult: MonteCarloResult = {
    totalTokens: computeStats(totalTokens),
    totalCost: computeStats(totalCosts),
    staticTokens: computeStats(staticTokens),
    llmTokens: computeStats(llmTokens),
    ragTokens: computeStats(ragTokens),
    mcpTokens: computeStats(mcpTokens),
    recursiveTokens: computeStats(recursiveTokens),
    nodes: nodeResults,
    dominantPaths: analyzeDominantPaths(nodeResults, computeStats(totalCosts).expected),
    simulation: {
      numRuns: numSimulations,
      conversationsPerMonth: config.conversationsPerMonth,
      totalConversationsSimulated: numSimulations,
    },
  }

  const optimizations = generateOptimizations(dag, overallResult, pricing)

  return {
    forecast: overallResult,
    optimizations,
    dag,
  }
}