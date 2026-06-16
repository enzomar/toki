/**
 * AEIR Utilities
 * 
 * Shared utilities for AEIR operations
 */

// --- Hash Function ---

export function createHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

// --- PRNG (Mulberry32) ---

export function createRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- Distribution Sampling ---

export function sampleNormal(rng: () => number, mean: number, stddev: number): number {
  const u1 = Math.max(rng(), 1e-10)
  const u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * stddev
}

export function sampleTruncatedNormal(
  rng: () => number,
  mean: number,
  stddev: number,
  min: number,
  max: number
): number {
  const value = sampleNormal(rng, mean, stddev)
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function bernoulli(rng: () => number, p: number): boolean {
  return rng() < p
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// --- Percentile Computation ---

export function computePercentiles(sorted: number[]): {
  p50: number
  p90: number
  p99: number
  worst: number
  expected: number
  variance: number
  stddev: number
} {
  if (sorted.length === 0) {
    return { p50: 0, p90: 0, p99: 0, worst: 0, expected: 0, variance: 0, stddev: 0 }
  }
  
  const n = sorted.length
  const p50 = sorted[Math.floor(n * 0.5)]
  const p90 = sorted[Math.floor(n * 0.9)]
  const p99 = sorted[Math.floor(n * 0.99)]
  const worst = sorted[n - 1]
  
  const expected = sorted.reduce((sum, val) => sum + val, 0) / n
  const variance = sorted.reduce((sum, val) => sum + Math.pow(val - expected, 2), 0) / n
  const stddev = Math.sqrt(variance)
  
  return { p50, p90, p99, worst, expected, variance, stddev }
}

// --- Graph Validation ---

export function validateAEIRGraph(graph: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!graph) {
    errors.push('Graph is null or undefined')
    return { valid: false, errors }
  }
  
  if (!graph.nodes || !Array.isArray(graph.nodes)) {
    errors.push('Graph must have nodes array')
  }
  
  if (!graph.edges || !Array.isArray(graph.edges)) {
    errors.push('Graph must have edges array')
  }
  
  if (!graph.entry_ids || !Array.isArray(graph.entry_ids)) {
    errors.push('Graph must have entry_ids array')
  }
  
  // Check node IDs are unique
  const nodeIds = new Set<string>()
  for (const node of graph.nodes || []) {
    if (!node.id) {
      errors.push('Node missing id')
      continue
    }
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`)
    }
    nodeIds.add(node.id)
  }
  
  // Check edges reference valid nodes
  for (const edge of graph.edges || []) {
    if (!nodeIds.has(edge.source_id)) {
      errors.push(`Edge references invalid source: ${edge.source_id}`)
    }
    if (!nodeIds.has(edge.target_id)) {
      errors.push(`Edge references invalid target: ${edge.target_id}`)
    }
  }
  
  // Check entry nodes exist
  for (const entryId of graph.entry_ids || []) {
    if (!nodeIds.has(entryId)) {
      errors.push(`Entry node not found: ${entryId}`)
    }
  }
  
  return { valid: errors.length === 0, errors }
}

// --- Cycle Detection ---

export function detectCycles(nodes: any[], edges: any[]): { hasCycles: boolean; cycles: string[][] } {
  const graph = new Map<string, string[]>()
  
  // Build adjacency list
  for (const node of nodes) {
    graph.set(node.id, [])
  }
  
  for (const edge of edges) {
    const neighbors = graph.get(edge.source_id) || []
    neighbors.push(edge.target_id)
    graph.set(edge.source_id, neighbors)
  }
  
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  const cycles: string[][] = []
  const currentPath: string[] = []
  
  function dfs(nodeId: string): boolean {
    visited.add(nodeId)
    recursionStack.add(nodeId)
    currentPath.push(nodeId)
    
    const neighbors = graph.get(nodeId) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true
      } else if (recursionStack.has(neighbor)) {
        // Found cycle
        const cycleStart = currentPath.indexOf(neighbor)
        if (cycleStart !== -1) {
          cycles.push(currentPath.slice(cycleStart))
        }
        return true
      }
    }
    
    recursionStack.delete(nodeId)
    currentPath.pop()
    return false
  }
  
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id)
    }
  }
  
  return { hasCycles: cycles.length > 0, cycles }
}
