/**
 * AEIR Compiler
 * 
 * Transforms legacy Agent/Edge topology into optimized AEIR graphs.
 * This is the MANDATORY entry point - all inputs must pass through here.
 * 
 * Fixes applied:
 * - Respects routingMode (fanout, weighted, interleave) for probability propagation
 * - Preserves model on ALL node types for accurate cost computation
 * - Handles multi-capability agents (RAG + MCP)
 * - Uses correct geometric series for history growth
 * 
 * Performance target: <10ms compilation for topologies up to 100 nodes
 */

import type { Agent, Edge } from '../topology/types'
import type {
  AEIRGraph,
  AEIRNode,
  AEIREdge,
  AgentNode,
  ToolNode,
  RAGNode,
  RouterNode,
  TokenDistribution,
} from './aeir-types'
import type { AEIRSimConfig } from './aeir-config'
import { DEFAULT_AEIR_SIM_CONFIG } from './aeir-config'
import { createHash } from './aeir-utils'

// --- Configuration ---

const COMPILER_VERSION = '1.1.0'

// --- LRU Cache ---

class CompilationCache {
  private cache = new Map<string, { graph: AEIRGraph; timestamp: number }>()
  private capacity = 50
  
  get(hash: string): AEIRGraph | null {
    const entry = this.cache.get(hash)
    if (!entry) return null
    
    // Move to end (LRU)
    this.cache.delete(hash)
    this.cache.set(hash, entry)
    return entry.graph
  }
  
  set(hash: string, graph: AEIRGraph): void {
    if (this.cache.size >= this.capacity) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }
    this.cache.set(hash, { graph, timestamp: Date.now() })
  }
  
  clear(): void {
    this.cache.clear()
  }
  
  get size() { return this.cache.size }
}

const compilationCache = new CompilationCache()

// --- Distribution Builder ---

function pointToDistribution(value: number, cv: number = DEFAULT_AEIR_SIM_CONFIG.token_cv): TokenDistribution {
  const mean = Math.max(1, value)
  const stddev = mean * cv
  const min = Math.max(1, Math.round(mean * 0.3))
  const max = Math.round(mean * (1 + 3 * cv))
  return { mean, stddev, min, max }
}

// --- History Growth ---

/**
 * Compute the geometric series average multiplier for history growth.
 * This matches the deterministic calculateEstimate formula exactly.
 * 
 * Call 1: base, Call 2: base × factor, Call 3: base × factor², ...
 * Average multiplier = (factor^n - 1) / (n × (factor - 1))
 */
function computeHistoryGrowthMultiplier(callsPerConversation: number, historyGrowthFactor: number): number {
  if (callsPerConversation <= 1 || historyGrowthFactor <= 1) return 1
  const n = callsPerConversation
  const factor = historyGrowthFactor
  return (Math.pow(factor, n) - 1) / (n * (factor - 1))
}

// --- Node Type Inference ---

function inferNodeType(
  agent: Agent,
  isEntry: boolean,
  hasOutgoing: boolean,
): 'agent' | 'tool' | 'rag' | 'router' {
  // Router: entry node with multiple outgoing edges and single call
  if (isEntry && hasOutgoing && agent.callsPerConversation <= 1 && !agent.ragEnabled && agent.mcpCalls === 0) {
    return 'router'
  }
  
  // RAG takes priority (RAG nodes may also have MCP — we handle that inside the node)
  if (agent.ragEnabled) {
    return 'rag'
  }
  
  // Tool: has MCP calls (but no RAG)
  if (agent.mcpCalls > 0) {
    return 'tool'
  }
  
  // Default: agent
  return 'agent'
}

// --- Agent → AEIR Node Conversion ---

function compileAgent(
  agent: Agent,
  isEntry: boolean,
  hasOutgoing: boolean,
  cfg: AEIRSimConfig = DEFAULT_AEIR_SIM_CONFIG,
): AEIRNode {
  const nodeType = inferNodeType(agent, isEntry, hasOutgoing)
  
  const avgGrowth = computeHistoryGrowthMultiplier(agent.callsPerConversation, agent.historyGrowthFactor)
  
  // Base distributions — input includes RAG context and MCP overhead, grown by history factor
  const ragContext = agent.ragEnabled ? agent.ragChunks * agent.ragChunkTokens : 0
  const mcpInput = agent.mcpCalls * agent.mcpInputTokensPerCall
  const baseInput = agent.inputTokensPerCall + ragContext + mcpInput
  const effectiveInput = Math.round(baseInput * avgGrowth)
  const effectiveOutput = agent.outputTokensPerCall + (agent.mcpCalls * agent.mcpOutputTokensPerCall)
  
  const inputDist = pointToDistribution(effectiveInput, cfg.token_cv)
  const outputDist = pointToDistribution(effectiveOutput, cfg.token_cv)
  const callsDist: TokenDistribution = {
    mean: agent.callsPerConversation,
    stddev: Math.max(0.1, agent.callsPerConversation * cfg.calls_cv),
    min: Math.max(1, agent.callsPerConversation - 1),
    max: Math.ceil(agent.callsPerConversation * 1.5),
  }
  
  const cacheRate = Math.min(1, Math.max(0, (agent.promptCachePercent || 0) / 100))
  
  const baseNode = {
    id: agent.id,
    label: agent.name,
    model: agent.model, // ALL nodes get the model for pricing
    execution_probability: isEntry ? 1.0 : 0, // Will be propagated later
    input_dist: inputDist,
    output_dist: outputDist,
    calls_per_execution: callsDist,
    cache_rate: cacheRate,
  }
  
  switch (nodeType) {
    case 'agent':
      return {
        ...baseNode,
        type: 'agent',
        history_growth_factor: agent.historyGrowthFactor,
      } as AgentNode
      
    case 'tool': {
      const mcpInputTotal = agent.mcpCalls * agent.mcpInputTokensPerCall
      const mcpOutputTotal = agent.mcpCalls * agent.mcpOutputTokensPerCall
      
      return {
        ...baseNode,
        type: 'tool',
        tool_name: agent.name,
        schema_tokens: pointToDistribution(Math.round(mcpInputTotal * cfg.mcp_schema_fraction), cfg.token_cv),
        request_tokens: pointToDistribution(mcpInputTotal, cfg.token_cv),
        response_tokens: pointToDistribution(mcpOutputTotal, cfg.token_cv),
        chain_probability: cfg.mcp_chain_probability,
        chain_depth: 1,
        retry_probability: cfg.mcp_retry_probability,
        retry_count: 1,
        history_growth_factor: agent.historyGrowthFactor,
      } as ToolNode
    }
      
    case 'rag': {
      // RAG node — may also have MCP calls
      const hasMcp = agent.mcpCalls > 0
      const mcpInputTotal = agent.mcpCalls * agent.mcpInputTokensPerCall
      const mcpOutputTotal = agent.mcpCalls * agent.mcpOutputTokensPerCall
      
      // RAG nodes: input_dist should NOT include RAG context (engine adds it separately via sampling)
      // Only base input + MCP overhead, grown by history
      const ragBaseInput = agent.inputTokensPerCall + mcpInputTotal
      const ragEffectiveInput = Math.round(ragBaseInput * avgGrowth)
      const ragInputDist = pointToDistribution(ragEffectiveInput, cfg.token_cv)
      
      return {
        ...baseNode,
        type: 'rag',
        input_dist: ragInputDist, // Override: no RAG baked in (engine samples it)
        chunk_count_dist: pointToDistribution(agent.ragChunks, cfg.rag_chunk_count_cv),
        chunk_size_dist: pointToDistribution(agent.ragChunkTokens, cfg.rag_chunk_size_cv),
        amplification_factor: cfg.rag_amplification_factor,
        embedding_tokens: agent.ragEmbeddingTokens,
        history_growth_factor: agent.historyGrowthFactor,
        has_mcp: hasMcp,
        ...(hasMcp ? {
          mcp_schema_tokens: pointToDistribution(Math.round(mcpInputTotal * cfg.mcp_schema_fraction), cfg.token_cv),
          mcp_request_tokens: pointToDistribution(mcpInputTotal, cfg.token_cv),
          mcp_response_tokens: pointToDistribution(mcpOutputTotal, cfg.token_cv),
          mcp_chain_probability: cfg.mcp_chain_probability,
          mcp_retry_probability: cfg.mcp_retry_probability,
        } : {}),
      } as RAGNode
    }
      
    case 'router':
      return {
        ...baseNode,
        type: 'router',
        strategy: hasOutgoing ? 'semantic' : 'conditional',
        routing_mode: agent.routingMode || 'weighted',
      } as RouterNode
  }
}

// --- Edge Compilation ---

function compileEdge(edge: Edge, targetName: string): AEIREdge {
  return {
    id: `${edge.sourceId}-${edge.targetId}`,
    source_id: edge.sourceId,
    target_id: edge.targetId,
    probability: edge.weight,
    label: `→ ${targetName}`,
  }
}

// --- Probability Propagation (respects routingMode) ---

function propagateExecutionProbabilities(
  nodes: AEIRNode[],
  edges: AEIREdge[],
  entryIds: string[],
  agents: Agent[],
): void {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const agentMap = new Map(agents.map(a => [a.id, a]))
  const queue = [...entryIds]
  const visited = new Set<string>()
  
  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)
    
    const currentNode = nodeMap.get(currentId)
    if (!currentNode) continue
    
    const currentAgent = agentMap.get(currentId)
    const routingMode = currentAgent?.routingMode || 'weighted'
    
    // Find outgoing edges from this node
    const outgoingEdges = edges.filter(e => e.source_id === currentId)
    if (outgoingEdges.length === 0) continue
    
    // Propagate based on routing mode
    if (routingMode === 'fanout') {
      // Fan-out: each downstream gets parent probability × edge weight
      // (weights can be > 1 in total, representing multiplied traffic)
      for (const edge of outgoingEdges) {
        const targetNode = nodeMap.get(edge.target_id)
        if (!targetNode) continue
        const incomingProb = currentNode.execution_probability * edge.probability
        targetNode.execution_probability = Math.min(1.0, targetNode.execution_probability + incomingProb)
        if (!visited.has(edge.target_id)) queue.push(edge.target_id)
      }
    } else if (routingMode === 'weighted') {
      // Weighted: edge weights are absolute fractions (0-1)
      for (const edge of outgoingEdges) {
        const targetNode = nodeMap.get(edge.target_id)
        if (!targetNode) continue
        const incomingProb = currentNode.execution_probability * edge.probability
        targetNode.execution_probability = Math.min(1.0, targetNode.execution_probability + incomingProb)
        if (!visited.has(edge.target_id)) queue.push(edge.target_id)
      }
    } else {
      // Interleave (round-robin): equal split across all outgoing
      const equalShare = currentNode.execution_probability / outgoingEdges.length
      for (const edge of outgoingEdges) {
        const targetNode = nodeMap.get(edge.target_id)
        if (!targetNode) continue
        targetNode.execution_probability = Math.min(1.0, targetNode.execution_probability + equalShare)
        if (!visited.has(edge.target_id)) queue.push(edge.target_id)
      }
    }
  }
}

// --- Main Compiler ---

export function compileToAEIR(
  agents: Agent[],
  edges: Edge[],
  options?: {
    graphName?: string
    graphDescription?: string
    useCache?: boolean
    simConfig?: AEIRSimConfig
  }
): { graph: AEIRGraph; compilationTimeMs: number } {
  const startTime = performance.now()
  
  const topologyHash = createHash(JSON.stringify({ agents, edges }))
  
  // Check cache
  if (options?.useCache !== false) {
    const cached = compilationCache.get(topologyHash)
    if (cached) {
      return { graph: cached, compilationTimeMs: performance.now() - startTime }
    }
  }
  
  // Empty topology
  if (agents.length === 0) {
    const emptyGraph: AEIRGraph = {
      id: topologyHash,
      entry_ids: [],
      nodes: [],
      edges: [],
      metadata: {
        name: options?.graphName || 'Empty Graph',
        description: options?.graphDescription,
        version: COMPILER_VERSION,
      },
    }
    return { graph: emptyGraph, compilationTimeMs: performance.now() - startTime }
  }
  
  // Identify entry nodes (no incoming edges)
  const incomingEdgeTargets = new Set(edges.map(e => e.targetId))
  const entryIds = agents
    .filter(agent => !incomingEdgeTargets.has(agent.id))
    .map(agent => agent.id)
  
  if (entryIds.length === 0 && agents.length > 0) {
    entryIds.push(agents[0].id)
  }
  
  // Build adjacency info
  const outgoingEdgeMap = new Map<string, number>()
  for (const edge of edges) {
    outgoingEdgeMap.set(edge.sourceId, (outgoingEdgeMap.get(edge.sourceId) || 0) + 1)
  }
  
  // Compile nodes
  const cfg = options?.simConfig || DEFAULT_AEIR_SIM_CONFIG
  const aeirNodes: AEIRNode[] = agents.map(agent => {
    const isEntry = entryIds.includes(agent.id)
    const hasOutgoing = (outgoingEdgeMap.get(agent.id) || 0) > 0
    return compileAgent(agent, isEntry, hasOutgoing, cfg)
  })
  
  // Compile edges
  const agentNameMap = new Map(agents.map(a => [a.id, a.name]))
  const aeirEdges: AEIREdge[] = edges.map(edge => 
    compileEdge(edge, agentNameMap.get(edge.targetId) || edge.targetId)
  )
  
  // Propagate execution probabilities (respects routingMode)
  propagateExecutionProbabilities(aeirNodes, aeirEdges, entryIds, agents)
  
  // Build final graph
  const graph: AEIRGraph = {
    id: topologyHash,
    entry_ids: entryIds,
    nodes: aeirNodes,
    edges: aeirEdges,
    metadata: {
      name: options?.graphName || 'Compiled Graph',
      description: options?.graphDescription,
      version: COMPILER_VERSION,
    },
  }
  
  // Cache
  if (options?.useCache !== false) {
    compilationCache.set(topologyHash, graph)
  }
  
  const compilationTimeMs = performance.now() - startTime
  if (compilationTimeMs > 10 && agents.length <= 100) {
    console.warn(`AEIR compilation took ${compilationTimeMs.toFixed(2)}ms (target: <10ms)`)
  }
  
  return { graph, compilationTimeMs }
}

// --- Cache Management ---

export function clearCompilationCache(): void {
  compilationCache.clear()
}

export function getCompilationCacheStats(): { size: number; capacity: number } {
  return { size: compilationCache.size, capacity: 50 }
}
