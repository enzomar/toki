/**
 * AEIR-First Forecasting API
 * 
 * This is the UNIFIED entry point for all token forecasting.
 * Replaces hybrid.ts and montecarlo.ts with a single AEIR-first implementation.
 * 
 * Architecture:
 *   INPUT (Agent/Edge topology)
 *        ↓
 *   AEIR COMPILER (mandatory)
 *        ↓
 *   AEIR GRAPH (canonical IR)
 *        ↓
 *   AEIR ENGINE (deterministic + Monte Carlo)
 *        ↓
 *   OUTPUT (external schema)
 */

import type { Agent, Edge, WorkspacePricing } from '../topology/types'
import type {
  AEIRGraph,
  AEIRExecutionContext,
  AEIRSimulationResult,
  ExternalForecastResult,
} from './aeir-types'
import type { AEIRSimConfig } from './aeir-config'
import { compileToAEIR } from './aeir-compiler'
import { runAEIRSimulation, toExternalSchema } from './aeir-engine'

// --- Main API ---

export type AEIRForecastOptions = {
  /** Number of Monte Carlo simulations (50-500) */
  numSimulations?: number
  /** Random seed for reproducibility */
  seed?: number
  /** Use compilation cache */
  useCache?: boolean
  /** Graph metadata */
  graphName?: string
  graphDescription?: string
  /** Simulation configuration (tunable factors) */
  simConfig?: AEIRSimConfig
}

/**
 * Run AEIR-first token forecast.
 * 
 * This is the primary API for token forecasting.
 * Compiles Agent/Edge topology to AEIR, then simulates.
 * 
 * @param agents - Legacy agent topology
 * @param edges - Legacy edge topology
 * @param conversationsPerMonth - Monthly conversation volume
 * @param pricing - Workspace pricing model
 * @param options - Simulation options
 * @returns External schema-compliant forecast result
 */
export function runAEIRForecast(
  agents: Agent[],
  edges: Edge[],
  conversationsPerMonth: number,
  pricing: WorkspacePricing,
  options?: AEIRForecastOptions,
): ExternalForecastResult {
  // Step 1: Compile to AEIR
  const { graph, compilationTimeMs } = compileToAEIR(agents, edges, {
    graphName: options?.graphName || 'User Topology',
    graphDescription: options?.graphDescription,
    useCache: options?.useCache ?? true,
    simConfig: options?.simConfig,
  })
  
  // Step 2: Create execution context
  const context: AEIRExecutionContext = {
    conversations_per_month: Math.max(1, conversationsPerMonth),
    seed: options?.seed,
    max_simulations: options?.numSimulations ?? 200,
    limits: {
      max_compilation_ms: 10,
      max_simulation_ms: 2000,
    },
  }
  
  // Step 3: Run simulation
  const simulation = runAEIRSimulation(graph, context, pricing, options?.simConfig)
  
  // Step 4: Convert to external schema
  return toExternalSchema(simulation, graph, pricing, compilationTimeMs, options?.simConfig)
}

/**
 * Advanced API: Direct AEIR graph execution.
 * 
 * Use this when you have a pre-compiled AEIR graph.
 * Bypasses the compilation step.
 */
export function runAEIRGraphForecast(
  graph: AEIRGraph,
  conversationsPerMonth: number,
  pricing: WorkspacePricing,
  options?: Omit<AEIRForecastOptions, 'graphName' | 'graphDescription' | 'useCache'>,
): ExternalForecastResult {
  const context: AEIRExecutionContext = {
    conversations_per_month: Math.max(1, conversationsPerMonth),
    seed: options?.seed,
    max_simulations: options?.numSimulations ?? 200,
    limits: {
      max_compilation_ms: 10,
      max_simulation_ms: 2000,
    },
  }
  
  const simulation = runAEIRSimulation(graph, context, pricing)
  return toExternalSchema(simulation, graph, pricing, 0)
}

/**
 * Get raw AEIR simulation result (internal format).
 * 
 * Use this for advanced use cases that need access to
 * per-node statistics and full distribution data.
 */
export function runRawAEIRSimulation(
  graph: AEIRGraph,
  conversationsPerMonth: number,
  pricing: WorkspacePricing,
  options?: Omit<AEIRForecastOptions, 'graphName' | 'graphDescription' | 'useCache'>,
): AEIRSimulationResult {
  const context: AEIRExecutionContext = {
    conversations_per_month: Math.max(1, conversationsPerMonth),
    seed: options?.seed,
    max_simulations: options?.numSimulations ?? 200,
    limits: {
      max_compilation_ms: 10,
      max_simulation_ms: 2000,
    },
  }
  
  return runAEIRSimulation(graph, context, pricing)
}

// --- Re-exports ---

export { compileToAEIR, clearCompilationCache, getCompilationCacheStats } from './aeir-compiler'
export { DEFAULT_AEIR_SIM_CONFIG, AEIR_SIM_CONFIG_META } from './aeir-config'
export type { AEIRSimConfig } from './aeir-config'
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
  TokenDistribution,
  DominantNode,
  PercentileStats,
  AEIRNodeResult,
} from './aeir-types'
