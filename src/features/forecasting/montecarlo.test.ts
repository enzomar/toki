import { describe, it, expect } from 'vitest'
import type { Agent, Edge } from '../topology/types'
import { createDefaultWorkspacePricing } from '../topology/config'
import { runAEIRForecast, compileToAEIR } from './aeir'

const defaultPricing = createDefaultWorkspacePricing()

// --- Test helpers ---

function makeSingleAgent(overrides?: Partial<Agent>): { agents: Agent[]; edges: Edge[] } {
  const base: Agent = {
    id: 'a1',
    name: 'Agent 1',
    model: 'gpt-4o-mini',
    callsPerConversation: 1,
    inputTokensPerCall: 500,
    outputTokensPerCall: 200,
    ragEnabled: false,
    ragChunks: 0,
    ragChunkTokens: 0,
    ragEmbeddingTokens: 0,
    mcpCalls: 0,
    mcpOutputTokensPerCall: 0,
    mcpInputTokensPerCall: 100,
    historyGrowthFactor: 1,
    promptCachePercent: 0,
    routingMode: 'weighted',
  }
  return {
    agents: [{ ...base, ...overrides }],
    edges: [],
  }
}

function makeTwoAgentChain(
  overrides1?: Partial<Agent>,
  overrides2?: Partial<Agent>,
): { agents: Agent[]; edges: Edge[] } {
  const base1: Agent = {
    id: 'a1',
    name: 'Agent 1',
    model: 'gpt-4o-mini',
    callsPerConversation: 1,
    inputTokensPerCall: 500,
    outputTokensPerCall: 200,
    ragEnabled: false,
    ragChunks: 0,
    ragChunkTokens: 0,
    ragEmbeddingTokens: 0,
    mcpCalls: 0,
    mcpOutputTokensPerCall: 0,
    mcpInputTokensPerCall: 100,
    historyGrowthFactor: 1,
    promptCachePercent: 0,
    routingMode: 'weighted',
  }
  const base2: Agent = { ...base1, id: 'a2', name: 'Agent 2' }
  return {
    agents: [
      { ...base1, ...overrides1 },
      { ...base2, ...overrides2 },
    ],
    edges: [{ id: 'e1', sourceId: 'a1', targetId: 'a2', weight: 1 }],
  }
}

// --- AEIR Compiler Tests ---

describe('AEIR Compiler', () => {
  it('compiles empty topology', () => {
    const { graph } = compileToAEIR([], [])
    
    expect(graph.nodes).toHaveLength(0)
    expect(graph.entry_ids).toHaveLength(0)
  })

  it('creates a node for each agent', () => {
    const { agents } = makeSingleAgent()
    const { graph } = compileToAEIR(agents, [])
    
    expect(graph.nodes).toHaveLength(1)
    expect(graph.entry_ids).toHaveLength(1)
  })

  it('infers RAG node type for RAG-enabled agents', () => {
    const { agents, edges } = makeTwoAgentChain(
      {},
      { ragEnabled: true },
    )
    const { graph } = compileToAEIR(agents, edges)
    
    const ragNode = graph.nodes.find((n) => n.id === 'a2')
    expect(ragNode?.type).toBe('rag')
  })

  it('builds edges from topology', () => {
    const { agents, edges } = makeTwoAgentChain()
    const { graph } = compileToAEIR(agents, edges)
    
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0].probability).toBe(1)
  })

  it('propagates execution probabilities through graph', () => {
    const agents: Agent[] = [
      { ...makeSingleAgent().agents[0], id: 'a1' },
      { ...makeSingleAgent().agents[0], id: 'a2' },
      { ...makeSingleAgent().agents[0], id: 'a3' },
    ]
    const edges: Edge[] = [
      { id: 'e1', sourceId: 'a1', targetId: 'a2', weight: 0.7 },
      { id: 'e2', sourceId: 'a1', targetId: 'a3', weight: 0.3 },
    ]
    const { graph } = compileToAEIR(agents, edges)
    
    const child1 = graph.nodes.find((n) => n.id === 'a2')
    const child2 = graph.nodes.find((n) => n.id === 'a3')
    expect(child1?.execution_probability).toBeGreaterThan(0)
    expect(child2?.execution_probability).toBeGreaterThan(0)
  })

  it('infers tool node for agents with MCP calls', () => {
    const { agents } = makeSingleAgent({ mcpCalls: 3 })
    const { graph } = compileToAEIR(agents, [])
    
    const node = graph.nodes[0]
    expect(node.type).toBe('tool')
  })

  it('generates token distributions from point values', () => {
    const { agents } = makeSingleAgent()
    const { graph } = compileToAEIR(agents, [])
    
    const node = graph.nodes[0]
    expect(node.input_dist.mean).toBe(500)
    expect(node.input_dist.stddev).toBeGreaterThan(0)
    expect(node.input_dist.min).toBeGreaterThan(0)
    expect(node.input_dist.max).toBeGreaterThan(node.input_dist.mean)
  })
})

// --- AEIR Simulation Tests ---

describe('AEIR Simulation', () => {
  it('returns zero for empty topology', () => {
    const result = runAEIRForecast([], [], 1000, defaultPricing, { numSimulations: 100, seed: 42 })
    
    expect(result.tokens_expected_per_conv).toBe(0)
    expect(result.cost_expected_monthly).toBe(0)
  })

  it('produces non-zero tokens for single agent', () => {
    const { agents } = makeSingleAgent()
    const result = runAEIRForecast(agents, [], 1000, defaultPricing, { 
      numSimulations: 500, 
      seed: 42 
    })
    
    expect(result.tokens_expected_per_conv).toBeGreaterThan(0)
    expect(result.cost_expected_monthly).toBeGreaterThan(0)
  })

  it('p99 >= p90 >= p50', () => {
    const { agents } = makeSingleAgent()
    const result = runAEIRForecast(agents, [], 5000, defaultPricing, { 
      numSimulations: 200, 
      seed: 42 
    })
    
    expect(result.tokens_p99_per_conv).toBeGreaterThanOrEqual(result.tokens_p90_per_conv)
    expect(result.tokens_p90_per_conv).toBeGreaterThanOrEqual(result.tokens_p50_per_conv)
  })

  it('produces deterministic output for same seed', () => {
    const { agents } = makeSingleAgent()
    const result1 = runAEIRForecast(agents, [], 1000, defaultPricing, { 
      numSimulations: 200, 
      seed: 123 
    })
    const result2 = runAEIRForecast(agents, [], 1000, defaultPricing, { 
      numSimulations: 200, 
      seed: 123 
    })
    
    expect(result1.tokens_expected_per_conv).toBe(result2.tokens_expected_per_conv)
    expect(result1.tokens_p50_per_conv).toBe(result2.tokens_p50_per_conv)
  })

  it('scales tokens to monthly volume', () => {
    const { agents } = makeSingleAgent()
    const conversationsPerMonth = 5000
    const result = runAEIRForecast(agents, [], conversationsPerMonth, defaultPricing, { 
      numSimulations: 100, 
      seed: 42 
    })
    
    expect(result.tokens_p50_monthly).toBe(result.tokens_p50_per_conv * conversationsPerMonth)
    expect(result.tokens_p90_monthly).toBe(result.tokens_p90_per_conv * conversationsPerMonth)
  })

  it('tracks MCP token breakdown', () => {
    const { agents } = makeSingleAgent({
      mcpCalls: 3,
      mcpInputTokensPerCall: 100,
      mcpOutputTokensPerCall: 150,
    })
    const result = runAEIRForecast(agents, [], 1000, defaultPricing, { 
      numSimulations: 200, 
      seed: 42 
    })
    
    expect(result.breakdown_mcp_tokens).toBeGreaterThan(0)
  })

  it('tracks RAG token breakdown', () => {
    const { agents } = makeSingleAgent({
      ragEnabled: true,
      ragChunks: 5,
      ragChunkTokens: 180,
      ragEmbeddingTokens: 80,
    })
    const result = runAEIRForecast(agents, [], 1000, defaultPricing, { 
      numSimulations: 200, 
      seed: 42 
    })
    
    expect(result.breakdown_rag_tokens).toBeGreaterThan(0)
    expect(result.breakdown_embedding_tokens).toBeGreaterThan(0)
  })

  it('computes confidence score', () => {
    const { agents } = makeSingleAgent()
    const result = runAEIRForecast(agents, [], 1000, defaultPricing, { 
      numSimulations: 200, 
      seed: 42 
    })
    
    expect(result.confidence_score).toBeGreaterThan(0)
    expect(result.confidence_score).toBeLessThanOrEqual(1)
  })

  it('computes alignment ratio', () => {
    const { agents } = makeSingleAgent()
    const result = runAEIRForecast(agents, [], 1000, defaultPricing, { 
      numSimulations: 200, 
      seed: 42 
    })
    
    expect(result.alignment_ratio).toBeGreaterThan(0)
    expect(typeof result.alignment_ok).toBe('boolean')
  })

  it('computes tail risk factor', () => {
    const { agents } = makeSingleAgent()
    const result = runAEIRForecast(agents, [], 1000, defaultPricing, { 
      numSimulations: 200, 
      seed: 42 
    })
    
    expect(result.tail_risk_factor).toBeGreaterThan(1)
  })

  it('produces variance in results', () => {
    const { agents } = makeSingleAgent()
    const result = runAEIRForecast(agents, [], 10000, defaultPricing, { 
      numSimulations: 500, 
      seed: 42 
    })
    
    expect(result.variance_tokens).toBeGreaterThan(0)
  })

  it('handles multi-agent topologies', () => {
    const agents: Agent[] = [
      { ...makeSingleAgent().agents[0], id: 'orch', name: 'Orchestrator' },
      { ...makeSingleAgent().agents[0], id: 'spec1', name: 'Specialist 1' },
      { ...makeSingleAgent().agents[0], id: 'spec2', name: 'Specialist 2' },
    ]
    const edges: Edge[] = [
      { id: 'e1', sourceId: 'orch', targetId: 'spec1', weight: 0.6 },
      { id: 'e2', sourceId: 'orch', targetId: 'spec2', weight: 0.4 },
    ]
    const result = runAEIRForecast(agents, edges, 5000, defaultPricing, { 
      numSimulations: 500, 
      seed: 42 
    })
    
    expect(result.tokens_expected_per_conv).toBeGreaterThan(0)
  })

  it('handles full AEIR pipeline', () => {
    const { agents, edges } = makeTwoAgentChain(
      {},
      { 
        inputTokensPerCall: 600, 
        outputTokensPerCall: 300, 
        ragEnabled: true, 
        ragChunks: 3, 
        ragChunkTokens: 150 
      },
    )
    const result = runAEIRForecast(agents, edges, 10000, defaultPricing, { 
      numSimulations: 200, 
      seed: 42 
    })
    
    expect(result.tokens_expected_per_conv).toBeGreaterThan(0)
    expect(result.cost_expected_monthly).toBeGreaterThan(0)
    expect(result.breakdown_rag_tokens).toBeGreaterThan(0)
  })

  it('reports simulation metadata', () => {
    const { agents } = makeSingleAgent()
    const result = runAEIRForecast(agents, [], 5000, defaultPricing, { 
      numSimulations: 100, 
      seed: 42 
    })
    
    expect(result.simulation_count).toBe(100)
    expect(result.compilation_time_ms).toBeGreaterThan(0)
    expect(result.simulation_time_ms).toBeGreaterThan(0)
  })
})
