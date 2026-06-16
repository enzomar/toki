import { describe, it, expect } from 'vitest'
import { runAEIRForecast, compileToAEIR } from './aeir'
import { createDefaultWorkspacePricing } from '../topology/config'
import type { Agent, Edge } from '../topology/types'

describe('AEIR Forecasting', () => {
  const pricing = createDefaultWorkspacePricing()
  
  const createTestAgent = (id: string, name: string): Agent => ({
    id,
    name,
    model: 'gpt-4o',
    inputTokensPerCall: 1000,
    outputTokensPerCall: 500,
    callsPerConversation: 1,
    promptCachePercent: 0,
    ragEnabled: false,
    ragChunks: 0,
    ragChunkTokens: 0,
    ragEmbeddingTokens: 0,
    mcpCalls: 0,
    mcpInputTokensPerCall: 0,
    mcpOutputTokensPerCall: 0,
    historyGrowthFactor: 1,
    routingMode: 'weighted',
  })
  
  describe('compileToAEIR', () => {
    it('compiles empty topology', () => {
      const { graph, compilationTimeMs } = compileToAEIR([], [])
      
      expect(graph.nodes).toHaveLength(0)
      expect(graph.edges).toHaveLength(0)
      expect(graph.entry_ids).toHaveLength(0)
      expect(compilationTimeMs).toBeLessThan(100)
    })
    
    it('compiles single agent', () => {
      const agents = [createTestAgent('a1', 'Agent 1')]
      const { graph, compilationTimeMs } = compileToAEIR(agents, [])
      
      expect(graph.nodes).toHaveLength(1)
      expect(graph.edges).toHaveLength(0)
      expect(graph.entry_ids).toEqual(['a1'])
      expect(graph.nodes[0].type).toBe('agent')
      expect(graph.nodes[0].execution_probability).toBe(1.0)
      expect(compilationTimeMs).toBeLessThan(100)
    })
    
    it('compiles agent with edges', () => {
      const agents = [
        createTestAgent('a1', 'Agent 1'),
        createTestAgent('a2', 'Agent 2'),
      ]
      const edges: Edge[] = [
        { id: 'e1', sourceId: 'a1', targetId: 'a2', weight: 0.8 },
      ]
      
      const { graph } = compileToAEIR(agents, edges)
      
      expect(graph.nodes).toHaveLength(2)
      expect(graph.edges).toHaveLength(1)
      expect(graph.entry_ids).toEqual(['a1'])
      expect(graph.edges[0].probability).toBe(0.8)
    })
    
    it('propagates execution probabilities', () => {
      const agents = [
        createTestAgent('a1', 'Agent 1'),
        createTestAgent('a2', 'Agent 2'),
      ]
      const edges: Edge[] = [
        { id: 'e1', sourceId: 'a1', targetId: 'a2', weight: 0.5 },
      ]
      
      const { graph } = compileToAEIR(agents, edges)
      
      const node1 = graph.nodes.find(n => n.id === 'a1')
      const node2 = graph.nodes.find(n => n.id === 'a2')
      
      expect(node1?.execution_probability).toBe(1.0)
      expect(node2?.execution_probability).toBeGreaterThan(0)
      expect(node2?.execution_probability).toBeLessThanOrEqual(0.5)
    })
    
    it('uses compilation cache', () => {
      const agents = [createTestAgent('a1', 'Agent 1')]
      
      const result1 = compileToAEIR(agents, [])
      const result2 = compileToAEIR(agents, [])
      
      // Second compilation should be faster (cached)
      expect(result2.compilationTimeMs).toBeLessThanOrEqual(result1.compilationTimeMs)
      expect(result2.graph.id).toBe(result1.graph.id)
    })
  })
  
  describe('runAEIRForecast', () => {
    it('runs forecast for single agent', () => {
      const agents = [createTestAgent('a1', 'Agent 1')]
      const result = runAEIRForecast(agents, [], 1000, pricing, { numSimulations: 50 })
      
      expect(result.tokens_p50_per_conv).toBeGreaterThan(0)
      expect(result.tokens_p90_per_conv).toBeGreaterThan(result.tokens_p50_per_conv)
      expect(result.tokens_p99_per_conv).toBeGreaterThan(result.tokens_p90_per_conv)
      expect(result.cost_p50_monthly).toBeGreaterThan(0)
      expect(result.simulation_count).toBe(50)
      expect(result.compilation_time_ms).toBeGreaterThan(0)
      expect(result.simulation_time_ms).toBeGreaterThan(0)
    })
    
    it('scales tokens to monthly volume', () => {
      const agents = [createTestAgent('a1', 'Agent 1')]
      const result = runAEIRForecast(agents, [], 1000, pricing, { numSimulations: 50 })
      
      expect(result.tokens_p50_monthly).toBe(result.tokens_p50_per_conv * 1000)
      expect(result.tokens_p90_monthly).toBe(result.tokens_p90_per_conv * 1000)
      expect(result.tokens_p99_monthly).toBe(result.tokens_p99_per_conv * 1000)
    })
    
    it('computes confidence score', () => {
      const agents = [createTestAgent('a1', 'Agent 1')]
      const result = runAEIRForecast(agents, [], 1000, pricing, { numSimulations: 100 })
      
      expect(result.confidence_score).toBeGreaterThan(0)
      expect(result.confidence_score).toBeLessThanOrEqual(1)
      expect(result.alignment_ratio).toBeGreaterThan(0)
      expect(typeof result.alignment_ok).toBe('boolean')
    })
    
    it('computes tail risk factor', () => {
      const agents = [createTestAgent('a1', 'Agent 1')]
      const result = runAEIRForecast(agents, [], 1000, pricing, { numSimulations: 100 })
      
      expect(result.tail_risk_factor).toBeGreaterThan(1)
      expect(result.tail_risk_factor).toBeLessThan(5)
    })
    
    it('handles empty topology', () => {
      const result = runAEIRForecast([], [], 1000, pricing, { numSimulations: 50 })
      
      expect(result.tokens_p50_per_conv).toBe(0)
      expect(result.tokens_p90_per_conv).toBe(0)
      expect(result.tokens_p99_per_conv).toBe(0)
      expect(result.cost_p50_monthly).toBe(0)
    })
    
    it('respects simulation count limit', () => {
      const agents = [createTestAgent('a1', 'Agent 1')]
      const result = runAEIRForecast(agents, [], 1000, pricing, { numSimulations: 75 })
      
      expect(result.simulation_count).toBe(75)
    })
    
    it('uses provided seed for reproducibility', () => {
      const agents = [createTestAgent('a1', 'Agent 1')]
      const result1 = runAEIRForecast(agents, [], 1000, pricing, { 
        numSimulations: 100, 
        seed: 42 
      })
      const result2 = runAEIRForecast(agents, [], 1000, pricing, { 
        numSimulations: 100, 
        seed: 42 
      })
      
      expect(result1.tokens_p50_per_conv).toBe(result2.tokens_p50_per_conv)
      expect(result1.tokens_p90_per_conv).toBe(result2.tokens_p90_per_conv)
      expect(result1.tokens_p99_per_conv).toBe(result2.tokens_p99_per_conv)
    })
  })
  
  describe('RAG agent', () => {
    it('includes RAG tokens in forecast', () => {
      const agents: Agent[] = [
        {
          ...createTestAgent('a1', 'RAG Agent'),
          ragEnabled: true,
          ragChunks: 5,
          ragChunkTokens: 500,
          ragEmbeddingTokens: 100,
        },
      ]
      
      const result = runAEIRForecast(agents, [], 1000, pricing, { numSimulations: 50 })
      
      expect(result.breakdown_rag_tokens).toBeGreaterThan(0)
      expect(result.breakdown_embedding_tokens).toBeGreaterThan(0)
      expect(result.tokens_p50_per_conv).toBeGreaterThan(1500) // base + RAG
    })
  })
  
  describe('MCP tool agent', () => {
    it('includes MCP tokens in forecast', () => {
      const agents: Agent[] = [
        {
          ...createTestAgent('a1', 'Tool Agent'),
          mcpCalls: 2,
          mcpInputTokensPerCall: 100,
          mcpOutputTokensPerCall: 200,
        },
      ]
      
      const result = runAEIRForecast(agents, [], 1000, pricing, { numSimulations: 50 })
      
      expect(result.breakdown_mcp_tokens).toBeGreaterThan(0)
      expect(result.tokens_p50_per_conv).toBeGreaterThan(1500) // base + MCP
    })
  })
})
