import type { Agent, RoutingMode, ScenarioState, ScheduleMode } from './types'

type RoutingModeOption = {
  value: RoutingMode
  label: string
  helper: string
}

type ScheduleModeOption = {
  value: ScheduleMode
  label: string
  helper: string
}

export const MODEL_OPTIONS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
]

export const PRICING_TOKENS_PER_UNIT = 1_000_000

export const EMBEDDING_PRICE_PER_1M = 0.02

export const ROUTING_MODE_OPTIONS: RoutingModeOption[] = [
  {
    value: 'fanout',
    label: 'Simple / fan-out',
    helper: 'Send the request to every downstream branch. Traffic grows because all matching branches run.',
  },
  {
    value: 'weighted',
    label: 'Weighted choice',
    helper: 'Send the request to one downstream branch at a time. Edge weights act like a traffic split, so traffic is divided, not multiplied.',
  },
  {
    value: 'interleave',
    label: 'Interleave',
    helper: 'Take turns across downstream branches in rotation. Traffic stays balanced without running every branch.',
  },
]

export const SCHEDULE_MODE_OPTIONS: ScheduleModeOption[] = [
  {
    value: 'closed',
    label: 'Closed model / Thread Group',
    helper: 'Threads and loops determine how many sessions enter the plan.',
  },
  {
    value: 'open',
    label: 'Open model / Throughput',
    helper: 'A target arrival rate drives the plan like a JMeter throughput schedule.',
  },
]

export const DEFAULT_SCENARIO: ScenarioState = {
  iterations: 6,
  maxDepth: 8,
  loadMultiplier: 1,
  virtualUsers: 12,
  rampUpSeconds: 30,
  thinkTimeMs: 1500,
  durationSeconds: 300,
  targetThroughput: 180,
  throughputPeriodSeconds: 60,
  scheduleMode: 'closed',
}

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    model: 'gpt-4o-mini',
    inputTokens: 260,
    outputTokens: 130,
    fixedPromptTokens: 190,
    historyCarryoverTokens: 70,
    ragEnabled: false,
    retrievalMultiplier: 1,
    averageRetrievedChunks: 0,
    averageChunkTokens: 0,
    embeddingTokensPerRetrieval: 0,
    mcpCalls: 0,
    toolMultiplier: 0.15,
    retryProbability: 0.03,
    fallbackProbability: 0,
    fallbackModel: 'gpt-4o-mini',
    routingMode: 'weighted',
  },
  {
    id: 'tool-specialist',
    name: 'Tool Specialist',
    model: 'gpt-4o-mini',
    inputTokens: 520,
    outputTokens: 180,
    fixedPromptTokens: 240,
    historyCarryoverTokens: 120,
    ragEnabled: false,
    retrievalMultiplier: 1,
    averageRetrievedChunks: 0,
    averageChunkTokens: 0,
    embeddingTokensPerRetrieval: 0,
    mcpCalls: 3,
    toolMultiplier: 0.18,
    retryProbability: 0.05,
    fallbackProbability: 0.02,
    fallbackModel: 'gpt-4o-mini',
    routingMode: 'fanout',
  },
  {
    id: 'knowledge-rag',
    name: 'Knowledge RAG Specialist',
    model: 'claude-3-5-sonnet',
    inputTokens: 680,
    outputTokens: 240,
    fixedPromptTokens: 260,
    historyCarryoverTokens: 120,
    ragEnabled: true,
    retrievalMultiplier: 1.6,
    averageRetrievedChunks: 5,
    averageChunkTokens: 170,
    embeddingTokensPerRetrieval: 120,
    mcpCalls: 0,
    toolMultiplier: 0.15,
    retryProbability: 0.08,
    fallbackProbability: 0.04,
    fallbackModel: 'gpt-4o-mini',
    routingMode: 'fanout',
  },
  {
    id: 'llm-specialist',
    name: 'Pure LLM Specialist',
    model: 'gpt-4o',
    inputTokens: 740,
    outputTokens: 280,
    fixedPromptTokens: 230,
    historyCarryoverTokens: 110,
    ragEnabled: false,
    retrievalMultiplier: 1,
    averageRetrievedChunks: 0,
    averageChunkTokens: 0,
    embeddingTokensPerRetrieval: 0,
    mcpCalls: 0,
    toolMultiplier: 0.1,
    retryProbability: 0.04,
    fallbackProbability: 0.01,
    fallbackModel: 'gpt-4o-mini',
    routingMode: 'fanout',
  },
  {
    id: 'response-composer',
    name: 'Response Composer',
    model: 'gpt-4o',
    inputTokens: 980,
    outputTokens: 760,
    fixedPromptTokens: 280,
    historyCarryoverTokens: 190,
    ragEnabled: false,
    retrievalMultiplier: 1,
    averageRetrievedChunks: 0,
    averageChunkTokens: 0,
    embeddingTokensPerRetrieval: 0,
    mcpCalls: 0,
    toolMultiplier: 0.12,
    retryProbability: 0.03,
    fallbackProbability: 0.02,
    fallbackModel: 'gpt-4o-mini',
    routingMode: 'fanout',
  },
]

export const DEFAULT_EDGES = [
  { id: 'edge-1', sourceId: 'orchestrator', targetId: 'tool-specialist', weight: 0.35 },
  { id: 'edge-2', sourceId: 'orchestrator', targetId: 'knowledge-rag', weight: 0.4 },
  { id: 'edge-3', sourceId: 'orchestrator', targetId: 'llm-specialist', weight: 0.25 },
  { id: 'edge-4', sourceId: 'tool-specialist', targetId: 'response-composer', weight: 1 },
  { id: 'edge-5', sourceId: 'knowledge-rag', targetId: 'response-composer', weight: 1 },
  { id: 'edge-6', sourceId: 'llm-specialist', targetId: 'response-composer', weight: 1 },
]

export const PRICING: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'claude-3-5-sonnet': { in: 3, out: 15 },
}