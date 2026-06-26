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

export const PRICING: Record<string, { in: number; out: number; cached_in?: number; batch_in?: number; batch_out?: number; tokensPerSecond?: number }> = {
  'gpt-4.1': { in: 2.00, out: 8.00, cached_in: 0.50, batch_in: 1.00, batch_out: 4.00, tokensPerSecond: 80 },
  'gpt-4.1-mini': { in: 0.40, out: 1.60, cached_in: 0.10, batch_in: 0.20, batch_out: 0.80, tokensPerSecond: 120 },
  'gpt-4.1-nano': { in: 0.10, out: 0.40, cached_in: 0.025, batch_in: 0.05, batch_out: 0.20, tokensPerSecond: 150 },
  'gpt-4o': { in: 2.50, out: 10.00, cached_in: 1.25, batch_in: 1.25, batch_out: 5.00, tokensPerSecond: 80 },
  'gpt-4o-mini': { in: 0.15, out: 0.60, cached_in: 0.075, batch_in: 0.075, batch_out: 0.30, tokensPerSecond: 130 },
  'o3': { in: 2.00, out: 8.00, cached_in: 0.50, batch_in: 1.00, batch_out: 4.00, tokensPerSecond: 30 },
  'o4-mini': { in: 1.10, out: 4.40, cached_in: 0.275, batch_in: 0.55, batch_out: 2.20, tokensPerSecond: 60 },
  'claude-sonnet-4': { in: 3.00, out: 15.00, cached_in: 0.30, batch_in: 1.50, batch_out: 7.50, tokensPerSecond: 70 },
  'claude-haiku-4': { in: 1.00, out: 5.00, cached_in: 0.10, batch_in: 0.50, batch_out: 2.50, tokensPerSecond: 120 },
  'claude-opus-4': { in: 15.00, out: 75.00, cached_in: 1.50, batch_in: 7.50, batch_out: 37.50, tokensPerSecond: 40 },
}

export const EMBEDDING_PRICE_PER_1M = 0.02
export const DEFAULT_ROUTING_MODE: RoutingMode = 'weighted'

export const ROUTING_MODE_OPTIONS: RoutingModeOption[] = [
  { value: 'fanout', label: 'Fan-out', helper: 'Every downstream agent runs. Traffic multiplies.' },
  { value: 'weighted', label: 'Weighted', helper: 'Edge weight = probability that path is taken per conversation.' },
  { value: 'interleave', label: 'Round-robin', helper: 'Downstream agents take turns equally.' },
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
  // --- 1. RAG Knowledge Assistant ---
  {
    id: 'rag-assistant',
    label: 'RAG Knowledge Assistant',
    description: 'Intent classifier routes queries to a RAG specialist (Claude for deep synthesis) or a direct response composer. Typical enterprise knowledge base pattern.',
    conversationsPerMonth: 50000,
    agents: [
      { id: 'ra-router', name: 'Intent Classifier', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 250, outputTokensPerCall: 50, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 85, routingMode: 'weighted' },
      { id: 'ra-rag', name: 'RAG Specialist', model: 'claude-sonnet-4', callsPerConversation: 2, inputTokensPerCall: 800, outputTokensPerCall: 400, ragEnabled: true, ragChunks: 5, ragChunkTokens: 200, ragEmbeddingTokens: 80, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1.2, promptCachePercent: 30, routingMode: 'weighted' },
      { id: 'ra-composer', name: 'Response Composer', model: 'claude-sonnet-4', callsPerConversation: 1, inputTokensPerCall: 1000, outputTokensPerCall: 500, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 20, routingMode: 'weighted' },
    ],
    edges: [
      { id: 'ra-e1', sourceId: 'ra-router', targetId: 'ra-rag', weight: 0.7 },
      { id: 'ra-e2', sourceId: 'ra-router', targetId: 'ra-composer', weight: 0.3 },
      { id: 'ra-e3', sourceId: 'ra-rag', targetId: 'ra-composer', weight: 1.0 },
    ],
  },
  // --- 2. Tool-Calling Agent ---
  {
    id: 'tool-agent',
    label: 'Tool-Calling Agent',
    description: 'Multi-turn coding assistant with iterative tool use (file read/write, shell, search). GPT-4.1 for best structured output. Models real agentic coding sessions.',
    conversationsPerMonth: 15000,
    agents: [
      { id: 'ta-agent', name: 'Coding Agent', model: 'gpt-4.1', callsPerConversation: 5, inputTokensPerCall: 2000, outputTokensPerCall: 800, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 6, mcpOutputTokensPerCall: 300, mcpInputTokensPerCall: 500, historyGrowthFactor: 1.4, promptCachePercent: 30, routingMode: 'weighted' },
    ],
    edges: [],
  },
  // --- 3. E-commerce Support Bot ---
  {
    id: 'ecommerce-support',
    label: 'E-commerce Support Bot',
    description: 'Customer service chatbot handling orders, returns, product questions, and FAQ. Nano router for high-volume triage, specialists per domain.',
    conversationsPerMonth: 200000,
    agents: [
      { id: 'es-triage', name: 'Triage Router', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 300, outputTokensPerCall: 60, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 90, routingMode: 'weighted' },
      { id: 'es-orders', name: 'Order Agent', model: 'gpt-4.1', callsPerConversation: 3, inputTokensPerCall: 600, outputTokensPerCall: 300, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 3, mcpOutputTokensPerCall: 250, mcpInputTokensPerCall: 200, historyGrowthFactor: 1.2, promptCachePercent: 40, routingMode: 'weighted' },
      { id: 'es-returns', name: 'Returns Specialist', model: 'claude-sonnet-4', callsPerConversation: 2, inputTokensPerCall: 800, outputTokensPerCall: 400, ragEnabled: true, ragChunks: 4, ragChunkTokens: 180, ragEmbeddingTokens: 80, mcpCalls: 2, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 150, historyGrowthFactor: 1.1, promptCachePercent: 50, routingMode: 'weighted' },
      { id: 'es-product', name: 'Product Expert', model: 'claude-sonnet-4', callsPerConversation: 2, inputTokensPerCall: 1000, outputTokensPerCall: 600, ragEnabled: true, ragChunks: 5, ragChunkTokens: 200, ragEmbeddingTokens: 80, mcpCalls: 1, mcpOutputTokensPerCall: 150, mcpInputTokensPerCall: 100, historyGrowthFactor: 1.3, promptCachePercent: 30, routingMode: 'weighted' },
      { id: 'es-faq', name: 'FAQ Agent', model: 'gpt-4.1-mini', callsPerConversation: 1, inputTokensPerCall: 400, outputTokensPerCall: 300, ragEnabled: true, ragChunks: 3, ragChunkTokens: 150, ragEmbeddingTokens: 60, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 70, routingMode: 'weighted' },
      { id: 'es-escalation', name: 'Human Handoff', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 500, outputTokensPerCall: 200, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 1, mcpOutputTokensPerCall: 100, mcpInputTokensPerCall: 80, historyGrowthFactor: 1, promptCachePercent: 60, routingMode: 'weighted' },
    ],
    edges: [
      { id: 'es-e1', sourceId: 'es-triage', targetId: 'es-orders', weight: 0.35 },
      { id: 'es-e2', sourceId: 'es-triage', targetId: 'es-returns', weight: 0.20 },
      { id: 'es-e3', sourceId: 'es-triage', targetId: 'es-product', weight: 0.20 },
      { id: 'es-e4', sourceId: 'es-triage', targetId: 'es-faq', weight: 0.25 },
      { id: 'es-e5', sourceId: 'es-returns', targetId: 'es-escalation', weight: 0.30 },
      { id: 'es-e6', sourceId: 'es-orders', targetId: 'es-escalation', weight: 0.10 },
    ],
  },
  // --- 4. Content Moderation Pipeline ---
  {
    id: 'content-moderation',
    label: 'Content Moderation Pipeline',
    description: 'Automated content moderation. Orchestrator fans out to toxicity analysis and policy check. Appeals flow through human review. Notification closes the loop.',
    conversationsPerMonth: 80000,
    agents: [
      { id: 'cm-orch', name: 'Moderation Orchestrator', model: 'gpt-4.1-mini', callsPerConversation: 2, inputTokensPerCall: 600, outputTokensPerCall: 300, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 1, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 150, historyGrowthFactor: 1.2, promptCachePercent: 60, routingMode: 'fanout' },
      { id: 'cm-toxicity', name: 'Toxicity Analyzer', model: 'claude-sonnet-4', callsPerConversation: 1, inputTokensPerCall: 1200, outputTokensPerCall: 600, ragEnabled: true, ragChunks: 6, ragChunkTokens: 200, ragEmbeddingTokens: 100, mcpCalls: 2, mcpOutputTokensPerCall: 300, mcpInputTokensPerCall: 200, historyGrowthFactor: 1, promptCachePercent: 40, routingMode: 'weighted' },
      { id: 'cm-policy', name: 'Policy Checker', model: 'gpt-4.1', callsPerConversation: 3, inputTokensPerCall: 800, outputTokensPerCall: 500, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 5, mcpOutputTokensPerCall: 400, mcpInputTokensPerCall: 250, historyGrowthFactor: 1.3, promptCachePercent: 20, routingMode: 'weighted' },
      { id: 'cm-context', name: 'Context Validator', model: 'claude-sonnet-4', callsPerConversation: 1, inputTokensPerCall: 1500, outputTokensPerCall: 400, ragEnabled: true, ragChunks: 8, ragChunkTokens: 250, ragEmbeddingTokens: 120, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 70, routingMode: 'weighted' },
      { id: 'cm-action', name: 'Action Executor', model: 'gpt-4.1', callsPerConversation: 2, inputTokensPerCall: 900, outputTokensPerCall: 350, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 4, mcpOutputTokensPerCall: 350, mcpInputTokensPerCall: 300, historyGrowthFactor: 1.1, promptCachePercent: 30, routingMode: 'weighted' },
      { id: 'cm-notify', name: 'User Notifier', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 400, outputTokensPerCall: 600, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 3, mcpOutputTokensPerCall: 100, mcpInputTokensPerCall: 80, historyGrowthFactor: 1, promptCachePercent: 70, routingMode: 'weighted' },
      { id: 'cm-appeal', name: 'Appeal Handler', model: 'gpt-4.1-mini', callsPerConversation: 1, inputTokensPerCall: 1000, outputTokensPerCall: 500, ragEnabled: true, ragChunks: 4, ragChunkTokens: 180, ragEmbeddingTokens: 80, mcpCalls: 1, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 100, historyGrowthFactor: 1, promptCachePercent: 40, routingMode: 'weighted' },
    ],
    edges: [
      { id: 'cm-e1', sourceId: 'cm-orch', targetId: 'cm-toxicity', weight: 1.0 },
      { id: 'cm-e2', sourceId: 'cm-orch', targetId: 'cm-policy', weight: 0.95 },
      { id: 'cm-e3', sourceId: 'cm-toxicity', targetId: 'cm-context', weight: 0.85 },
      { id: 'cm-e4', sourceId: 'cm-policy', targetId: 'cm-action', weight: 0.80 },
      { id: 'cm-e5', sourceId: 'cm-context', targetId: 'cm-action', weight: 0.75 },
      { id: 'cm-e6', sourceId: 'cm-action', targetId: 'cm-notify', weight: 0.90 },
      { id: 'cm-e7', sourceId: 'cm-policy', targetId: 'cm-appeal', weight: 0.15 },
      { id: 'cm-e8', sourceId: 'cm-context', targetId: 'cm-appeal', weight: 0.20 },
    ],
  },
  // --- 5. Data Analytics Copilot ---
  {
    id: 'analytics-copilot',
    label: 'Data Analytics Copilot',
    description: 'AI copilot for data analysts. Routes queries to SQL generation, chart creation, statistical analysis, data cleaning, and report writing agents.',
    conversationsPerMonth: 120000,
    agents: [
      { id: 'da-router', name: 'Query Router', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 350, outputTokensPerCall: 80, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 90, routingMode: 'weighted' },
      { id: 'da-sql', name: 'SQL Generator', model: 'gpt-4.1-mini', callsPerConversation: 1, inputTokensPerCall: 400, outputTokensPerCall: 250, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 2, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 150, historyGrowthFactor: 1, promptCachePercent: 50, routingMode: 'weighted' },
      { id: 'da-viz', name: 'Visualization Agent', model: 'gpt-4.1', callsPerConversation: 2, inputTokensPerCall: 700, outputTokensPerCall: 500, ragEnabled: true, ragChunks: 4, ragChunkTokens: 180, ragEmbeddingTokens: 80, mcpCalls: 3, mcpOutputTokensPerCall: 350, mcpInputTokensPerCall: 200, historyGrowthFactor: 1.2, promptCachePercent: 30, routingMode: 'weighted' },
      { id: 'da-stats', name: 'Statistical Analyzer', model: 'gpt-4.1', callsPerConversation: 2, inputTokensPerCall: 600, outputTokensPerCall: 400, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 4, mcpOutputTokensPerCall: 500, mcpInputTokensPerCall: 300, historyGrowthFactor: 1.2, promptCachePercent: 20, routingMode: 'weighted' },
      { id: 'da-clean', name: 'Data Cleaner', model: 'claude-sonnet-4', callsPerConversation: 1, inputTokensPerCall: 900, outputTokensPerCall: 400, ragEnabled: true, ragChunks: 5, ragChunkTokens: 220, ragEmbeddingTokens: 90, mcpCalls: 1, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 150, historyGrowthFactor: 1, promptCachePercent: 45, routingMode: 'weighted' },
      { id: 'da-report', name: 'Report Writer', model: 'gpt-4.1', callsPerConversation: 1, inputTokensPerCall: 800, outputTokensPerCall: 300, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 3, mcpOutputTokensPerCall: 400, mcpInputTokensPerCall: 350, historyGrowthFactor: 1, promptCachePercent: 25, routingMode: 'weighted' },
      { id: 'da-export', name: 'Export & Notify', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 500, outputTokensPerCall: 700, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 2, mcpOutputTokensPerCall: 80, mcpInputTokensPerCall: 60, historyGrowthFactor: 1, promptCachePercent: 75, routingMode: 'weighted' },
    ],
    edges: [
      { id: 'da-e1', sourceId: 'da-router', targetId: 'da-sql', weight: 0.30 },
      { id: 'da-e2', sourceId: 'da-router', targetId: 'da-viz', weight: 0.25 },
      { id: 'da-e3', sourceId: 'da-router', targetId: 'da-stats', weight: 0.30 },
      { id: 'da-e4', sourceId: 'da-router', targetId: 'da-clean', weight: 0.15 },
      { id: 'da-e5', sourceId: 'da-viz', targetId: 'da-report', weight: 0.70 },
      { id: 'da-e6', sourceId: 'da-stats', targetId: 'da-report', weight: 0.75 },
      { id: 'da-e7', sourceId: 'da-clean', targetId: 'da-report', weight: 0.60 },
      { id: 'da-e8', sourceId: 'da-report', targetId: 'da-export', weight: 0.95 },
    ],
  },
]
