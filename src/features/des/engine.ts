/**
 * DES Engine — Discrete Event Simulation for AI Workflows (v2)
 * 
 * Fixes from audit:
 * - P0: Concurrent agent model (pool-based, not single-threaded)
 * - P1: Request completion tracks pending downstream count
 * - P2: MCP/RAG block agent completion (agent_end = LLM + max(MCP, RAG))
 * - P3: Proper burst/spike traffic generation (Poisson-based)
 */

import type { Agent, Edge, WorkspacePricing } from '../topology/types'
import { getEffectivePricing } from '../topology/utils'
import { PRICING_TOKENS_PER_UNIT } from '../topology/config'
import type {
  DESConfig,
  DESEvent,
  DESResult,
  DESSummary,
  QueueState,
  RequestTrace,
} from './types'
import { createRng, sampleTruncatedNormal } from '../forecasting/aeir-utils'

// --- Priority Queue (min-heap by time) ---

class EventQueue {
  private heap: DESEvent[] = []
  push(event: DESEvent): void {
    this.heap.push(event)
    this.bubbleUp(this.heap.length - 1)
  }
  pop(): DESEvent | undefined {
    if (this.heap.length === 0) return undefined
    const top = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length > 0) { this.heap[0] = last; this.sinkDown(0) }
    return top
  }
  get size(): number { return this.heap.length }
  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (this.heap[parent].time <= this.heap[i].time) break
      ;[this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]]
      i = parent
    }
  }
  private sinkDown(i: number): void {
    const n = this.heap.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1, right = 2 * i + 2
      if (left < n && this.heap[left].time < this.heap[smallest].time) smallest = left
      if (right < n && this.heap[right].time < this.heap[smallest].time) smallest = right
      if (smallest === i) break
      ;[this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]]
      i = smallest
    }
  }
}

// --- Traffic Generation (Poisson-based) ---

function generateArrivalTimes(config: DESConfig, rng: () => number): number[] {
  const times: number[] = []

  switch (config.trafficPattern) {
    case 'constant': {
      // Poisson process: inter-arrival = -ln(U) / λ
      let t = 0
      const lambda = config.requestsPerSecond / 1000 // per ms
      for (let i = 0; i < config.numRequests; i++) {
        t += -Math.log(Math.max(rng(), 1e-10)) / lambda
        times.push(t)
      }
      break
    }
    case 'burst': {
      // Repeating pattern: 1s burst at 3× rate, then 4s normal rate
      let t = 0
      for (let i = 0; i < config.numRequests; i++) {
        const cyclePos = t % 5000
        const currentRate = cyclePos < 1000
          ? (config.requestsPerSecond * 3) / 1000
          : config.requestsPerSecond / 1000
        t += -Math.log(Math.max(rng(), 1e-10)) / currentRate
        times.push(t)
      }
      break
    }
    case 'spike': {
      // Normal rate with a 10× spike between 28-35% of total duration
      const totalDuration = (config.numRequests / config.requestsPerSecond) * 1000
      const spikeStart = totalDuration * 0.28
      const spikeEnd = totalDuration * 0.35
      let t = 0
      for (let i = 0; i < config.numRequests; i++) {
        const inSpike = t >= spikeStart && t <= spikeEnd
        const currentRate = inSpike
          ? (config.requestsPerSecond * 10) / 1000
          : config.requestsPerSecond / 1000
        t += -Math.log(Math.max(rng(), 1e-10)) / currentRate
        times.push(t)
      }
      break
    }
  }

  return times
}

// --- Main DES Engine ---

export function runDES(
  agents: Agent[],
  edges: Edge[],
  pricing: WorkspacePricing,
  config: DESConfig,
): DESResult {
  const startWall = performance.now()
  const rng = createRng(config.seed)

  // Build graph adjacency
  const outEdges = new Map<string, Array<{ targetId: string; weight: number }>>()
  for (const e of edges) {
    const arr = outEdges.get(e.sourceId) || []
    arr.push({ targetId: e.targetId, weight: e.weight })
    outEdges.set(e.sourceId, arr)
  }

  // Identify entry agents
  const incomingTargets = new Set(edges.map(e => e.targetId))
  const entryAgents = agents.filter(a => !incomingTargets.has(a.id))
  if (entryAgents.length === 0 && agents.length > 0) entryAgents.push(agents[0])

  // Initialize queue states — pool-based concurrency (not single-threaded)
  const queueStates = new Map<string, QueueState>()
  for (const agent of agents) {
    queueStates.set(agent.id, {
      agentId: agent.id,
      label: agent.name,
      queueDepth: 0,
      maxQueueDepth: 0,
      totalProcessed: 0,
      busyUntil: 0, // Not used for blocking; kept for stats
    })
  }

  // Request state tracking
  const eventQueue = new EventQueue()
  const allEvents: DESEvent[] = []
  const requestTraces = new Map<number, RequestTrace>()
  // Track pending downstream work per request
  const pendingAgents = new Map<number, number>() // requestId → count of in-flight agents
  let eventIdCounter = 0
  let activeRequests = 0

  // Generate arrival times
  const arrivalTimes = generateArrivalTimes(config, rng)

  // Schedule initial request arrivals
  for (let i = 0; i < arrivalTimes.length; i++) {
    eventQueue.push({
      id: eventIdCounter++,
      type: 'REQUEST_RECEIVED',
      time: arrivalTimes[i],
      requestId: i,
      nodeLabel: 'Incoming request',
    })
  }

  // --- Process events ---
  while (eventQueue.size > 0) {
    const event = eventQueue.pop()!
    if (event.time > config.maxSimulationTime) break
    allEvents.push(event)

    switch (event.type) {
      case 'REQUEST_RECEIVED': {
        if (activeRequests >= config.maxConcurrency) {
          // Backpressure: delay and re-enqueue
          eventQueue.push({ ...event, id: eventIdCounter++, time: event.time + 100 })
          break
        }
        activeRequests++
        requestTraces.set(event.requestId, {
          requestId: event.requestId,
          startTime: event.time,
          endTime: 0,
          latency: 0,
          totalTokens: 0,
          totalCost: 0,
          nodesVisited: [],
          failed: false,
          retryCount: 0,
        })
        pendingAgents.set(event.requestId, 0)

        // Schedule entry agents
        for (const entry of entryAgents) {
          incrementPending(event.requestId)
          scheduleAgentStart(event.requestId, entry.id, event.time)
        }
        break
      }

      case 'AGENT_START': {
        const agent = agents.find(a => a.id === event.agentId)
        if (!agent) break

        const qs = queueStates.get(agent.id)!
        qs.queueDepth++
        qs.maxQueueDepth = Math.max(qs.maxQueueDepth, qs.queueDepth)

        // Sample token counts
        const inputTokens = Math.round(sampleTruncatedNormal(rng, agent.inputTokensPerCall, agent.inputTokensPerCall * 0.15, agent.inputTokensPerCall * 0.3, agent.inputTokensPerCall * 2.5))
        const outputTokens = Math.round(sampleTruncatedNormal(rng, agent.outputTokensPerCall, agent.outputTokensPerCall * 0.15, agent.outputTokensPerCall * 0.3, agent.outputTokensPerCall * 2.5))
        const totalTokens = inputTokens + outputTokens

        // LLM latency (output generation + fixed overhead) — per-model speed
        const modelTokSec = pricing.models[agent.model]?.tokensPerSecond ?? config.llmTokensPerSecond
        const llmLatencyMs = (outputTokens / modelTokSec) * 1000 + config.llmOverheadMs

        // MCP latency (parallel calls, take the max)
        let mcpMaxLatency = 0
        if (agent.mcpCalls > 0) {
          for (let mc = 0; mc < agent.mcpCalls; mc++) {
            const mcpLat = config.mcpLatencyMinMs + rng() * (config.mcpLatencyMaxMs - config.mcpLatencyMinMs)
            mcpMaxLatency = Math.max(mcpMaxLatency, mcpLat)
          }
          // Schedule MCP events for visualization
          const mcpStartTime = event.time + llmLatencyMs * 0.3
          for (let mc = 0; mc < agent.mcpCalls; mc++) {
            const lat = config.mcpLatencyMinMs + rng() * (config.mcpLatencyMaxMs - config.mcpLatencyMinMs)
            eventQueue.push({ id: eventIdCounter++, type: 'MCP_CALL_START', time: mcpStartTime, requestId: event.requestId, agentId: agent.id, nodeLabel: `MCP call ${mc + 1}` })
            eventQueue.push({ id: eventIdCounter++, type: 'MCP_CALL_END', time: mcpStartTime + lat, requestId: event.requestId, agentId: agent.id, nodeLabel: `MCP call ${mc + 1}` })
          }
        }

        // RAG latency
        let ragLatency = 0
        if (agent.ragEnabled) {
          ragLatency = config.ragLatencyMinMs + rng() * (config.ragLatencyMaxMs - config.ragLatencyMinMs)
          eventQueue.push({ id: eventIdCounter++, type: 'RAG_QUERY_START', time: event.time + 10, requestId: event.requestId, agentId: agent.id, nodeLabel: `RAG (${agent.ragChunks} chunks)` })
          eventQueue.push({ id: eventIdCounter++, type: 'RAG_QUERY_END', time: event.time + 10 + ragLatency, requestId: event.requestId, agentId: agent.id, nodeLabel: `RAG done` })
        }

        // Total agent latency = LLM time + max(MCP blocking, RAG blocking)
        // MCP and RAG happen in parallel with each other, but both block the agent
        const blockingLatency = Math.max(mcpMaxLatency, ragLatency)
        const agentTotalLatency = llmLatencyMs + blockingLatency

        // Compute cost (with volume/batch discounts)
        const mp = getEffectivePricing(agent.model, pricing)
        const cost = (inputTokens / PRICING_TOKENS_PER_UNIT) * mp.in + (outputTokens / PRICING_TOKENS_PER_UNIT) * mp.out

        // No single-threaded blocking! Agent starts immediately (concurrent pool model).
        const endTime = event.time + agentTotalLatency

        // Update request trace
        const trace = requestTraces.get(event.requestId)
        if (trace) {
          trace.totalTokens += totalTokens
          trace.totalCost += cost
          trace.nodesVisited.push(agent.name)
        }

        // Retry logic
        if (rng() < config.retryProbability) {
          // On retry: add another AGENT_START after delay (don't decrement pending yet)
          incrementPending(event.requestId)
          eventQueue.push({ id: eventIdCounter++, type: 'RETRY_EVENT', time: endTime + config.retryDelayMs, requestId: event.requestId, agentId: agent.id, nodeLabel: `Retry ${agent.name}` })
          if (trace) trace.retryCount++
        }

        // Schedule AGENT_END
        eventQueue.push({ id: eventIdCounter++, type: 'AGENT_END', time: endTime, requestId: event.requestId, agentId: agent.id, nodeLabel: agent.name, tokens: totalTokens, cost })
        break
      }

      case 'AGENT_END': {
        const qs = queueStates.get(event.agentId!)
        if (qs) {
          qs.queueDepth = Math.max(0, qs.queueDepth - 1)
          qs.totalProcessed++
        }

        // Schedule downstream agents based on edges (roll dice once, track results)
        const downstream = outEdges.get(event.agentId!) || []
        let scheduledDownstream = 0
        for (const { targetId, weight } of downstream) {
          if (rng() < weight) {
            incrementPending(event.requestId)
            scheduleAgentStart(event.requestId, targetId, event.time)
            scheduledDownstream++
          }
        }

        // Decrement pending for this agent's completion
        decrementPending(event.requestId, event.time)
        break
      }

      case 'MCP_CALL_START':
      case 'MCP_CALL_END':
      case 'RAG_QUERY_START':
      case 'RAG_QUERY_END':
      case 'RESPONSE_RETURNED':
        // Visualization events only
        break

      case 'RETRY_EVENT': {
        if (event.agentId) {
          scheduleAgentStart(event.requestId, event.agentId, event.time)
        }
        break
      }
    }
  }

  // Complete any unfinished requests
  for (const [, trace] of requestTraces) {
    if (trace.endTime === 0) {
      trace.endTime = config.maxSimulationTime
      trace.latency = trace.endTime - trace.startTime
      trace.failed = true
    }
  }

  // --- Build result ---
  const requests = Array.from(requestTraces.values())
  const completedRequests = requests.filter(r => !r.failed)
  const latencies = completedRequests.map(r => r.latency).sort((a, b) => a - b)

  const summary: DESSummary = {
    totalRequests: config.numRequests,
    completedRequests: completedRequests.length,
    failedRequests: requests.filter(r => r.failed).length,
    latency_p50: percentile(latencies, 0.5),
    latency_p90: percentile(latencies, 0.9),
    latency_p95: percentile(latencies, 0.95),
    latency_p99: percentile(latencies, 0.99),
    latency_avg: latencies.length > 0 ? latencies.reduce((s, v) => s + v, 0) / latencies.length : 0,
    latency_max: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
    totalTokens: requests.reduce((s, r) => s + r.totalTokens, 0),
    totalCost: requests.reduce((s, r) => s + r.totalCost, 0),
    avgTokensPerRequest: requests.length > 0 ? requests.reduce((s, r) => s + r.totalTokens, 0) / requests.length : 0,
    avgCostPerRequest: requests.length > 0 ? requests.reduce((s, r) => s + r.totalCost, 0) / requests.length : 0,
    maxQueueDepth: Math.max(0, ...Array.from(queueStates.values()).map(q => q.maxQueueDepth)),
    avgQueueDepth: Array.from(queueStates.values()).reduce((s, q) => s + q.maxQueueDepth, 0) / Math.max(1, queueStates.size),
    failureRate: requests.length > 0 ? requests.filter(r => r.failed).length / requests.length : 0,
    totalRetries: requests.reduce((s, r) => s + r.retryCount, 0),
    throughputRPS: completedRequests.length > 0 ? completedRequests.length / ((completedRequests[completedRequests.length - 1]?.endTime || 1) / 1000) : 0,
    simulationDurationMs: allEvents.length > 0 ? allEvents[allEvents.length - 1].time : 0,
  }

  return {
    events: allEvents,
    requests,
    queues: Array.from(queueStates.values()),
    summary,
    config,
    executionTimeMs: performance.now() - startWall,
  }

  // --- Helper functions ---

  function scheduleAgentStart(requestId: number, agentId: string, time: number) {
    eventQueue.push({
      id: eventIdCounter++,
      type: 'AGENT_START',
      time: time + 10, // 10ms scheduling overhead
      requestId,
      agentId,
      nodeLabel: agents.find(a => a.id === agentId)?.name || agentId,
    })
  }

  function incrementPending(requestId: number) {
    pendingAgents.set(requestId, (pendingAgents.get(requestId) || 0) + 1)
  }

  function decrementPending(requestId: number, time: number) {
    const count = (pendingAgents.get(requestId) || 1) - 1
    pendingAgents.set(requestId, count)
    if (count <= 0) {
      completeRequest(requestId, time)
    }
  }

  function completeRequest(requestId: number, time: number) {
    const trace = requestTraces.get(requestId)
    if (trace && trace.endTime === 0) {
      trace.endTime = time
      trace.latency = time - trace.startTime
      activeRequests--
      eventQueue.push({ id: eventIdCounter++, type: 'RESPONSE_RETURNED', time, requestId, nodeLabel: 'Response' })
    }
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}
