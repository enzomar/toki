import type { Agent, Edge, RoutingMode, WorkspacePricing } from './types'

export type ModelOption = {
  value: string
  label: string
}

export type RoutingModeOption = {
  value: RoutingMode
  label: string
  helper: string
}

export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'o3', label: 'o3 (reasoning)' },
  { value: 'o4-mini', label: 'o4-mini (reasoning)' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'claude-haiku-4', label: 'Claude Haiku 4' },
  { value: 'claude-opus-4', label: 'Claude Opus 4' },
]

export const PRICING_TOKENS_PER_UNIT = 1_000_000

export const PRICING: Record<string, { in: number; out: number }> = {
  'gpt-4.1': { in: 2.00, out: 8.00 },
  'gpt-4.1-mini': { in: 0.40, out: 1.60 },
  'gpt-4.1-nano': { in: 0.10, out: 0.40 },
  'gpt-4o': { in: 2.50, out: 10.00 },
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'o3': { in: 2.00, out: 8.00 },
  'o4-mini': { in: 1.10, out: 4.40 },
  'claude-sonnet-4': { in: 3.00, out: 15.00 },
  'claude-haiku-4': { in: 1.00, out: 5.00 },
  'claude-opus-4': { in: 15.00, out: 75.00 },
}

export const EMBEDDING_PRICE_PER_1M = 0.02

export const DEFAULT_ROUTING_MODE: RoutingMode = 'weighted'

export const ROUTING_MODE_OPTIONS: RoutingModeOption[] = [
  {
    value: 'fanout',
    label: 'Fan-out',
    helper: 'Every downstream agent runs. Traffic multiplies.',
  },
  {
    value: 'weighted',
    label: 'Weighted',
    helper: 'One downstream agent runs per call. Edge weights split traffic.',
  },
  {
    value: 'interleave',
    label: 'Round-robin',
    helper: 'Downstream agents take turns equally.',
  },
]

export function createDefaultAgent(index: number, modelOptions: ModelOption[] = MODEL_OPTIONS): Agent {
  const model = modelOptions[0]?.value ?? 'gpt-4o-mini'
  return {
    id: `agent-${crypto.randomUUID().slice(0, 8)}`,
    name: `Agent ${index + 1}`,
    model,
    callsPerConversation: 1,
    inputTokensPerCall: 500,
    outputTokensPerCall: 200,
    historyGrowthFactor: 1,
    promptCachePercent: 0,
    ragEnabled: false,
    ragChunks: 0,
    ragChunkTokens: 0,
    ragEmbeddingTokens: 0,
    mcpCalls: 0,
    mcpOutputTokensPerCall: 150,
    mcpInputTokensPerCall: 100,
    routingMode: DEFAULT_ROUTING_MODE,
  }
}

export function createDefaultWorkspacePricing(): WorkspacePricing {
  return {
    models: { ...PRICING },
    embeddingPricePer1M: EMBEDDING_PRICE_PER_1M,
    currency: 'EUR',
  }
}

export const WORKSPACE_SAMPLES: Array<{
  id: string
  label: string
  description: string
  agents: Agent[]
  edges: Edge[]
  conversationsPerMonth: number
}> = [
  {
    id: 'orchestrated-rag',
    label: 'Orchestrated RAG stack',
    description: 'An orchestrator routes to a RAG specialist and a response composer. Typical enterprise Q&A pattern.',
    conversationsPerMonth: 50000,
    agents: [
      {
        id: 'orchestrator',
        name: 'Orchestrator',
        model: 'gpt-4o-mini',
        callsPerConversation: 1,
        inputTokensPerCall: 300,
        outputTokensPerCall: 100,
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
      },
      {
        id: 'rag-agent',
        name: 'RAG Specialist',
        model: 'claude-sonnet-4',
        callsPerConversation: 2,
        inputTokensPerCall: 800,
        outputTokensPerCall: 300,
        ragEnabled: true,
        ragChunks: 5,
        ragChunkTokens: 180,
        ragEmbeddingTokens: 80,
        mcpCalls: 0,
        mcpOutputTokensPerCall: 0,
        mcpInputTokensPerCall: 100,
        historyGrowthFactor: 1,
        promptCachePercent: 0,
        routingMode: 'weighted',
      },
      {
        id: 'composer',
        name: 'Response Composer',
        model: 'gpt-4o',
        callsPerConversation: 1,
        inputTokensPerCall: 1200,
        outputTokensPerCall: 600,
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
      },
    ],
    edges: [
      { id: 'e1', sourceId: 'orchestrator', targetId: 'rag-agent', weight: 0.7 },
      { id: 'e2', sourceId: 'orchestrator', targetId: 'composer', weight: 0.3 },
      { id: 'e3', sourceId: 'rag-agent', targetId: 'composer', weight: 1 },
    ],
  },
  {
    id: 'tool-calling',
    label: 'Tool-calling assistant',
    description: 'A single agent that uses MCP tools to fetch data and perform actions before responding.',
    conversationsPerMonth: 20000,
    agents: [
      {
        id: 'assistant',
        name: 'Tool Assistant',
        model: 'gpt-4o',
        callsPerConversation: 3,
        inputTokensPerCall: 600,
        outputTokensPerCall: 250,
        ragEnabled: false,
        ragChunks: 0,
        ragChunkTokens: 0,
        ragEmbeddingTokens: 0,
        mcpCalls: 4,
        mcpOutputTokensPerCall: 200,
        mcpInputTokensPerCall: 100,
        historyGrowthFactor: 1,
        promptCachePercent: 0,
        routingMode: 'weighted',
      },
    ],
    edges: [],
  },
  {
    id: 'audience-orchestrator',
    label: 'Audience Orchestrator',
    description: 'An orchestrator routes to 5 specialized audience agents (Definition Creator, Inspector, Snapshot, Recommendation, General) with varying MCP call patterns and traffic weights.',
    conversationsPerMonth: 35000,
    agents: [
      {
        id: 'audience-orch',
        name: 'Audience Orchestrator',
        model: 'gpt-4.1',
        callsPerConversation: 1,
        inputTokensPerCall: 200,
        outputTokensPerCall: 1000,
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
      },
      {
        id: 'audience-definition',
        name: 'Audience Definition Creator',
        model: 'gpt-4.1',
        callsPerConversation: 1,
        inputTokensPerCall: 200,
        outputTokensPerCall: 200,
        ragEnabled: false,
        ragChunks: 0,
        ragChunkTokens: 0,
        ragEmbeddingTokens: 0,
        mcpCalls: 2,
        mcpOutputTokensPerCall: 150,
        mcpInputTokensPerCall: 100,
        historyGrowthFactor: 1,
        promptCachePercent: 0,
        routingMode: 'weighted',
      },
      {
        id: 'audience-inspector',
        name: 'Audience Inspector',
        model: 'gpt-4.1',
        callsPerConversation: 1,
        inputTokensPerCall: 100,
        outputTokensPerCall: 1000,
        ragEnabled: false,
        ragChunks: 0,
        ragChunkTokens: 0,
        ragEmbeddingTokens: 0,
        mcpCalls: 1,
        mcpOutputTokensPerCall: 150,
        mcpInputTokensPerCall: 100,
        historyGrowthFactor: 1,
        promptCachePercent: 0,
        routingMode: 'weighted',
      },
      {
        id: 'audience-snapshot',
        name: 'Audience Snapshot',
        model: 'gpt-4.1',
        callsPerConversation: 1,
        inputTokensPerCall: 100,
        outputTokensPerCall: 1000,
        ragEnabled: false,
        ragChunks: 0,
        ragChunkTokens: 0,
        ragEmbeddingTokens: 0,
        mcpCalls: 1,
        mcpOutputTokensPerCall: 150,
        mcpInputTokensPerCall: 100,
        historyGrowthFactor: 1,
        promptCachePercent: 0,
        routingMode: 'weighted',
      },
      {
        id: 'audience-recommendation',
        name: 'Audience Recommendation',
        model: 'gpt-4.1',
        callsPerConversation: 1,
        inputTokensPerCall: 100,
        outputTokensPerCall: 1000,
        ragEnabled: false,
        ragChunks: 0,
        ragChunkTokens: 0,
        ragEmbeddingTokens: 0,
        mcpCalls: 2,
        mcpOutputTokensPerCall: 150,
        mcpInputTokensPerCall: 100,
        historyGrowthFactor: 1,
        promptCachePercent: 0,
        routingMode: 'weighted',
      },
      {
        id: 'audience-general',
        name: 'Audience General',
        model: 'gpt-4.1',
        callsPerConversation: 1,
        inputTokensPerCall: 100,
        outputTokensPerCall: 1000,
        ragEnabled: false,
        ragChunks: 0,
        ragChunkTokens: 0,
        ragEmbeddingTokens: 0,
        mcpCalls: 4,
        mcpOutputTokensPerCall: 150,
        mcpInputTokensPerCall: 100,
        historyGrowthFactor: 1,
        promptCachePercent: 0,
        routingMode: 'weighted',
      },
    ],
    edges: [
      { id: 'ae1', sourceId: 'audience-orch', targetId: 'audience-definition', weight: 0.10 },
      { id: 'ae2', sourceId: 'audience-orch', targetId: 'audience-inspector', weight: 0.50 },
      { id: 'ae3', sourceId: 'audience-orch', targetId: 'audience-snapshot', weight: 1.00 },
      { id: 'ae4', sourceId: 'audience-orch', targetId: 'audience-recommendation', weight: 0.80 },
      { id: 'ae5', sourceId: 'audience-orch', targetId: 'audience-general', weight: 0.50 },
    ],
  },
]
