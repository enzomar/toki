import { describe, it, expect } from 'vitest'
import {
  calculateAgentCost,
  calculateEstimate,
  createId,
  estimateTokenCount,
  formatCurrency,
  formatMetricNumber,
  getModelLabel,
  getPricing,
  getTokenEstimateDetails,
  inferEntryAgents,
  sanitizeEdges,
  toNumber,
  buildTopologyLayout,
  createTopologyDocument,
  parseTopologyDocument,
} from './utils'
import { createDefaultAgent, createDefaultWorkspacePricing } from './config'
import type { Agent, Edge } from './types'

// --- Utility functions ---

describe('toNumber', () => {
  it('parses valid numbers', () => {
    expect(toNumber('42', 0)).toBe(42)
    expect(toNumber('3.14', 0)).toBeCloseTo(3.14)
    expect(toNumber(100, 0)).toBe(100)
  })

  it('returns fallback for invalid values', () => {
    expect(toNumber('abc', 99)).toBe(99)
    expect(toNumber(null, 5)).toBe(5)
    expect(toNumber(undefined, 7)).toBe(7)
    expect(toNumber(NaN, 3)).toBe(3)
    expect(toNumber(Infinity, 1)).toBe(1)
  })
})

describe('createId', () => {
  it('generates unique IDs with prefix', () => {
    const id1 = createId('agent')
    const id2 = createId('agent')
    expect(id1).toMatch(/^agent-/)
    expect(id2).toMatch(/^agent-/)
    expect(id1).not.toBe(id2)
  })
})

describe('formatCurrency', () => {
  it('formats USD values', () => {
    expect(formatCurrency(1234.56, 'USD')).toContain('1,234.56')
    expect(formatCurrency(0.0042, 'USD')).toContain('0.0042')
  })

  it('formats EUR values', () => {
    expect(formatCurrency(99.99, 'EUR')).toContain('99')
  })
})

describe('formatMetricNumber', () => {
  it('formats small numbers as-is', () => {
    expect(formatMetricNumber(42)).toBe('42')
    expect(formatMetricNumber(999)).toBe('999')
  })

  it('formats thousands with k suffix', () => {
    expect(formatMetricNumber(1500)).toBe('1.5k')
    expect(formatMetricNumber(50000)).toBe('50k')
  })

  it('formats millions with M suffix', () => {
    expect(formatMetricNumber(1500000)).toBe('1.5M')
    expect(formatMetricNumber(42000000)).toBe('42.0M')
  })

  it('formats billions with B suffix', () => {
    expect(formatMetricNumber(2500000000)).toBe('2.5B')
  })
})

describe('getModelLabel', () => {
  it('returns label for known models', () => {
    expect(getModelLabel('gpt-4o-mini')).toBe('GPT-4o Mini')
    expect(getModelLabel('claude-3-5-sonnet')).toBe('Claude 3.5 Sonnet')
  })

  it('returns raw value for unknown models', () => {
    expect(getModelLabel('custom-model-x')).toBe('custom-model-x')
  })
})

describe('getPricing', () => {
  it('returns pricing for known models', () => {
    const p = getPricing('gpt-4o-mini')
    expect(p.in).toBe(0.15)
    expect(p.out).toBe(0.6)
  })

  it('returns zero for unknown models', () => {
    const p = getPricing('nonexistent')
    expect(p.in).toBe(0)
    expect(p.out).toBe(0)
  })

  it('uses custom pricing map', () => {
    const custom = { 'my-model': { in: 5, out: 10 } }
    expect(getPricing('my-model', custom)).toEqual({ in: 5, out: 10 })
  })
})

// --- Token estimation ---

describe('estimateTokenCount', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokenCount('')).toBe(0)
    expect(estimateTokenCount('   ')).toBe(0)
  })

  it('estimates tokens for short text', () => {
    const tokens = estimateTokenCount('Hello world')
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(10)
  })

  it('estimates tokens for longer text', () => {
    const text = 'The quick brown fox jumps over the lazy dog. This is a sample sentence for testing token estimation accuracy.'
    const tokens = estimateTokenCount(text)
    expect(tokens).toBeGreaterThan(15)
    expect(tokens).toBeLessThan(40)
  })

  it('handles JSON content', () => {
    const json = JSON.stringify({ name: 'test', items: [1, 2, 3], nested: { key: 'value' } })
    const tokens = estimateTokenCount(json)
    expect(tokens).toBeGreaterThan(10)
  })
})

describe('getTokenEstimateDetails', () => {
  it('returns zeros for empty text', () => {
    expect(getTokenEstimateDetails('')).toEqual({ characters: 0, words: 0, tokens: 0 })
  })

  it('returns all metrics for text', () => {
    const details = getTokenEstimateDetails('Hello world test')
    expect(details.characters).toBe(16)
    expect(details.words).toBe(3)
    expect(details.tokens).toBeGreaterThan(0)
  })
})

// --- Cost calculation ---

describe('calculateAgentCost', () => {
  const baseAgent: Agent = {
    id: 'test-agent',
    name: 'Test Agent',
    model: 'gpt-4o-mini',
    callsPerConversation: 2,
    inputTokensPerCall: 500,
    outputTokensPerCall: 200,
    historyGrowthFactor: 1,
    promptCachePercent: 0,
    ragEnabled: false,
    ragChunks: 0,
    ragChunkTokens: 0,
    ragEmbeddingTokens: 0,
    mcpCalls: 0,
    mcpOutputTokensPerCall: 0,
    mcpInputTokensPerCall: 0,
    routingMode: 'weighted',
  }

  it('calculates basic cost correctly', () => {
    const result = calculateAgentCost(baseAgent, 1000, 1.0)
    // 1000 conversations × 2 calls = 2000 calls/month
    expect(result.callsPerMonth).toBe(2000)
    // 2000 × 500 = 1,000,000 input tokens
    expect(result.inputTokensPerMonth).toBe(1_000_000)
    // 2000 × 200 = 400,000 output tokens
    expect(result.outputTokensPerMonth).toBe(400_000)
    // No embedding
    expect(result.embeddingTokensPerMonth).toBe(0)
    // Cost: (1M / 1M) × 0.15 + (400k / 1M) × 0.6 = 0.15 + 0.24 = 0.39
    expect(result.costPerMonth).toBeCloseTo(0.39, 2)
  })

  it('includes RAG context in input tokens', () => {
    const ragAgent: Agent = {
      ...baseAgent,
      ragEnabled: true,
      ragChunks: 4,
      ragChunkTokens: 150,
      ragEmbeddingTokens: 60,
    }
    const result = calculateAgentCost(ragAgent, 1000, 1.0)
    // RAG context per call: 4 × 150 = 600 tokens added to input
    // Input per call: 500 + 600 = 1100
    // 2000 calls × 1100 = 2,200,000 input tokens
    expect(result.inputTokensPerMonth).toBe(2_200_000)
    // Embedding: 2000 × 60 = 120,000
    expect(result.embeddingTokensPerMonth).toBe(120_000)
  })

  it('includes MCP output overhead', () => {
    const mcpAgent: Agent = {
      ...baseAgent,
      mcpCalls: 3,
      mcpOutputTokensPerCall: 200,
    }
    const result = calculateAgentCost(mcpAgent, 1000, 1.0)
    // MCP output per call: 3 × 200 = 600 added to output
    // Output per call: 200 + 600 = 800
    // 2000 calls × 800 = 1,600,000 output tokens
    expect(result.outputTokensPerMonth).toBe(1_600_000)
  })

  it('returns zero cost for zero conversations', () => {
    const result = calculateAgentCost(baseAgent, 0, 1.0)
    expect(result.costPerMonth).toBe(0)
    expect(result.totalTokensPerMonth).toBe(0)
  })
})

describe('calculateEstimate', () => {
  it('sums costs across multiple agents', () => {
    const agents: Agent[] = [
      { ...createDefaultAgent(0), callsPerConversation: 1, inputTokensPerCall: 100, outputTokensPerCall: 50 },
      { ...createDefaultAgent(1), callsPerConversation: 1, inputTokensPerCall: 200, outputTokensPerCall: 100 },
    ]
    const pricing = createDefaultWorkspacePricing()
    const result = calculateEstimate(agents, { users: 1000, conversationsPerUser: 10, timeRange: 'month', conversationsPerMonth: 10000 }, pricing)

    expect(result.agents).toHaveLength(2)
    expect(result.totalCostPerMonth).toBeGreaterThan(0)
    expect(result.totalTokensPerMonth).toBe(result.totalInputTokens + result.totalOutputTokens + result.totalEmbeddingTokens)
    expect(result.costPerConversation).toBeCloseTo(result.totalCostPerMonth / 10000)
  })

  it('returns zero for empty agents', () => {
    const result = calculateEstimate([], { users: 5000, conversationsPerUser: 10, timeRange: 'month', conversationsPerMonth: 50000 }, createDefaultWorkspacePricing())
    expect(result.totalCostPerMonth).toBe(0)
    expect(result.totalTokensPerMonth).toBe(0)
    expect(result.costPerConversation).toBe(0)
  })

  it('sorts agents by cost descending', () => {
    const agents: Agent[] = [
      { ...createDefaultAgent(0), name: 'Cheap', model: 'gpt-4o-mini', inputTokensPerCall: 100, outputTokensPerCall: 50 },
      { ...createDefaultAgent(1), name: 'Expensive', model: 'gpt-4o', inputTokensPerCall: 1000, outputTokensPerCall: 500 },
    ]
    const result = calculateEstimate(agents, { users: 100, conversationsPerUser: 10, timeRange: 'month', conversationsPerMonth: 1000 }, createDefaultWorkspacePricing())
    expect(result.agents[0].name).toBe('Expensive')
    expect(result.agents[1].name).toBe('Cheap')
  })
})

// --- Edge / topology helpers ---

describe('sanitizeEdges', () => {
  const agents: Agent[] = [
    { ...createDefaultAgent(0), id: 'a' },
    { ...createDefaultAgent(1), id: 'b' },
  ]

  it('keeps valid edges', () => {
    const edges: Edge[] = [{ id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 }]
    expect(sanitizeEdges(agents, edges)).toHaveLength(1)
  })

  it('removes edges with invalid agent references', () => {
    const edges: Edge[] = [
      { id: 'e1', sourceId: 'a', targetId: 'nonexistent', weight: 1 },
      { id: 'e2', sourceId: 'missing', targetId: 'b', weight: 1 },
    ]
    expect(sanitizeEdges(agents, edges)).toHaveLength(0)
  })
})

describe('inferEntryAgents', () => {
  const agents: Agent[] = [
    { ...createDefaultAgent(0), id: 'a', name: 'A' },
    { ...createDefaultAgent(1), id: 'b', name: 'B' },
    { ...createDefaultAgent(2), id: 'c', name: 'C' },
  ]

  it('returns agents with no incoming edges', () => {
    const edges: Edge[] = [
      { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
      { id: 'e2', sourceId: 'a', targetId: 'c', weight: 1 },
    ]
    const entries = inferEntryAgents(agents, edges)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('a')
  })

  it('returns all agents when no edges exist', () => {
    expect(inferEntryAgents(agents, [])).toHaveLength(3)
  })

  it('falls back to first agent in a cycle', () => {
    const edges: Edge[] = [
      { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
      { id: 'e2', sourceId: 'b', targetId: 'a', weight: 1 },
    ]
    const entries = inferEntryAgents(agents, edges)
    // c has no incoming, so it's an entry
    expect(entries.some((e) => e.id === 'c')).toBe(true)
  })
})

// --- Topology layout ---

describe('buildTopologyLayout', () => {
  it('returns empty for no agents', () => {
    expect(buildTopologyLayout([], [], 800, 600)).toHaveLength(0)
  })

  it('positions agents in a grid when no edges', () => {
    const agents = [createDefaultAgent(0), createDefaultAgent(1), createDefaultAgent(2)]
    const layout = buildTopologyLayout(agents, [], 800, 600)
    expect(layout).toHaveLength(3)
    layout.forEach((node) => {
      expect(node.x).toBeGreaterThan(0)
      expect(node.y).toBeGreaterThan(0)
    })
  })

  it('assigns depth based on edges', () => {
    const agents: Agent[] = [
      { ...createDefaultAgent(0), id: 'a' },
      { ...createDefaultAgent(1), id: 'b' },
    ]
    const edges: Edge[] = [{ id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 }]
    const layout = buildTopologyLayout(agents, edges, 800, 600)
    const nodeA = layout.find((n) => n.agent.id === 'a')!
    const nodeB = layout.find((n) => n.agent.id === 'b')!
    expect(nodeA.depth).toBeLessThan(nodeB.depth)
  })
})

// --- Import / Export round-trip ---

describe('createTopologyDocument / parseTopologyDocument', () => {
  it('round-trips a workspace', () => {
    const agents: Agent[] = [
      { ...createDefaultAgent(0), id: 'agent-1', name: 'Orchestrator', model: 'gpt-4o' },
      { ...createDefaultAgent(1), id: 'agent-2', name: 'Worker', ragEnabled: true, ragChunks: 3, ragChunkTokens: 100, ragEmbeddingTokens: 50 },
    ]
    const edges: Edge[] = [{ id: 'e1', sourceId: 'agent-1', targetId: 'agent-2', weight: 0.8 }]
    const estimate = { users: 2500, conversationsPerUser: 10, timeRange: 'month' as const, conversationsPerMonth: 25000 }
    const pricing = createDefaultWorkspacePricing()

    const doc = createTopologyDocument(agents, edges, estimate, pricing)
    const parsed = parseTopologyDocument(doc)

    expect(parsed.agents).toHaveLength(2)
    expect(parsed.agents[0].name).toBe('Orchestrator')
    expect(parsed.agents[1].ragEnabled).toBe(true)
    expect(parsed.agents[1].ragChunks).toBe(3)
    expect(parsed.edges).toHaveLength(1)
    expect(parsed.edges[0].weight).toBe(0.8)
    expect(parsed.estimate.conversationsPerMonth).toBe(25000)
    expect(parsed.pricing.currency).toBe('EUR')
  })

  it('throws for empty agents', () => {
    expect(() => parseTopologyDocument({ topology: { agents: [], edges: [] } })).toThrow()
  })

  it('handles snake_case keys in import', () => {
    const doc = {
      topology: {
        agents: [{
          id: 'a1',
          name: 'Test',
          model: 'gpt-4o',
          calls_per_conversation: 3,
          input_tokens_per_call: 800,
          output_tokens_per_call: 400,
          rag_enabled: true,
          rag_chunks: 5,
          rag_chunk_tokens: 200,
          rag_embedding_tokens: 80,
          mcp_calls: 2,
          mcp_tokens_per_call: 150,
        }],
        edges: [],
      },
      estimate: { monthly_volume: 10000 },
    }
    const parsed = parseTopologyDocument(doc)
    expect(parsed.agents[0].callsPerConversation).toBe(3)
    expect(parsed.agents[0].inputTokensPerCall).toBe(800)
    expect(parsed.agents[0].ragEnabled).toBe(true)
    expect(parsed.agents[0].mcpCalls).toBe(2)
  })
})
