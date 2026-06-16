# Design Document: AEIR-First Architecture

## Overview

This design transforms Toki from a dual-engine forecasting system (hybrid.ts + montecarlo.ts) into a unified AEIR-first architecture. AEIR (Agent Execution Intermediate Representation) becomes the universal execution engine where all agentic systems are represented, compiled, and executed as directed acyclic graphs with probabilistic semantics.

### Key Design Goals

1. **Unified Execution Model**: Replace hybrid.ts and montecarlo.ts with a single AEIR engine
2. **Probabilistic Semantics**: Support probabilistic edges, conditional execution, and stochastic sampling
3. **Hierarchical Composition**: Enable nested subgraphs through CompositeNode structures
4. **Performance**: Sub-10ms compilation, sub-2s simulation for 500 iterations
5. **Backward Compatibility**: Maintain external API contracts and legacy topology import
6. **Type Safety**: Comprehensive type system for AEIR nodes with specialized subtypes

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                             │
│  (App.tsx, TopologyCanvas.tsx - AEIR-native editing)        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     AEIR Engine API                          │
│  - executeAEIR(graph, config) → ForecastResult              │
│  - compileFromLegacy(topology) → AEIR_Graph                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌─────────────────┐          ┌─────────────────┐
│  AEIR Compiler  │          │  Cache Layer    │
│  - Transform    │◄─────────┤  - Memoization  │
│  - Validate     │          │  - LRU eviction │
│  - Propagate    │          └─────────────────┘
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Monte Carlo Simulator                       │
│  - Probabilistic path sampling                              │
│  - Token distribution sampling (truncated normal)           │
│  - Hierarchical graph traversal                             │
│  - Percentile aggregation (p50/p90/p99)                     │
└─────────────────────────────────────────────────────────────┘
```


### Data Flow

1. **Input**: Legacy Agent/Edge topology OR native AEIR_Graph
2. **Compilation**: Transform → Validate → Optimize → Cache
3. **Execution**: Sample paths → Compute tokens → Aggregate statistics
4. **Output**: External schema with p50/p90/p99 percentiles, breakdowns, confidence

### Module Structure

```typescript
src/features/forecasting/
├── aeir/
│   ├── types.ts           // AEIR node/edge/graph types
│   ├── compiler.ts        // Legacy → AEIR transformation
│   ├── simulator.ts       // Monte Carlo execution engine
│   ├── cache.ts           // LRU cache for compiled graphs
│   └── engine.ts          // Public API facade
├── legacy/
│   ├── adapter.ts         // Backward compatibility wrappers
│   └── migration.ts       // Migration utilities
└── index.ts               // Public exports
```

## Data Models

### AEIR_Graph

The core data structure representing an agent topology as a directed acyclic graph.

```typescript
interface AEIR_Graph {
  nodes: AEIR_Node[]
  edges: AEIR_Edge[]
  entryNodeIds: string[]
  metadata: GraphMetadata
}

interface GraphMetadata {
  name: string
  version: string
  compiledAt: number
  sourceHash: string        // For cache keying
  totalNodes: number
  maxNestingDepth: number
}
```


### AEIR_Node Type System

Base node type with specialized subtypes for different execution semantics.

```typescript
type AEIR_Node = 
  | AgentNode
  | ToolNode
  | RAGNode
  | RouterNode
  | CompositeNode

interface BaseNode {
  id: string
  label: string
  nodeType: 'agent' | 'tool' | 'rag' | 'router' | 'composite'
  executionProbability: number  // [0, 1] - probability this node activates
}

interface AgentNode extends BaseNode {
  nodeType: 'agent'
  model: string
  inputDist: TokenDistribution
  outputDist: TokenDistribution
  callsPerExecution: TokenDistribution
  historyGrowthFactor: number
  cacheRate: number             // [0, 1] - fraction of input tokens cached
}

interface ToolNode extends BaseNode {
  nodeType: 'tool'
  toolName: string
  schemaTokens: TokenDistribution
  requestTokens: TokenDistribution
  responseTokens: TokenDistribution
  chainProbability: number      // [0, 1] - probability of chaining additional calls
  chainDepth: number            // Expected number of chained calls
  retryProbability: number      // [0, 1] - probability of retry on failure
  retryCount: number            // Number of retries on failure
}

interface RAGNode extends BaseNode {
  nodeType: 'rag'
  chunkCountDist: TokenDistribution
  chunkSizeDist: TokenDistribution
  amplificationFactor: number   // α ∈ [1.2, 2.5] for overlap/redundancy
  embeddingTokens: number       // Fixed cost per retrieval
}
```


interface RouterNode extends BaseNode {
  nodeType: 'router'
  routingLogic: 'probabilistic' | 'conditional' | 'round-robin'
  overhead: TokenDistribution   // Routing decision overhead
}

interface CompositeNode extends BaseNode {
  nodeType: 'composite'
  subgraph: AEIR_Graph          // Nested AEIR graph
  inputInterface: string[]       // Node IDs in subgraph accepting external input
  outputInterface: string[]      // Node IDs in subgraph producing output
}

interface TokenDistribution {
  expected: number    // Mean value
  stddev: number      // Standard deviation
  min: number         // Lower bound (truncated normal)
  max: number         // Upper bound (truncated normal)
}
```

### AEIR_Edge

Directed connections between nodes with probability weights.

```typescript
interface AEIR_Edge {
  id: string
  sourceId: string
  targetId: string
  probability: number           // [0, 1] - traversal probability
  condition?: EdgeCondition     // Optional conditional logic
}

interface EdgeCondition {
  type: 'output_size' | 'retry' | 'custom'
  predicate: (context: ExecutionContext) => boolean
}
```


### External Schema (Output Format)

Maintains backward compatibility with existing consumers.

```typescript
interface ForecastResult {
  // Token forecasts (per conversation)
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
  
  // Cost estimates (monthly)
  cost_p50_monthly: number
  cost_p90_monthly: number
  cost_p99_monthly: number
  cost_expected_monthly: number
  
  // Token breakdown by category
  breakdown_base_tokens: number       // Pure LLM reasoning
  breakdown_rag_tokens: number        // RAG context
  breakdown_mcp_tokens: number        // Tool call overhead
  breakdown_embedding_tokens: number  // Embedding costs
  
  // Quality metrics
  confidence_score: number            // [0, 1]
  alignment_ratio: number             // MC expected / deterministic
  alignment_ok: boolean               // true if within ±15%
  tail_risk_factor: number            // p99 / p50 ratio
  
  // Metadata
  simulation_count: number
  compilation_time_ms: number
  simulation_time_ms: number
}
```


## Core Algorithms

### 1. AEIR Compiler

Transforms legacy Agent/Edge topology into AEIR_Graph representation.

**Algorithm: compileFromLegacy(topology: LegacyTopology) → AEIR_Graph**

```typescript
function compileFromLegacy(agents: Agent[], edges: Edge[]): AEIR_Graph {
  // Phase 1: Node transformation
  const aeirNodes: AEIR_Node[] = agents.map(agent => {
    const nodeType = inferNodeType(agent)
    return createAEIRNode(agent, nodeType)
  })
  
  // Phase 2: Edge transformation
  const aeirEdges: AEIR_Edge[] = edges.map(edge => ({
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    probability: edge.weight  // Direct mapping
  }))
  
  // Phase 3: Identify entry nodes
  const entryNodeIds = identifyEntryNodes(aeirNodes, aeirEdges)
  
  // Phase 4: Propagate execution probabilities
  propagateExecutionProbabilities(aeirNodes, aeirEdges, entryNodeIds)
  
  // Phase 5: Compute source hash for caching
  const sourceHash = computeHash(agents, edges)
  
  return {
    nodes: aeirNodes,
    edges: aeirEdges,
    entryNodeIds,
    metadata: {
      name: 'Compiled Topology',
      version: '1.0',
      compiledAt: Date.now(),
      sourceHash,
      totalNodes: aeirNodes.length,
      maxNestingDepth: computeMaxNestingDepth(aeirNodes)
    }
  }
}
```


**Node Type Inference Logic:**

```typescript
function inferNodeType(agent: Agent): NodeType {
  // Priority-based inference
  if (agent.ragEnabled) return 'rag'
  if (agent.mcpCalls > 0) return 'tool'
  
  const isEntry = /* check if no incoming edges */
  const hasMultipleOutgoing = /* check outgoing edge count > 1 */
  
  if (isEntry && hasMultipleOutgoing && agent.callsPerConversation <= 1) {
    return 'router'
  }
  
  return 'agent'  // Default fallback
}
```

**Distribution Generation from Point Values:**

Uses coefficient of variation (CV) to generate uncertainty around point estimates.

```typescript
function pointToDistribution(value: number, cv: number = 0.15): TokenDistribution {
  const expected = Math.max(1, value)
  const stddev = expected * cv
  const min = Math.max(1, Math.round(expected * 0.3))
  const max = Math.round(expected * (1 + 3 * cv))
  
  return { expected, stddev, min, max }
}
```

**Probability Propagation:**

Breadth-first traversal from entry nodes, accumulating probability.

```typescript
function propagateExecutionProbabilities(
  nodes: AEIR_Node[],
  edges: AEIR_Edge[],
  entryIds: string[]
): void {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const queue = [...entryIds]
  const visited = new Set<string>()
  
  // Initialize entry nodes to probability 1.0
  entryIds.forEach(id => {
    nodeMap.get(id)!.executionProbability = 1.0
  })
  
  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)
    
    const currentNode = nodeMap.get(currentId)!
    const outgoingEdges = edges.filter(e => e.sourceId === currentId)
    
    for (const edge of outgoingEdges) {
      const targetNode = nodeMap.get(edge.targetId)!
      const incomingProb = currentNode.executionProbability * edge.probability
      
      // Accumulate probability (conservative overestimate for multiple paths)
      targetNode.executionProbability = Math.min(
        1.0,
        targetNode.executionProbability + incomingProb
      )
      
      queue.push(edge.targetId)
    }
  }
}
```


### 2. Monte Carlo Simulator

Executes probabilistic sampling through AEIR_Graph to generate token forecasts.

**Algorithm: simulateAEIR(graph: AEIR_Graph, config: SimConfig) → ForecastResult**

```typescript
function simulateAEIR(
  graph: AEIR_Graph,
  config: { numSimulations: number; conversationsPerMonth: number; seed?: number },
  pricing: Pricing
): ForecastResult {
  const rng = createSeededRNG(config.seed ?? Date.now())
  const runs: SimulationRun[] = []
  
  // Execute numSimulations iterations (capped at 500)
  const iterations = Math.min(config.numSimulations, 500)
  
  for (let i = 0; i < iterations; i++) {
    runs.push(simulateOneExecution(graph, rng))
  }
  
  // Aggregate results into percentiles
  const aggregated = aggregateSimulations(runs)
  
  // Compute deterministic baseline for alignment check
  const deterministic = computeDeterministicBaseline(graph)
  
  // Apply pricing model
  const withCosts = applyCostModel(aggregated, pricing, config.conversationsPerMonth)
  
  // Compute confidence score
  const alignmentRatio = aggregated.expected / deterministic.expected
  const alignmentOk = Math.abs(alignmentRatio - 1.0) <= 0.15
  const confidence = computeConfidence(alignmentOk, aggregated.stddev, aggregated.expected)
  
  return {
    ...withCosts,
    alignment_ratio: alignmentRatio,
    alignment_ok: alignmentOk,
    confidence_score: confidence,
    tail_risk_factor: aggregated.p99 / Math.max(1, aggregated.p50)
  }
}
```


**Single Execution Simulation:**

```typescript
function simulateOneExecution(graph: AEIR_Graph, rng: RNG): SimulationRun {
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))
  const totalTokens = { input: 0, output: 0 }
  const queue = [...graph.entryNodeIds]
  const visited = new Set<string>()
  
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    
    const node = nodeMap.get(nodeId)!
    
    // Probabilistic activation
    if (!bernoulli(rng, node.executionProbability)) continue
    
    // Execute node based on type
    const nodeTokens = executeNode(node, rng)
    totalTokens.input += nodeTokens.input
    totalTokens.output += nodeTokens.output
    
    // Traverse outgoing edges probabilistically
    const outgoingEdges = graph.edges.filter(e => e.sourceId === nodeId)
    for (const edge of outgoingEdges) {
      if (bernoulli(rng, edge.probability)) {
        queue.push(edge.targetId)
      }
    }
  }
  
  return {
    totalTokens: totalTokens.input + totalTokens.output,
    inputTokens: totalTokens.input,
    outputTokens: totalTokens.output
  }
}
```

**Node Execution by Type:**

```typescript
function executeNode(node: AEIR_Node, rng: RNG): { input: number; output: number } {
  switch (node.nodeType) {
    case 'agent':
      return executeAgentNode(node as AgentNode, rng)
    case 'tool':
      return executeToolNode(node as ToolNode, rng)
    case 'rag':
      return executeRAGNode(node as RAGNode, rng)
    case 'router':
      return executeRouterNode(node as RouterNode, rng)
    case 'composite':
      return executeCompositeNode(node as CompositeNode, rng)
  }
}
```


```typescript
function executeAgentNode(node: AgentNode, rng: RNG): { input: number; output: number } {
  const numCalls = sampleFromDistribution(node.callsPerExecution, rng)
  let totalInput = 0
  let totalOutput = 0
  
  for (let i = 0; i < numCalls; i++) {
    totalInput += sampleFromDistribution(node.inputDist, rng)
    totalOutput += sampleFromDistribution(node.outputDist, rng)
  }
  
  return { input: totalInput, output: totalOutput }
}

function executeToolNode(node: ToolNode, rng: RNG): { input: number; output: number } {
  let tokens = {
    input: sampleFromDistribution(node.requestTokens, rng) + 
           sampleFromDistribution(node.schemaTokens, rng),
    output: sampleFromDistribution(node.responseTokens, rng)
  }
  
  // Chain probability
  if (bernoulli(rng, node.chainProbability)) {
    tokens.output += sampleFromDistribution(node.responseTokens, rng) * node.chainDepth * 0.5
  }
  
  // Retry probability
  if (bernoulli(rng, node.retryProbability)) {
    tokens.input += tokens.input * node.retryCount
    tokens.output += tokens.output * node.retryCount
  }
  
  return tokens
}

function executeRAGNode(node: RAGNode, rng: RNG): { input: number; output: number } {
  const chunks = sampleFromDistribution(node.chunkCountDist, rng)
  const chunkSize = sampleFromDistribution(node.chunkSizeDist, rng)
  const contextTokens = Math.round(chunks * chunkSize * node.amplificationFactor)
  
  return {
    input: contextTokens + node.embeddingTokens,
    output: 0  // RAG is input-only
  }
}

function executeCompositeNode(node: CompositeNode, rng: RNG): { input: number; output: number } {
  // Recursively simulate the nested subgraph
  return simulateOneExecution(node.subgraph, rng)
}
```


**Distribution Sampling:**

Uses truncated normal distribution via Box-Muller transform.

```typescript
function sampleFromDistribution(dist: TokenDistribution, rng: RNG): number {
  // Box-Muller transform for normal distribution
  const u1 = rng()
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
  const value = dist.expected + z * dist.stddev
  
  // Truncate to [min, max] bounds
  return Math.round(Math.max(dist.min, Math.min(dist.max, value)))
}

function bernoulli(rng: RNG, probability: number): boolean {
  return rng() < probability
}
```

**Seeded PRNG (Mulberry32):**

```typescript
function createSeededRNG(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

