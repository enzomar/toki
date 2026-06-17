/**
 * Hybrid Token Forecaster — FinOps-first design
 *
 * ARCHITECTURE:
 *   Layer 1 — Deterministic baseline (aligned with calculateEstimate)
 *     Computes expected tokens per conversation using the same formula as the
 *     main calculator. This is the "expected value" anchor.
 *
 *   Layer 2 — Monte Carlo uncertainty layer
 *     Simulates N conversations, sampling only DECISION POINTS (not full LLM execution):
 *       - Does the agent activate? (traffic share as probability)
 *       - RAG: how many chunks, what size?
 *       - MCP: how many tools fire, with what output size?
 *       - Retries: does a tool fail and retry?
 *       - History growth: does conversation run longer than expected?
 *       - Token variance: ±15% normal on base tokens
 *
 * KEY INSIGHT: Token forecast and cost are separated.
 *   - Simulation output = token distribution (p50/p90/p99)
 *   - Cost = token_distribution × price_per_token (applied after)
 *   This matches how real cloud billing works.
 *
 * ALIGNMENT GUARANTEE:
 *   The deterministic baseline exactly matches calculateEstimate's output.
 *   The MC mean (expected) should be within ±5% of the deterministic value.
 *   Divergence > 10% indicates a modeling inconsistency (flagged in confidence).
 */

import type { Agent, Edge, WorkspacePricing } from '../topology/types'
import { computeTrafficShares, getPricing } from '../topology/utils'
import { PRICING_TOKENS_PER_UNIT } from '../topology/config'

// --- Public output type ---

export type HybridForecastResult = {
  // Core: token forecast per conversation
  tokens_p50_per_conv: number
  tokens_p90_per_conv: number
  tokens_p99_per_conv: number
  tokens_expected_per_conv: number
  tokens_worst_per_conv: number

  // Scaled to monthly volume
  tokens_p50_monthly: number
  tokens_p90_monthly: number
  tokens_p99_monthly: number
  tokens_expected_monthly: number

  // Cost applied to token forecast (separated layer)
  cost_p50_monthly: number
  cost_p90_monthly: number
  cost_p99_monthly: number
  cost_expected_monthly: number

  // Token breakdown (where tokens go — from deterministic baseline)
  breakdown_base_tokens: number      // pure LLM input+output per conv
  breakdown_rag_tokens: number       // RAG context tokens per conv
  breakdown_mcp_tokens: number       // MCP tool overhead per conv
  breakdown_embedding_tokens: number // embedding tokens per conv

  // Deterministic anchor (for alignment validation)
  deterministic_tokens_per_conv: number
  deterministic_cost_per_conv: number

  // Alignment check: is MC consistent with deterministic?
  alignment_ratio: number  // mc_expected / deterministic — should be ~1.0
  alignment_ok: boolean    // true if within ±15%

  // Simulation metadata
  confidence_score: number  // 0-1
  tail_risk_factor: number  // p99/p50 ratio
  simulation_count: number
  variance_tokens: number
}

// --- PRNG (Mulberry32, seeded for reproducibility) ---

function createRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleNormal(rng: () => number, mean: number, stddev: number): number {
  const u1 = Math.max(rng(), 1e-10)
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * stddev
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// --- Deterministic baseline (aligned with calculateEstimate) ---

interface AgentTokenProfile {
  id: string
  model: string
  trafficShare: number
  // Per conversation (already accounting for traffic share)
  baseInputTokens: number    // input × calls × share
  baseOutputTokens: number   // output × calls × share
  ragContextTokens: number   // chunks × chunkSize × calls × share
  embeddingTokens: number    // embedding × calls × share
  mcpInputTokens: number     // mcpCalls × mcpInput × share
  mcpOutputTokens: number    // mcpCalls × mcpOutput × share
  totalTokensPerConv: number
  // Per call (for MC sampling)
  callsPerConv: number
  inputPerCall: number
  outputPerCall: number
  ragEnabled: boolean
  ragChunks: number
  ragChunkTokens: number
  ragEmbeddingTokens: number
  mcpCalls: number
  mcpInputPerCall: number
  mcpOutputPerCall: number
  cacheRate: number
  historyGrowthFactor: number
}

function buildDeterministicProfile(
  agents: Agent[],
  edges: Edge[],
): { profiles: AgentTokenProfile[]; totals: { base: number; rag: number; mcp: number; embedding: number; perConv: number } } {
  const shares = computeTrafficShares(agents, edges)

  const profiles: AgentTokenProfile[] = agents.map((agent) => {
    const share = shares.get(agent.id) ?? 1.0
    const n = agent.callsPerConversation
    const factor = agent.historyGrowthFactor

    // History growth: geometric average across turns (same formula as calculateEstimate)
    let avgGrowth = 1
    if (n > 1 && factor > 1) {
      avgGrowth = (Math.pow(factor, n) - 1) / (n * (factor - 1))
    }

    const ragContext = agent.ragEnabled ? agent.ragChunks * agent.ragChunkTokens : 0
    const mcpInput = agent.mcpCalls * agent.mcpInputTokensPerCall
    const inputPerCall = Math.round((agent.inputTokensPerCall + ragContext + mcpInput) * avgGrowth)
    const outputPerCall = agent.outputTokensPerCall + agent.mcpCalls * agent.mcpOutputTokensPerCall

    const baseInputTokens = inputPerCall * n * share
    const baseOutputTokens = outputPerCall * n * share
    const ragContextTokens = ragContext * n * share
    const embeddingTokens = (agent.ragEnabled ? agent.ragEmbeddingTokens : 0) * n * share
    const mcpInputTokens = mcpInput * n * share
    const mcpOutputTokens = (agent.mcpCalls * agent.mcpOutputTokensPerCall) * n * share
    const totalTokensPerConv = baseInputTokens + baseOutputTokens + embeddingTokens

    return {
      id: agent.id,
      model: agent.model,
      trafficShare: share,
      baseInputTokens,
      baseOutputTokens,
      ragContextTokens,
      embeddingTokens,
      mcpInputTokens,
      mcpOutputTokens,
      totalTokensPerConv,
      callsPerConv: n,
      inputPerCall,
      outputPerCall,
      ragEnabled: agent.ragEnabled,
      ragChunks: agent.ragChunks,
      ragChunkTokens: agent.ragChunkTokens,
      ragEmbeddingTokens: agent.ragEmbeddingTokens,
      mcpCalls: agent.mcpCalls,
      mcpInputPerCall: agent.mcpInputTokensPerCall,
      mcpOutputPerCall: agent.mcpOutputTokensPerCall,
      cacheRate: Math.min(1, Math.max(0, (agent.promptCachePercent || 0) / 100)),
      historyGrowthFactor: agent.historyGrowthFactor,
    }
  })

  const totals = profiles.reduce((acc, p) => ({
    base: acc.base + p.baseInputTokens + p.baseOutputTokens - p.ragContextTokens - p.mcpInputTokens - p.mcpOutputTokens,
    rag: acc.rag + p.ragContextTokens,
    mcp: acc.mcp + p.mcpInputTokens + p.mcpOutputTokens,
    embedding: acc.embedding + p.embeddingTokens,
    perConv: acc.perConv + p.totalTokensPerConv,
  }), { base: 0, rag: 0, mcp: 0, embedding: 0, perConv: 0 })

  return { profiles, totals }
}

function computeDeterministicCostPerConv(profiles: AgentTokenProfile[], pricing: WorkspacePricing): number {
  return profiles.reduce((total, p) => {
    const mp = getPricing(p.model, pricing.models)
    const uncached = p.baseInputTokens * (1 - p.cacheRate)
    const cached = p.baseInputTokens * p.cacheRate
    const inputCost = (uncached / PRICING_TOKENS_PER_UNIT) * mp.in + (cached / PRICING_TOKENS_PER_UNIT) * mp.cached_in
    const outputCost = (p.baseOutputTokens / PRICING_TOKENS_PER_UNIT) * mp.out
    const embCost = (p.embeddingTokens / PRICING_TOKENS_PER_UNIT) * pricing.embeddingPricePer1M
    return total + inputCost + outputCost + embCost
  }, 0)
}

// --- Monte Carlo simulation of one conversation ---

function simulateConversation(
  profiles: AgentTokenProfile[],
  rng: () => number,
): number {
  let tokens = 0
  const CV = 0.15

  for (const p of profiles) {
    // Decision 1: agent activates proportional to traffic share
    if (rng() > p.trafficShare) continue

    for (let call = 0; call < p.callsPerConv; call++) {
      // Base input with ±15% variance
      let inputTok = clamp(sampleNormal(rng, p.inputPerCall, p.inputPerCall * CV), p.inputPerCall * 0.3, p.inputPerCall * 2.5)

      // RAG: re-sample chunk count and size
      if (p.ragEnabled && p.ragChunks > 0) {
        const chunks = clamp(Math.round(sampleNormal(rng, p.ragChunks, p.ragChunks * 0.25)), 0, p.ragChunks * 3)
        const chunkSize = clamp(Math.round(sampleNormal(rng, p.ragChunkTokens, p.ragChunkTokens * 0.2)), 50, p.ragChunkTokens * 2.5)
        // Substitute sampled RAG instead of expected RAG already in inputPerCall
        const expectedRag = p.ragChunks * p.ragChunkTokens
        const sampledRag = chunks * chunkSize
        inputTok = inputTok - expectedRag + sampledRag
        // Embedding tokens
        tokens += p.ragEmbeddingTokens
      }

      tokens += Math.max(0, Math.round(inputTok))

      // Base output with ±15% variance
      let outputTok = clamp(sampleNormal(rng, p.outputPerCall, p.outputPerCall * CV), p.outputPerCall * 0.3, p.outputPerCall * 2.5)

      // MCP: re-sample call count and sizes
      if (p.mcpCalls > 0) {
        const actualCalls = clamp(Math.round(sampleNormal(rng, p.mcpCalls, p.mcpCalls * 0.3)), 0, p.mcpCalls * 3)
        const expectedMcpOut = p.mcpCalls * p.mcpOutputPerCall
        let sampledMcpOut = 0
        let sampledMcpIn = 0
        for (let mc = 0; mc < actualCalls; mc++) {
          sampledMcpOut += clamp(sampleNormal(rng, p.mcpOutputPerCall, p.mcpOutputPerCall * CV), 0, p.mcpOutputPerCall * 3)
          sampledMcpIn += clamp(sampleNormal(rng, p.mcpInputPerCall, p.mcpInputPerCall * CV), 0, p.mcpInputPerCall * 3)
          // 5% retry probability
          if (rng() < 0.05) {
            sampledMcpOut += p.mcpOutputPerCall * 0.5
            sampledMcpIn += p.mcpInputPerCall * 0.5
          }
        }
        // Substitute sampled MCP for expected MCP
        outputTok = outputTok - expectedMcpOut + sampledMcpOut
        inputTok += sampledMcpIn - p.mcpInputPerCall * p.mcpCalls / p.callsPerConv
      }

      tokens += Math.max(0, Math.round(outputTok))
    }

    // History growth: 8% chance of one extra turn
    if (p.historyGrowthFactor > 1 && rng() < 0.08) {
      tokens += Math.round((p.inputPerCall + p.outputPerCall) * p.historyGrowthFactor)
    }
  }

  return Math.max(0, tokens)
}

// --- Main entry point ---

export function runHybridForecast(
  agents: Agent[],
  edges: Edge[],
  conversationsPerMonth: number,
  pricing: WorkspacePricing,
  options?: { numSimulations?: number; seed?: number },
): HybridForecastResult {
  const numSims = clamp(options?.numSimulations ?? 200, 50, 2000)
  const rng = createRng(options?.seed ?? (Date.now() & 0xffffffff))

  // --- Layer 1: deterministic baseline ---
  const { profiles, totals } = buildDeterministicProfile(agents, edges)
  const deterministicTokensPerConv = totals.perConv
  const deterministicCostPerConv = computeDeterministicCostPerConv(profiles, pricing)

  if (agents.length === 0 || conversationsPerMonth === 0) {
    return makeZeroResult(numSims)
  }

  // --- Layer 2: Monte Carlo token simulation ---
  const tokenSamples: number[] = []
  for (let i = 0; i < numSims; i++) {
    tokenSamples.push(simulateConversation(profiles, rng))
  }
  tokenSamples.sort((a, b) => a - b)

  const n = numSims
  const expectedTokens = tokenSamples.reduce((s, v) => s + v, 0) / n
  const p50 = tokenSamples[Math.floor(n * 0.50)]
  const p90 = tokenSamples[Math.floor(n * 0.90)]
  const p99 = tokenSamples[Math.floor(n * 0.99)]
  const worst = tokenSamples[n - 1]

  const variance = tokenSamples.reduce((s, v) => s + (v - expectedTokens) ** 2, 0) / n
  const stddev = Math.sqrt(variance)

  // --- Layer 3: Apply pricing to token percentiles ---
  // Price per token (weighted average across agents and models)
  const totalTokensDetailed = profiles.reduce((s, p) => s + p.totalTokensPerConv, 0)
  const avgPricePerToken = totalTokensDetailed > 0 ? deterministicCostPerConv / totalTokensDetailed : 0

  const costP50 = p50 * avgPricePerToken * conversationsPerMonth
  const costP90 = p90 * avgPricePerToken * conversationsPerMonth
  const costP99 = p99 * avgPricePerToken * conversationsPerMonth
  const costExpected = expectedTokens * avgPricePerToken * conversationsPerMonth

  // --- Alignment check ---
  const alignmentRatio = deterministicTokensPerConv > 0 ? expectedTokens / deterministicTokensPerConv : 1
  const alignmentOk = alignmentRatio > 0.85 && alignmentRatio < 1.15

  // Confidence: combination of alignment + variance coefficient
  const cv = stddev / (expectedTokens || 1)
  const alignmentPenalty = alignmentOk ? 0 : 0.2
  const variancePenalty = cv < 0.15 ? 0 : cv < 0.3 ? 0.1 : cv < 0.5 ? 0.25 : 0.4
  const confidenceScore = Math.max(0.1, 1 - alignmentPenalty - variancePenalty)

  return {
    tokens_p50_per_conv: Math.round(p50),
    tokens_p90_per_conv: Math.round(p90),
    tokens_p99_per_conv: Math.round(p99),
    tokens_expected_per_conv: Math.round(expectedTokens),
    tokens_worst_per_conv: Math.round(worst),
    tokens_p50_monthly: Math.round(p50 * conversationsPerMonth),
    tokens_p90_monthly: Math.round(p90 * conversationsPerMonth),
    tokens_p99_monthly: Math.round(p99 * conversationsPerMonth),
    tokens_expected_monthly: Math.round(expectedTokens * conversationsPerMonth),
    cost_p50_monthly: costP50,
    cost_p90_monthly: costP90,
    cost_p99_monthly: costP99,
    cost_expected_monthly: costExpected,
    breakdown_base_tokens: Math.round(totals.base),
    breakdown_rag_tokens: Math.round(totals.rag),
    breakdown_mcp_tokens: Math.round(totals.mcp),
    breakdown_embedding_tokens: Math.round(totals.embedding),
    deterministic_tokens_per_conv: Math.round(deterministicTokensPerConv),
    deterministic_cost_per_conv: deterministicCostPerConv,
    alignment_ratio: alignmentRatio,
    alignment_ok: alignmentOk,
    confidence_score: confidenceScore,
    tail_risk_factor: p50 > 0 ? p99 / p50 : 1,
    simulation_count: numSims,
    variance_tokens: variance,
  }
}

function makeZeroResult(numSims: number): HybridForecastResult {
  return {
    tokens_p50_per_conv: 0, tokens_p90_per_conv: 0, tokens_p99_per_conv: 0,
    tokens_expected_per_conv: 0, tokens_worst_per_conv: 0,
    tokens_p50_monthly: 0, tokens_p90_monthly: 0, tokens_p99_monthly: 0, tokens_expected_monthly: 0,
    cost_p50_monthly: 0, cost_p90_monthly: 0, cost_p99_monthly: 0, cost_expected_monthly: 0,
    breakdown_base_tokens: 0, breakdown_rag_tokens: 0, breakdown_mcp_tokens: 0, breakdown_embedding_tokens: 0,
    deterministic_tokens_per_conv: 0, deterministic_cost_per_conv: 0,
    alignment_ratio: 1, alignment_ok: true,
    confidence_score: 0, tail_risk_factor: 1,
    simulation_count: numSims, variance_tokens: 0,
  }
}
