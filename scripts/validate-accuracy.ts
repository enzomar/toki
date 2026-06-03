/**
 * FinOps Validation Script
 * Validates Toki's cost calculation against manual computation
 * for the Audience Orchestrator sample.
 *
 * Run: npx tsx scripts/validate-accuracy.ts
 */

import { WORKSPACE_SAMPLES, PRICING, PRICING_TOKENS_PER_UNIT } from '../src/features/topology/config'
import { calculateEstimate, computeTrafficShares, createEstimateConfig } from '../src/features/topology/utils'
import type { WorkspacePricing } from '../src/features/topology/types'

const sample = WORKSPACE_SAMPLES.find((s) => s.id === 'audience-orchestrator')!
const pricing: WorkspacePricing = { models: { ...PRICING }, embeddingPricePer1M: 0.02, currency: 'EUR' }
const config = createEstimateConfig(3500, 10, 'month') // 35,000 conversations/month

console.log('=== FinOps Validation: Audience Orchestrator ===\n')
console.log(`Users: ${config.users}`)
console.log(`Conversations/user/month: ${config.conversationsPerUser}`)
console.log(`Total conversations/month: ${config.conversationsPerMonth}`)
console.log(`Model: gpt-4.1 (€${PRICING['gpt-4.1'].in}/1M in, €${PRICING['gpt-4.1'].out}/1M out)\n`)

// --- Manual calculation ---
console.log('--- Manual Calculation ---\n')

const agents = sample.agents
const edges = sample.edges
const convPerMonth = 35000

// Traffic shares (absolute percentages from edges)
const expectedShares: Record<string, number> = {
  'audience-orch': 1.0,       // entry agent
  'audience-definition': 0.10,
  'audience-inspector': 0.50,
  'audience-snapshot': 1.00,
  'audience-recommendation': 0.80,
  'audience-general': 0.50,
}

// Verify traffic shares
const computedShares = computeTrafficShares(agents, edges)
let sharesCorrect = true
for (const [id, expected] of Object.entries(expectedShares)) {
  const actual = computedShares.get(id) ?? 0
  const match = Math.abs(actual - expected) < 0.001
  if (!match) sharesCorrect = false
  console.log(`  ${agents.find(a => a.id === id)?.name}: expected ${(expected * 100).toFixed(0)}%, got ${(actual * 100).toFixed(0)}% ${match ? '✓' : '✗ MISMATCH'}`)
}
console.log(`\nTraffic shares: ${sharesCorrect ? '✓ ALL CORRECT' : '✗ ERRORS FOUND'}\n`)

// Manual cost for each agent
console.log('--- Per-Agent Cost (Manual) ---\n')

const gpt41In = PRICING['gpt-4.1'].in  // 2 EUR/1M
const gpt41Out = PRICING['gpt-4.1'].out // 8 EUR/1M

let totalManualCost = 0
let totalManualTokens = 0

for (const agent of agents) {
  const share = expectedShares[agent.id]
  const effectiveConv = convPerMonth * share
  const calls = effectiveConv * agent.callsPerConversation

  // Input: base + MCP input overhead
  const mcpInputOverhead = agent.mcpCalls * agent.mcpInputTokensPerCall
  const inputPerCall = agent.inputTokensPerCall + mcpInputOverhead
  const inputTokens = calls * inputPerCall

  // Output: base + MCP output overhead
  const mcpOutputOverhead = agent.mcpCalls * agent.mcpOutputTokensPerCall
  const outputPerCall = agent.outputTokensPerCall + mcpOutputOverhead
  const outputTokens = calls * outputPerCall

  const totalTokens = inputTokens + outputTokens
  const cost = (inputTokens / PRICING_TOKENS_PER_UNIT) * gpt41In + (outputTokens / PRICING_TOKENS_PER_UNIT) * gpt41Out

  totalManualCost += cost
  totalManualTokens += totalTokens

  console.log(`  ${agent.name}:`)
  console.log(`    Traffic: ${(share * 100).toFixed(0)}% → ${effectiveConv.toLocaleString()} conv/mo → ${calls.toLocaleString()} calls/mo`)
  console.log(`    Input: ${inputPerCall} tok/call (base ${agent.inputTokensPerCall} + MCP ${mcpInputOverhead}) → ${(inputTokens / 1e6).toFixed(2)}M tok/mo`)
  console.log(`    Output: ${outputPerCall} tok/call (base ${agent.outputTokensPerCall} + MCP ${mcpOutputOverhead}) → ${(outputTokens / 1e6).toFixed(2)}M tok/mo`)
  console.log(`    Cost: €${cost.toFixed(4)}/mo`)
  console.log()
}

console.log(`  TOTAL (manual): €${totalManualCost.toFixed(4)}/mo, ${(totalManualTokens / 1e6).toFixed(2)}M tokens/mo`)
console.log(`  Cost/conversation: €${(totalManualCost / convPerMonth).toFixed(6)}\n`)

// --- Toki calculation ---
console.log('--- Toki Calculation ---\n')

const estimate = calculateEstimate(agents, config, pricing, edges)

console.log(`  Total cost: €${estimate.totalCostPerMonth.toFixed(4)}/mo`)
console.log(`  Total tokens: ${(estimate.totalTokensPerMonth / 1e6).toFixed(2)}M/mo`)
console.log(`  Cost/conversation: €${estimate.costPerConversation.toFixed(6)}`)
console.log(`  Confidence: ${estimate.confidence}`)
console.log(`  Best case: €${estimate.bestCaseCostPerMonth.toFixed(4)}/mo`)
console.log(`  Worst case: €${estimate.worstCaseCostPerMonth.toFixed(4)}/mo\n`)

// --- Comparison ---
console.log('--- Comparison ---\n')

const costDelta = Math.abs(estimate.totalCostPerMonth - totalManualCost)
const tokenDelta = Math.abs(estimate.totalTokensPerMonth - totalManualTokens)
const costMatch = costDelta < 0.01
const tokenMatch = tokenDelta < 1000

console.log(`  Cost delta: €${costDelta.toFixed(6)} ${costMatch ? '✓ MATCH' : '✗ MISMATCH'}`)
console.log(`  Token delta: ${tokenDelta.toFixed(0)} ${tokenMatch ? '✓ MATCH' : '✗ MISMATCH'}`)

if (costMatch && tokenMatch) {
  console.log('\n✓ VALIDATION PASSED — Toki matches manual calculation.\n')
} else {
  console.log('\n✗ VALIDATION FAILED — discrepancy detected.\n')
  console.log('Per-agent breakdown from Toki:')
  for (const a of estimate.agents) {
    console.log(`  ${a.name}: €${a.costPerMonth.toFixed(4)}, ${(a.totalTokensPerMonth / 1e6).toFixed(2)}M tok, ${(a.trafficShare * 100).toFixed(0)}% traffic`)
  }
  process.exit(1)
}
