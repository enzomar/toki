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
  // --- 3. Call Center AI Chatbot ---
  {
    id: 'call-center',
    label: 'Call Center AI Chatbot',
    description: 'Customer service chatbot handling inquiries across booking, loyalty, complaints, and general FAQ. Nano router for high-volume triage, specialists per domain.',
    conversationsPerMonth: 200000,
    agents: [
      { id: 'cc-triage', name: 'Triage Router', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 300, outputTokensPerCall: 60, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 90, routingMode: 'weighted' },
      { id: 'cc-booking', name: 'Booking Agent', model: 'gpt-4.1', callsPerConversation: 3, inputTokensPerCall: 600, outputTokensPerCall: 300, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 3, mcpOutputTokensPerCall: 250, mcpInputTokensPerCall: 200, historyGrowthFactor: 1.2, promptCachePercent: 40, routingMode: 'weighted' },
      { id: 'cc-loyalty', name: 'Loyalty Specialist', model: 'claude-sonnet-4', callsPerConversation: 2, inputTokensPerCall: 800, outputTokensPerCall: 400, ragEnabled: true, ragChunks: 4, ragChunkTokens: 180, ragEmbeddingTokens: 80, mcpCalls: 2, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 150, historyGrowthFactor: 1.1, promptCachePercent: 50, routingMode: 'weighted' },
      { id: 'cc-complaints', name: 'Complaints Handler', model: 'claude-sonnet-4', callsPerConversation: 3, inputTokensPerCall: 1000, outputTokensPerCall: 600, ragEnabled: true, ragChunks: 3, ragChunkTokens: 200, ragEmbeddingTokens: 80, mcpCalls: 1, mcpOutputTokensPerCall: 150, mcpInputTokensPerCall: 100, historyGrowthFactor: 1.3, promptCachePercent: 30, routingMode: 'weighted' },
      { id: 'cc-faq', name: 'FAQ Agent', model: 'gpt-4.1-mini', callsPerConversation: 1, inputTokensPerCall: 400, outputTokensPerCall: 300, ragEnabled: true, ragChunks: 3, ragChunkTokens: 150, ragEmbeddingTokens: 60, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 70, routingMode: 'weighted' },
      { id: 'cc-escalation', name: 'Human Handoff', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 500, outputTokensPerCall: 200, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 1, mcpOutputTokensPerCall: 100, mcpInputTokensPerCall: 80, historyGrowthFactor: 1, promptCachePercent: 60, routingMode: 'weighted' },
    ],
    edges: [
      { id: 'cc-e1', sourceId: 'cc-triage', targetId: 'cc-booking', weight: 0.35 },
      { id: 'cc-e2', sourceId: 'cc-triage', targetId: 'cc-loyalty', weight: 0.20 },
      { id: 'cc-e3', sourceId: 'cc-triage', targetId: 'cc-complaints', weight: 0.15 },
      { id: 'cc-e4', sourceId: 'cc-triage', targetId: 'cc-faq', weight: 0.25 },
      { id: 'cc-e5', sourceId: 'cc-complaints', targetId: 'cc-escalation', weight: 0.30 },
      { id: 'cc-e6', sourceId: 'cc-booking', targetId: 'cc-escalation', weight: 0.10 },
    ],
  },
  // --- 4. Travel Disruption Rebooking ---
  {
    id: 'travel-rebooking',
    label: 'Travel Disruption Rebooking',
    description: 'Autonomous rebooking for flight disruptions. Orchestrator fans out to impact assessment and flight search. Policy validation gates the rebooking. Notification closes the loop.',
    conversationsPerMonth: 80000,
    agents: [
      { id: 'tr-orch', name: 'Disruption Orchestrator', model: 'gpt-4.1-mini', callsPerConversation: 2, inputTokensPerCall: 600, outputTokensPerCall: 300, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 1, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 150, historyGrowthFactor: 1.2, promptCachePercent: 60, routingMode: 'fanout' },
      { id: 'tr-impact', name: 'Impact Assessor', model: 'claude-sonnet-4', callsPerConversation: 1, inputTokensPerCall: 1200, outputTokensPerCall: 600, ragEnabled: true, ragChunks: 6, ragChunkTokens: 200, ragEmbeddingTokens: 100, mcpCalls: 2, mcpOutputTokensPerCall: 300, mcpInputTokensPerCall: 200, historyGrowthFactor: 1, promptCachePercent: 40, routingMode: 'weighted' },
      { id: 'tr-search', name: 'Flight Search', model: 'gpt-4.1', callsPerConversation: 3, inputTokensPerCall: 800, outputTokensPerCall: 500, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 5, mcpOutputTokensPerCall: 400, mcpInputTokensPerCall: 250, historyGrowthFactor: 1.3, promptCachePercent: 20, routingMode: 'weighted' },
      { id: 'tr-policy', name: 'Policy Validator', model: 'claude-sonnet-4', callsPerConversation: 1, inputTokensPerCall: 1500, outputTokensPerCall: 400, ragEnabled: true, ragChunks: 8, ragChunkTokens: 250, ragEmbeddingTokens: 120, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 70, routingMode: 'weighted' },
      { id: 'tr-rebook', name: 'Rebooking Executor', model: 'gpt-4.1', callsPerConversation: 2, inputTokensPerCall: 900, outputTokensPerCall: 350, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 4, mcpOutputTokensPerCall: 350, mcpInputTokensPerCall: 300, historyGrowthFactor: 1.1, promptCachePercent: 30, routingMode: 'weighted' },
      { id: 'tr-notify', name: 'Passenger Notifier', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 400, outputTokensPerCall: 600, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 3, mcpOutputTokensPerCall: 100, mcpInputTokensPerCall: 80, historyGrowthFactor: 1, promptCachePercent: 70, routingMode: 'weighted' },
      { id: 'tr-escalate', name: 'Human Escalation', model: 'gpt-4.1-mini', callsPerConversation: 1, inputTokensPerCall: 1000, outputTokensPerCall: 500, ragEnabled: true, ragChunks: 4, ragChunkTokens: 180, ragEmbeddingTokens: 80, mcpCalls: 1, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 100, historyGrowthFactor: 1, promptCachePercent: 40, routingMode: 'weighted' },
    ],
    edges: [
      { id: 'tr-e1', sourceId: 'tr-orch', targetId: 'tr-impact', weight: 1.0 },
      { id: 'tr-e2', sourceId: 'tr-orch', targetId: 'tr-search', weight: 0.95 },
      { id: 'tr-e3', sourceId: 'tr-impact', targetId: 'tr-policy', weight: 0.85 },
      { id: 'tr-e4', sourceId: 'tr-search', targetId: 'tr-rebook', weight: 0.80 },
      { id: 'tr-e5', sourceId: 'tr-policy', targetId: 'tr-rebook', weight: 0.75 },
      { id: 'tr-e6', sourceId: 'tr-rebook', targetId: 'tr-notify', weight: 0.90 },
      { id: 'tr-e7', sourceId: 'tr-search', targetId: 'tr-escalate', weight: 0.15 },
      { id: 'tr-e8', sourceId: 'tr-policy', targetId: 'tr-escalate', weight: 0.20 },
    ],
  },
  // --- 5. Loyalty & Hotel Booking System ---
  {
    id: 'loyalty-booking',
    label: 'Loyalty & Hotel Booking',
    description: 'Airline/hotel loyalty program assistant. Handles points balance, tier status, redemption search, hotel booking with availability checks, and upgrade eligibility via GDS APIs.',
    conversationsPerMonth: 120000,
    agents: [
      { id: 'lb-router', name: 'Loyalty Router', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 350, outputTokensPerCall: 80, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 0, mcpOutputTokensPerCall: 0, mcpInputTokensPerCall: 0, historyGrowthFactor: 1, promptCachePercent: 90, routingMode: 'weighted' },
      { id: 'lb-balance', name: 'Points & Status', model: 'gpt-4.1-mini', callsPerConversation: 1, inputTokensPerCall: 400, outputTokensPerCall: 250, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 2, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 150, historyGrowthFactor: 1, promptCachePercent: 50, routingMode: 'weighted' },
      { id: 'lb-redeem', name: 'Redemption Search', model: 'gpt-4.1', callsPerConversation: 2, inputTokensPerCall: 700, outputTokensPerCall: 500, ragEnabled: true, ragChunks: 4, ragChunkTokens: 180, ragEmbeddingTokens: 80, mcpCalls: 3, mcpOutputTokensPerCall: 350, mcpInputTokensPerCall: 200, historyGrowthFactor: 1.2, promptCachePercent: 30, routingMode: 'weighted' },
      { id: 'lb-hotel', name: 'Hotel Availability', model: 'gpt-4.1', callsPerConversation: 2, inputTokensPerCall: 600, outputTokensPerCall: 400, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 4, mcpOutputTokensPerCall: 500, mcpInputTokensPerCall: 300, historyGrowthFactor: 1.2, promptCachePercent: 20, routingMode: 'weighted' },
      { id: 'lb-upgrade', name: 'Upgrade Evaluator', model: 'claude-sonnet-4', callsPerConversation: 1, inputTokensPerCall: 900, outputTokensPerCall: 400, ragEnabled: true, ragChunks: 5, ragChunkTokens: 220, ragEmbeddingTokens: 90, mcpCalls: 1, mcpOutputTokensPerCall: 200, mcpInputTokensPerCall: 150, historyGrowthFactor: 1, promptCachePercent: 45, routingMode: 'weighted' },
      { id: 'lb-book', name: 'Booking Executor', model: 'gpt-4.1', callsPerConversation: 1, inputTokensPerCall: 800, outputTokensPerCall: 300, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 3, mcpOutputTokensPerCall: 400, mcpInputTokensPerCall: 350, historyGrowthFactor: 1, promptCachePercent: 25, routingMode: 'weighted' },
      { id: 'lb-confirm', name: 'Confirmation & Email', model: 'gpt-4.1-nano', callsPerConversation: 1, inputTokensPerCall: 500, outputTokensPerCall: 700, ragEnabled: false, ragChunks: 0, ragChunkTokens: 0, ragEmbeddingTokens: 0, mcpCalls: 2, mcpOutputTokensPerCall: 80, mcpInputTokensPerCall: 60, historyGrowthFactor: 1, promptCachePercent: 75, routingMode: 'weighted' },
    ],
    edges: [
      { id: 'lb-e1', sourceId: 'lb-router', targetId: 'lb-balance', weight: 0.30 },
      { id: 'lb-e2', sourceId: 'lb-router', targetId: 'lb-redeem', weight: 0.25 },
      { id: 'lb-e3', sourceId: 'lb-router', targetId: 'lb-hotel', weight: 0.30 },
      { id: 'lb-e4', sourceId: 'lb-router', targetId: 'lb-upgrade', weight: 0.15 },
      { id: 'lb-e5', sourceId: 'lb-redeem', targetId: 'lb-book', weight: 0.70 },
      { id: 'lb-e6', sourceId: 'lb-hotel', targetId: 'lb-book', weight: 0.75 },
      { id: 'lb-e7', sourceId: 'lb-upgrade', targetId: 'lb-book', weight: 0.60 },
      { id: 'lb-e8', sourceId: 'lb-book', targetId: 'lb-confirm', weight: 0.95 },
    ],
  },
]
