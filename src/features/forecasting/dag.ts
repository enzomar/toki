import type { Agent, Edge, WorkspacePricing } from '../topology/types'
import {
  inferEntryAgents,
} from '../topology/utils'
import type {
  DAGNode,
  DAGNodeType,
  ExecutionDAG,
  MCPToolCall,
  RAGConfig,
  RecursiveLoop,
  TokenDistribution,
} from './types'

/**
 * Default coefficient of variation (stddev / mean) for token estimates.
 * Used when we have only a single point value from the existing model.
 */
const DEFAULT_CV = 0.15 // 15% variance around the mean

/**
 * Builds a distribution from a single known value by assuming
 * a coefficient of variation around it, with reasonable bounds.
 */
function pointToDistribution(value: number, cv: number = DEFAULT_CV): TokenDistribution {
  const mean = Math.max(1, value)
  const stddev = mean * cv
  const min = Math.max(1, Math.round(mean * 0.3))
  const max = Math.round(mean * (1 + 3 * cv)) // 3 sigma upper bound
  return { expected: mean, stddev, min, max }
}

/**
 * Infer a DAG node type from an agent's properties.
 */
function inferNodeType(agent: Agent, isEntry: boolean, hasOutgoing: boolean): DAGNodeType {
  if (isEntry && hasOutgoing && agent.callsPerConversation <= 1) return 'router'
  if (isEntry && agent.mcpCalls === 0 && !agent.ragEnabled) return 'planner'
  if (agent.ragEnabled) return 'retrieval'
  if (agent.mcpCalls > 0) return 'executor'
  if (agent.callsPerConversation >= 2 && agent.historyGrowthFactor > 1.1) return 'validator'
  if (agent.callsPerConversation >= 2) return 'summarizer'
  return 'executor'
}

/**
 * Build MCP tool call config from agent fields.
 */
function buildMCPTools(agent: Agent): MCPToolCall[] {
  if (agent.mcpCalls === 0) return []

  // Distribute MCP calls across 1-3 logical tools
  const toolCount = Math.min(agent.mcpCalls, 3)
  const tools: MCPToolCall[] = []

  for (let i = 0; i < toolCount; i++) {
    const baseRequest = agent.mcpInputTokensPerCall / toolCount
    const baseResponse = agent.mcpOutputTokensPerCall / toolCount
    tools.push({
      toolName: `tool_${i + 1}`,
      requestTokens: pointToDistribution(baseRequest),
      schemaTokens: pointToDistribution(Math.round(baseRequest * 0.4)),
      responseTokens: pointToDistribution(baseResponse),
      chainProbability: 0.2,
      chainDepth: 1,
      retryProbability: i === 0 ? 0.15 : 0.05, // first tool more likely to retry
      retryCount: 1,
    })
  }
  return tools
}

/**
 * Build RAG config from agent fields.
 */
function buildRAGConfig(agent: Agent): RAGConfig | null {
  if (!agent.ragEnabled) return null
  return {
    chunkCount: pointToDistribution(agent.ragChunks, 0.2),
    chunkSize: pointToDistribution(agent.ragChunkTokens, 0.25),
    amplificationFactor: 1.5,
    embeddingTokens: agent.ragEmbeddingTokens,
  }
}

/**
 * Build recursive loop config if applicable.
 */
function buildRecursiveLoop(agent: Agent): RecursiveLoop | null {
  const hasHistoryGrowth = agent.historyGrowthFactor > 1
  const hasMCPRetries = agent.mcpCalls > 0
  const hasValidation = agent.callsPerConversation >= 2

  if (!hasHistoryGrowth && !hasMCPRetries && !hasValidation) return null

  // Infer loop probability from history growth factor
  // Higher growth factor → more likely to loop
  const loopProb = agent.historyGrowthFactor > 1.5 ? 0.3
    : agent.historyGrowthFactor > 1.2 ? 0.2
    : agent.mcpCalls > 0 ? 0.15
    : 0.1

  return {
    loopProbability: loopProb,
    maxIterations: agent.callsPerConversation * 2,
  }
}

/**
 * Convert a single Agent to a DAGNode.
 */
function agentToNode(
  agent: Agent,
  isEntry: boolean,
  hasOutgoing: boolean,
  _edges: Edge[],
): DAGNode {
  const type = inferNodeType(agent, isEntry, hasOutgoing)

  // Build input/output distributions from point values
  const inputDist = pointToDistribution(agent.inputTokensPerCall)
  const outputDist = pointToDistribution(agent.outputTokensPerCall)

  // Calls per execution: usually 1, but can vary for multi-call agents
  const callsDist: TokenDistribution = {
    expected: agent.callsPerConversation,
    stddev: Math.max(0.1, agent.callsPerConversation * 0.1),
    min: 1,
    max: Math.max(agent.callsPerConversation, Math.ceil(agent.callsPerConversation * 1.5)),
  }

  return {
    id: agent.id,
    label: agent.name,
    type,
    inputDist,
    outputDist,
    callsPerExecution: callsDist,
    executionProbability: isEntry ? 1.0 : 0, // entry nodes start at 100%, others at 0
    mcpTools: buildMCPTools(agent),
    rag: buildRAGConfig(agent),
    loop: buildRecursiveLoop(agent),
    branches: [],
  }
}

/**
 * Build a probabilistic execution DAG from the existing Agent/Edge topology.
 *
 * This is the bridge between the deterministic model and the stochastic
 * Monte Carlo engine. Each agent becomes a DAG node with distributions
 * inferred from point values and configurable variance.
 */
export function buildExecutionDAG(
  agents: Agent[],
  edges: Edge[],
  workspaceName: string = 'Untitled',
): ExecutionDAG {
  if (agents.length === 0) {
    return {
      nodes: [],
      entryIds: [],
      metadata: { name: workspaceName, totalNodes: 0, simulatedNodeCount: 0 },
    }
  }

  const entryAgents = inferEntryAgents(agents, edges)
  const entryIds = entryAgents.map((a) => a.id)
  const edgeMap = new Map<string, Edge[]>()
  const incomingMap = new Map<string, Edge[]>()

  // Build adjacency maps
  for (const edge of edges) {
    const outEdges = edgeMap.get(edge.sourceId) ?? []
    outEdges.push(edge)
    edgeMap.set(edge.sourceId, outEdges)
    const inEdges = incomingMap.get(edge.targetId) ?? []
    inEdges.push(edge)
    incomingMap.set(edge.targetId, inEdges)
  }

  // Convert agents to DAG nodes
  const nodes: DAGNode[] = agents.map((agent) => {
    const isEntry = entryIds.includes(agent.id)
    const outgoing = edgeMap.get(agent.id) ?? []
    const hasOutgoing = outgoing.length > 0
    return agentToNode(agent, isEntry, hasOutgoing, edges)
  })

  // Build branches (edges become probabilistic branches)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.sourceId)
    if (!sourceNode) continue
    const targetNode = agents.find((a) => a.id === edge.targetId)
    sourceNode.branches.push({
      targetId: edge.targetId,
      probability: edge.weight,
      label: targetNode ? `→ ${targetNode.name}` : `→ ${edge.targetId}`,
    })
  }

  // Propagate execution probabilities via BFS
  const queue = [...entryIds]
  const visited = new Set<string>()
  // Entry nodes have executionProbability = 1.0 already from agentToNode

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const currentNode = nodeMap.get(currentId)
    if (!currentNode) continue

    // Propagate to downstream nodes: executionProbability = parentProb × edgeWeight
    for (const branch of currentNode.branches) {
      const targetNode = nodeMap.get(branch.targetId)
      if (!targetNode) continue
      // Accumulate: a node reached from multiple parents gets union probability
      const incomingProb = currentNode.executionProbability * branch.probability
      if (targetNode.executionProbability < 1.0) {
        // Simple additive probability (not union — conservative overestimate)
        targetNode.executionProbability = Math.min(1.0, targetNode.executionProbability + incomingProb)
      }
      queue.push(branch.targetId)
    }
  }

  return {
    nodes,
    entryIds,
    metadata: {
      name: workspaceName,
      totalNodes: nodes.length,
      simulatedNodeCount: nodes.length,
    },
  }
}

/**
 * Compute static tokens from the DAG (system prompts, schemas, routing instructions).
 * Static tokens are always present regardless of execution path.
 */
export function computeStaticTokens(dag: ExecutionDAG): number {
  let total = 0
  for (const node of dag.nodes) {
    // System prompt base per node
    total += 200 // estimated system prompt overhead per agent type
    // Schema tokens from MCP tools
    for (const tool of node.mcpTools) {
      total += tool.schemaTokens.expected
    }
  }
  // Routing instructions
  total += dag.nodes.length * 50
  return total
}

/**
 * Estimate initialization cost from pricing model (used for static cost).
 */
export function estimateStaticCost(
  staticTokens: number,
  pricing: WorkspacePricing,
): number {
  // Use the cheapest model's input price for static tokens
  const minPrice = Math.min(
    ...Object.values(pricing.models).map((p) => p.in),
    0.10, // default fallback
  )
  return (staticTokens / 1_000_000) * minPrice
}