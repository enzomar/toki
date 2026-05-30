import { DEFAULT_SCENARIO } from '../src/features/topology/config'
import type { Agent, Edge, SimulationReport } from '../src/features/topology/types'
import {
  compareForecastToTrace,
  createDefaultQuickEstimate,
  createDefaultWorkspacePricing,
  createTopologyDocument,
  getAgentVisitForecast,
  getNextTransitions,
  getPlannedStartsPerEntry,
  normalizeTraceReport,
  parseTopologyDocument,
} from '../src/features/topology/utils'

function assertClose(name: string, actual: number, expected: number, tolerance = 1e-9) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`)
  }
}

function assertEqual<T>(name: string, actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function createAgent(overrides: Partial<Agent>): Agent {
  return {
    id: overrides.id ?? 'agent-a',
    name: overrides.name ?? 'Agent A',
    model: overrides.model ?? 'gpt-4o-mini',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 50,
    fixedPromptTokens: overrides.fixedPromptTokens ?? 0,
    historyCarryoverTokens: overrides.historyCarryoverTokens ?? 0,
    ragEnabled: overrides.ragEnabled ?? false,
    retrievalMultiplier: overrides.retrievalMultiplier ?? 1,
    averageRetrievedChunks: overrides.averageRetrievedChunks ?? 0,
    averageChunkTokens: overrides.averageChunkTokens ?? 0,
    embeddingTokensPerRetrieval: overrides.embeddingTokensPerRetrieval ?? 0,
    mcpCalls: overrides.mcpCalls ?? 0,
    toolMultiplier: overrides.toolMultiplier ?? 0.15,
    retryProbability: overrides.retryProbability ?? 0,
    fallbackProbability: overrides.fallbackProbability ?? 0,
    fallbackModel: overrides.fallbackModel ?? 'gpt-4o-mini',
    routingMode: overrides.routingMode ?? 'fanout',
  }
}

function simulateVisits(agents: Agent[], edges: Edge[], startsPerEntry: number, maxDepth: number) {
  const queue: Array<{ current: string; visits: number; depth: number }> = [{ current: agents[0].id, visits: startsPerEntry, depth: 0 }]
  const totals = new Map<string, number>()

  while (queue.length > 0) {
    const next = queue.shift()
    if (!next || next.depth > maxDepth) {
      continue
    }

    totals.set(next.current, (totals.get(next.current) ?? 0) + next.visits)
    const agent = agents.find((candidate) => candidate.id === next.current)
    if (!agent) {
      continue
    }

    const outgoingEdges = edges.filter((edge) => edge.sourceId === agent.id)
    getNextTransitions(agent, outgoingEdges, next.visits).forEach((transition) => {
      queue.push({
        current: transition.targetId,
        visits: transition.visits,
        depth: next.depth + 1,
      })
    })
  }

  return totals
}

function runValidation() {
  const baseAgent = createAgent({ fixedPromptTokens: 20, historyCarryoverTokens: 10 })
  const baseForecast = getAgentVisitForecast(baseAgent, 1, 10)
  assertEqual('Base expected attempts', baseForecast.expectedAttempts, 10)
  assertEqual('Base input tokens', baseForecast.inputTokens, 1300)
  assertEqual('Base output tokens', baseForecast.outputTokens, 500)
  assertEqual('Base embedding tokens', baseForecast.embeddingTokens, 0)
  assertEqual('Base total tokens', baseForecast.tokens, 1800)
  assertClose('Base cost', baseForecast.cost, 0.495)

  const ragAgent = createAgent({
    outputTokens: 60,
    fixedPromptTokens: 20,
    historyCarryoverTokens: 10,
    ragEnabled: true,
    retrievalMultiplier: 1.5,
    averageRetrievedChunks: 2,
    averageChunkTokens: 50,
    embeddingTokensPerRetrieval: 40,
    mcpCalls: 1,
    toolMultiplier: 0.5,
  })
  const ragForecast = getAgentVisitForecast(ragAgent, 1, 1)
  assertEqual('RAG input tokens', ragForecast.inputTokens, 280)
  assertEqual('RAG output tokens', ragForecast.outputTokens, 90)
  assertEqual('RAG embedding tokens', ragForecast.embeddingTokens, 40)
  assertEqual('RAG retrieved context tokens', ragForecast.retrievedContextTokens, 150)
  assertEqual('RAG total tokens', ragForecast.tokens, 410)
  assertClose('RAG cost', ragForecast.cost, 0.0968)

  const resilientAgent = createAgent({
    inputTokens: 50,
    outputTokens: 20,
    fixedPromptTokens: 10,
    retryProbability: 0.1,
    fallbackProbability: 0.2,
    fallbackModel: 'gpt-4o',
  })
  const resilientForecast = getAgentVisitForecast(resilientAgent, 1, 10)
  assertEqual('Retry/fallback expected attempts', resilientForecast.expectedAttempts, 13)
  assertEqual('Retry/fallback input tokens', resilientForecast.inputTokens, 780)
  assertEqual('Retry/fallback output tokens', resilientForecast.outputTokens, 260)
  assertEqual('Retry/fallback total tokens', resilientForecast.tokens, 1040)
  assertClose('Retry/fallback cost', resilientForecast.cost, 0.931)

  const fanoutAgent = createAgent({ routingMode: 'fanout' })
  const weightedAgent = createAgent({ routingMode: 'weighted' })
  const interleaveAgent = createAgent({ routingMode: 'interleave' })
  const edges: Edge[] = [
    { id: 'edge-a', sourceId: 'agent-a', targetId: 'agent-b', weight: 1 },
    { id: 'edge-b', sourceId: 'agent-a', targetId: 'agent-c', weight: 3 },
  ]
  const fanout = getNextTransitions(fanoutAgent, edges, 8)
  assertEqual('Fanout branch A visits', fanout[0].visits, 8)
  assertEqual('Fanout branch B visits', fanout[1].visits, 24)
  const weighted = getNextTransitions(weightedAgent, edges, 8)
  assertEqual('Weighted branch A visits', weighted[0].visits, 2)
  assertEqual('Weighted branch B visits', weighted[1].visits, 6)
  const interleave = getNextTransitions(interleaveAgent, edges, 8)
  assertEqual('Interleave branch A visits', interleave[0].visits, 4)
  assertEqual('Interleave branch B visits', interleave[1].visits, 4)

  const closedScenario = { ...DEFAULT_SCENARIO, scheduleMode: 'closed' as const, virtualUsers: 2, iterations: 3 }
  const openScenario = { ...DEFAULT_SCENARIO, scheduleMode: 'open' as const, targetThroughput: 120, throughputPeriodSeconds: 60, durationSeconds: 300 }
  assertEqual('Closed starts per entry', getPlannedStartsPerEntry(closedScenario), 6)
  assertEqual('Open starts per entry', getPlannedStartsPerEntry(openScenario), 600)

  const depthAgents = [
    createAgent({ id: 'agent-a', name: 'A', routingMode: 'fanout' }),
    createAgent({ id: 'agent-b', name: 'B', routingMode: 'fanout' }),
    createAgent({ id: 'agent-c', name: 'C', routingMode: 'fanout' }),
  ]
  const depthEdges: Edge[] = [
    { id: 'edge-1', sourceId: 'agent-a', targetId: 'agent-b', weight: 1 },
    { id: 'edge-2', sourceId: 'agent-b', targetId: 'agent-c', weight: 1 },
  ]
  const depthVisits = simulateVisits(depthAgents, depthEdges, 5, 1)
  assertEqual('Depth root visits', depthVisits.get('agent-a') ?? 0, 5)
  assertEqual('Depth child visits', depthVisits.get('agent-b') ?? 0, 5)
  assertEqual('Depth grandchild visits blocked', depthVisits.get('agent-c') ?? 0, 0)

  const trace = normalizeTraceReport(
    {
      importedAt: '2026-05-29T00:00:00.000Z',
      events: [
        { agent: 'Agent A', visits: 2, inputTokens: 100, outputTokens: 50, embeddingTokens: 10, cost: 0.12 },
        { agent: 'Agent A', visits: 1, inputTokens: 30, outputTokens: 20, embeddingTokens: 0, cost: 0.04 },
        { agent: 'agent-b', visits: 4, inputTokens: 80, outputTokens: 20, embeddingTokens: 0, cost: 0.08 },
      ],
    },
    [createAgent({ id: 'agent-a', name: 'Agent A' }), createAgent({ id: 'agent-b', name: 'Agent B' })],
  )
  assertEqual('Trace total visits', trace.totalVisits, 7)
  assertEqual('Trace total tokens', trace.totalTokens, 310)
  assertClose('Trace total cost', trace.totalCost, 0.24)

  const report: SimulationReport = {
    totalTokens: 280,
    totalCost: 0.2,
    totalInputTokens: 180,
    totalOutputTokens: 90,
    totalEmbeddingTokens: 10,
    totalRetrievedContextTokens: 60,
    plannedStarts: 3,
    plannedDurationSeconds: 60,
    throughputPerMinute: 3,
    summary: [
      {
        id: 'agent-a',
        name: 'Agent A',
        model: 'gpt-4o-mini',
        visits: 3,
        expectedAttempts: 3,
        inputTokens: 130,
        outputTokens: 70,
        embeddingTokens: 10,
        retrievedContextTokens: 60,
        tokens: 210,
        cost: 0.14,
        retryCost: 0,
        fallbackCost: 0,
        avgTokensPerVisit: 70,
      },
      {
        id: 'agent-b',
        name: 'Agent B',
        model: 'gpt-4o-mini',
        visits: 2,
        expectedAttempts: 2,
        inputTokens: 50,
        outputTokens: 20,
        embeddingTokens: 0,
        retrievedContextTokens: 0,
        tokens: 70,
        cost: 0.06,
        retryCost: 0,
        fallbackCost: 0,
        avgTokensPerVisit: 35,
      },
    ],
  }
  const comparison = compareForecastToTrace(report, trace)
  assertEqual('Comparison rows', comparison.rows.length, 2)
  assertEqual('Comparison total actual tokens', comparison.totalActualTokens, 310)
  assertEqual('Comparison total forecast tokens', comparison.totalForecastTokens, 280)
  assertEqual('Comparison total token delta', comparison.totalTokenDelta, 30)
  assertClose('Comparison total cost delta', comparison.totalCostDelta, 0.04)

  const customWorkspacePricing = createDefaultWorkspacePricing()
  customWorkspacePricing.models['gpt-4o-mini'] = { in: 1, out: 2 }
  customWorkspacePricing.embeddingPricePer1K = 0.5
  const customPricingForecast = getAgentVisitForecast(baseAgent, 1, 1, customWorkspacePricing.models, customWorkspacePricing.embeddingPricePer1K)
  assertClose('Custom pricing override cost', customPricingForecast.cost, 0.23)

  const quickEstimate = createDefaultQuickEstimate()
  quickEstimate.monthlyVolume = 4321
  quickEstimate.modelMix['gpt-4o-mini'] = 60
  quickEstimate.modelMix['gpt-4o'] = 40
  quickEstimate.modelMix['Custom Model X'] = 5
  const workspaceDocument = createTopologyDocument(
    [createAgent({ id: 'agent-a', name: 'Agent A' }), createAgent({ id: 'agent-b', name: 'Agent B', model: 'gpt-4o' })],
    [{ id: 'edge-1', sourceId: 'agent-a', targetId: 'agent-b', weight: 1.5 }],
    { ...DEFAULT_SCENARIO, loadMultiplier: 1.75, maxDepth: 12 },
    {
      models: {
        ...customWorkspacePricing.models,
        'Custom Model X': { in: 0.9, out: 1.8 },
        'gpt-4o': { in: 4.2, out: 12.8 },
      },
      embeddingPricePer1K: 0.17,
    },
    quickEstimate,
  )
  const roundTrip = parseTopologyDocument(workspaceDocument)
  assertEqual('Roundtrip agent count', roundTrip.agents.length, 2)
  assertEqual('Roundtrip edge count', roundTrip.edges.length, 1)
  assertClose('Roundtrip scenario load multiplier', roundTrip.scenario.loadMultiplier, 1.75)
  assertEqual('Roundtrip scenario max depth', roundTrip.scenario.maxDepth, 12)
  assertClose('Roundtrip mini input pricing', roundTrip.pricing.models['gpt-4o-mini'].in, 1)
  assertClose('Roundtrip custom model input pricing', roundTrip.pricing.models['Custom Model X'].in, 0.9)
  assertClose('Roundtrip gpt-4o output pricing', roundTrip.pricing.models['gpt-4o'].out, 12.8)
  assertClose('Roundtrip embedding price', roundTrip.pricing.embeddingPricePer1K, 0.17)
  assertEqual('Roundtrip quick estimate volume', roundTrip.quickEstimate.monthlyVolume, 4321)
  assertEqual('Roundtrip quick estimate custom mix', roundTrip.quickEstimate.modelMix['Custom Model X'], 5)
  assertEqual('Roundtrip quick estimate mini mix', roundTrip.quickEstimate.modelMix['gpt-4o-mini'], 60)

  console.log('Accuracy sanity checks passed.')
  console.log('Validated deterministic cases: base token math, RAG overhead, retry/fallback cost, routing, schedule starts, depth limiting, trace comparison, custom workspace pricing, and workspace import/export round-trip.')
}

runValidation()