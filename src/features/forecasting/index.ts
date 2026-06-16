/**
 * Toki Forecasting Engine — AEIR-First Architecture
 *
 * This module provides the unified AEIR-first token forecasting system.
 * All inputs are compiled to AEIR graphs, and all execution operates on AEIR.
 *
 * AEIR (Agent Execution Intermediate Representation) is the ONLY internal data model.
 *
 * Architecture:
 *   INPUT (Agent/Edge topology) → AEIR COMPILER → AEIR GRAPH → AEIR ENGINE → OUTPUT
 *
 * Core concepts:
 * - AEIR Graph: Universal IR for agentic systems (agents, tools, RAG, routing, composition)
 * - AEIR Compiler: Transforms legacy Agent/Edge topology into AEIR (<10ms)
 * - AEIR Engine: Unified execution with deterministic + Monte Carlo layers
 * - Token distributions: All nodes have probabilistic token parameters
 * - Hierarchical graphs: CompositeNode supports nested subgraphs
 * - External schema: Maintains backward compatibility (tokens_p50_per_conv, cost_p50_monthly)
 *
 * Usage:
 *   import { runAEIRForecast } from './features/forecasting'
 *
 *   const result = runAEIRForecast(agents, edges, conversationsPerMonth, pricing, {
 *     numSimulations: 200,
 *     seed: 42,
 *   })
 *
 *   console.log(result.tokens_p50_per_conv)
 *   console.log(result.tokens_p90_per_conv)
 *   console.log(result.cost_expected_monthly)
 */

// --- AEIR-First API ---

export {
  runAEIRForecast,
  runAEIRGraphForecast,
  runRawAEIRSimulation,
  compileToAEIR,
  clearCompilationCache,
  getCompilationCacheStats,
} from './aeir'

export type {
  AEIRGraph,
  AEIRNode,
  AEIREdge,
  AgentNode,
  ToolNode,
  RAGNode,
  RouterNode,
  CompositeNode,
  AEIRExecutionContext,
  AEIRSimulationResult,
  ExternalForecastResult,
  TokenDistribution as AEIRTokenDistribution,
  AEIRForecastOptions,
} from './aeir'