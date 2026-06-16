# Requirements Document

## Introduction

This specification defines the transformation of Toki from a dual-engine forecasting architecture (hybrid.ts + montecarlo.ts) into a unified AEIR-first architecture. AEIR (Agent Execution Intermediate Representation) becomes the universal execution engine where all agentic systems are represented, compiled, and executed as AEIR graphs. The system maintains backward compatibility with external API contracts while introducing breaking changes to internal type systems and complete UI integration.

## Glossary

- **AEIR_Engine**: The unified execution engine that replaces both hybrid.ts and montecarlo.ts, processing AEIR graphs as the primary data model
- **AEIR_Graph**: A directed graph representation of agent topologies with hierarchical support, probabilistic execution semantics, and tool integration
- **AEIR_Node**: A vertex in the AEIR graph representing execution units (AgentNode, ToolNode, RAGNode, RouterNode, CompositeNode)
- **AEIR_Edge**: A directed connection between AEIR nodes with probability weights and conditional execution semantics
- **AEIR_Compiler**: The transformation layer that converts Agent/Edge topology models into optimized AEIR graphs
- **Monte_Carlo_Simulator**: The probabilistic execution component within AEIR_Engine that samples execution paths
- **Legacy_Topology**: The existing Agent/Edge data model (types.ts) that must be transformed into AEIR representation
- **External_Schema**: The public API contract (total_tokens_expected, p50/p90/p99, breakdown, confidence_score) that remains unchanged
- **Compilation_Target**: The performance requirement that AEIR compilation completes within 10 milliseconds
- **Simulation_Budget**: The constraint that Monte Carlo simulations execute no more than 500 iterations
- **Cache_Layer**: The memoization system for AEIR compilation results and simulation outputs
- **Hierarchical_Graph**: AEIR support for nested subgraphs (CompositeNode containing child AEIR graphs)
- **Probabilistic_Execution**: Execution semantics where edges have probability weights and nodes have activation probabilities
- **Tool_Integration**: The subsystem for modeling MCP tools, RAG retrievals, and external tool calls within AEIR
- **UI_Integration**: The complete rewrite of App.tsx, TopologyCanvas.tsx, and related components to use AEIR as primary model

## Requirements

### Requirement 1: AEIR Engine Core

**User Story:** As a forecasting system, I want a unified AEIR execution engine that replaces both hybrid.ts and montecarlo.ts, so that all agentic topologies are represented and executed through a single consistent model.

#### Acceptance Criteria

1.1. THE AEIR_Engine SHALL replace all functionality from hybrid.ts and montecarlo.ts with a unified implementation

1.2. WHEN a topology is provided, THE AEIR_Engine SHALL produce token forecasts matching External_Schema format (total_tokens_expected, p50/p90/p99, breakdown, confidence_score)

1.3. THE AEIR_Engine SHALL accept AEIR_Graph as the primary input data structure

1.4. THE AEIR_Engine SHALL support Probabilistic_Execution where edges have probability weights between 0 and 1

1.5. THE AEIR_Engine SHALL support Hierarchical_Graph structures through CompositeNode containers

1.6. WHEN compilation is triggered, THE AEIR_Compiler SHALL transform AEIR_Graph into executable representation within Compilation_Target (10 milliseconds)

1.7. WHEN simulation is executed, THE Monte_Carlo_Simulator SHALL complete within Simulation_Budget (500 iterations maximum)

1.8. THE AEIR_Engine SHALL compute deterministic baseline values aligned with previous calculateEstimate logic

1.9. WHEN alignment_ratio deviates by more than 15% from deterministic baseline, THE AEIR_Engine SHALL flag low confidence in results

1.10. THE Cache_Layer SHALL memoize compiled AEIR graphs to avoid recompilation for unchanged topologies

### Requirement 2: AEIR Node Type System

**User Story:** As a system architect, I want a comprehensive AEIR node type system that models all execution units (agents, tools, RAG, routing, composition), so that any agentic topology can be accurately represented.

#### Acceptance Criteria

2.1. THE AEIR_Node type system SHALL define AgentNode representing LLM agent execution units

2.2. THE AEIR_Node type system SHALL define ToolNode representing MCP tool invocations

2.3. THE AEIR_Node type system SHALL define RAGNode representing retrieval-augmented generation operations

2.4. THE AEIR_Node type system SHALL define RouterNode representing conditional branching and traffic routing

2.5. THE AEIR_Node type system SHALL define CompositeNode representing nested AEIR subgraphs for Hierarchical_Graph support

2.6. WHEN an AEIR_Node is created, THE node SHALL include token distributions (input_dist, output_dist) with mean, stddev, min, max fields

2.7. WHEN an AEIR_Node is created, THE node SHALL include execution_probability field for Probabilistic_Execution

2.8. WHERE Tool_Integration is required, THE ToolNode SHALL include schema_tokens, request_tokens, response_tokens, chain_probability, retry_probability fields

2.9. WHERE RAG is required, THE RAGNode SHALL include chunk_count_dist, chunk_size_dist, amplification_factor, embedding_tokens fields

2.10. THE AgentNode SHALL include calls_per_execution distribution, history_growth_factor, and cache_rate fields

### Requirement 3: AEIR Compiler

**User Story:** As a transformation layer, I want an AEIR compiler that converts Legacy_Topology (Agent/Edge model) into optimized AEIR_Graph representation, so that existing topologies can be executed through the new engine without data loss.

#### Acceptance Criteria

3.1. WHEN Legacy_Topology is provided, THE AEIR_Compiler SHALL transform Agent types into corresponding AEIR_Node types (AgentNode, ToolNode, RAGNode, RouterNode)

3.2. THE AEIR_Compiler SHALL infer node types from Agent properties (ragEnabled → RAGNode, mcpCalls > 0 → ToolNode, routing logic → RouterNode)

3.3. WHEN Agent.inputTokensPerCall is a point value, THE AEIR_Compiler SHALL generate token distribution using coefficient of variation (default 15%)

3.4. WHEN Agent.outputTokensPerCall is a point value, THE AEIR_Compiler SHALL generate token distribution using coefficient of variation

3.5. THE AEIR_Compiler SHALL transform Edge.weight into AEIR_Edge probability weights

3.6. THE AEIR_Compiler SHALL propagate execution probabilities through AEIR_Graph using breadth-first traversal from entry nodes

3.7. THE AEIR_Compiler SHALL identify entry nodes (nodes with no incoming edges or explicitly marked as entry)

3.8. WHEN compilation completes, THE AEIR_Compiler SHALL return compiled AEIR_Graph within Compilation_Target (10 milliseconds)

3.9. THE AEIR_Compiler SHALL preserve all semantic information from Legacy_Topology without loss

3.10. THE AEIR_Compiler SHALL cache compiled results keyed by topology hash to avoid redundant compilation

### Requirement 4: Monte Carlo Simulation

**User Story:** As a probabilistic forecasting system, I want Monte Carlo simulation that samples execution paths through AEIR graphs, so that I can generate percentile forecasts (p50/p90/p99) and tail risk analysis.

#### Acceptance Criteria

4.1. WHEN simulation is invoked, THE Monte_Carlo_Simulator SHALL sample execution paths through AEIR_Graph respecting Probabilistic_Execution semantics

4.2. THE Monte_Carlo_Simulator SHALL execute no more than Simulation_Budget (500 iterations)

4.3. WHEN an AEIR_Node has execution_probability < 1.0, THE Monte_Carlo_Simulator SHALL activate the node probabilistically using Bernoulli sampling

4.4. WHEN an AEIR_Edge has probability weight < 1.0, THE Monte_Carlo_Simulator SHALL traverse the edge probabilistically

4.5. THE Monte_Carlo_Simulator SHALL sample token counts from AEIR_Node token distributions using truncated normal distribution

4.6. THE Monte_Carlo_Simulator SHALL aggregate simulation results into percentiles (p50, p90, p99) matching External_Schema

4.7. THE Monte_Carlo_Simulator SHALL compute variance and standard deviation for confidence analysis

4.8. THE Monte_Carlo_Simulator SHALL track per-node activation rates (execution frequency across simulations)

4.9. THE Monte_Carlo_Simulator SHALL compute tail_risk_factor (p99/p50 ratio) for risk assessment

4.10. THE Monte_Carlo_Simulator SHALL use seeded PRNG (Mulberry32) for reproducible simulations when seed is provided

### Requirement 5: External Schema Compatibility

**User Story:** As an API consumer, I want the AEIR engine to maintain compatibility with existing external schema contracts, so that dependent systems and UI components continue to function without breaking changes.

#### Acceptance Criteria

5.1. THE AEIR_Engine SHALL produce output matching External_Schema with fields: total_tokens_expected, tokens_p50, tokens_p90, tokens_p99

5.2. THE AEIR_Engine SHALL produce breakdown fields: breakdown_base_tokens, breakdown_rag_tokens, breakdown_mcp_tokens, breakdown_embedding_tokens

5.3. THE AEIR_Engine SHALL produce confidence_score field (0 to 1 scale)

5.4. THE AEIR_Engine SHALL produce alignment_ratio and alignment_ok fields for deterministic consistency validation

5.5. THE AEIR_Engine SHALL produce tail_risk_factor for percentile spread analysis

5.6. THE AEIR_Engine SHALL scale all token values to monthly volume when conversationsPerMonth is provided

5.7. THE AEIR_Engine SHALL compute cost values by applying pricing model to token forecasts (cost_p50_monthly, cost_p90_monthly, cost_p99_monthly, cost_expected_monthly)

5.8. WHERE pricing model is unavailable, THE AEIR_Engine SHALL return token forecasts without cost computation

5.9. THE AEIR_Engine SHALL maintain backward compatibility with HybridForecastResult type structure

5.10. THE AEIR_Engine SHALL produce simulation_count metadata field indicating actual number of simulations executed

### Requirement 6: UI Integration

**User Story:** As a user, I want the UI to natively support AEIR as the primary data model with full visual editing capabilities, so that I can design and visualize agentic topologies using AEIR semantics directly.

#### Acceptance Criteria

6.1. THE App.tsx SHALL be rewritten to use AEIR_Graph as the primary state model instead of Agent/Edge arrays

6.2. THE TopologyCanvas.tsx SHALL render AEIR_Graph structures with visual differentiation for node types (AgentNode, ToolNode, RAGNode, RouterNode, CompositeNode)

6.3. THE TopologyCanvas.tsx SHALL display AEIR_Edge probability weights as edge labels

6.4. WHEN a CompositeNode is rendered, THE TopologyCanvas SHALL provide visual indication of nested subgraph presence

6.5. THE TopologyCanvas SHALL support interactive editing of AEIR_Node properties (token distributions, execution probabilities)

6.6. THE TopologyCanvas SHALL support interactive editing of AEIR_Edge probability weights

6.7. THE node inspector panel SHALL display AEIR-specific fields (token distribution parameters, execution probability, node type)

6.8. WHERE Tool_Integration is present, THE inspector SHALL display tool-specific fields (schema_tokens, chain_probability, retry_probability)

6.9. WHERE RAG is present, THE inspector SHALL display RAG-specific fields (chunk_count_dist, chunk_size_dist, amplification_factor)

6.10. THE UI SHALL maintain backward compatibility with Legacy_Topology import/export through AEIR_Compiler transformation

### Requirement 7: Performance Constraints

**User Story:** As a performance-sensitive application, I want AEIR compilation and simulation to meet strict latency budgets, so that UI interactions remain responsive and real-time forecasting is practical.

#### Acceptance Criteria

7.1. THE AEIR_Compiler SHALL complete compilation within Compilation_Target (10 milliseconds) for topologies up to 100 nodes

7.2. THE Monte_Carlo_Simulator SHALL complete simulation within 2000 milliseconds for Simulation_Budget (500 iterations)

7.3. THE Cache_Layer SHALL reduce repeated compilation time to under 1 millisecond for cached topologies

7.4. WHEN topology exceeds 100 nodes, THE AEIR_Compiler SHALL emit performance warning but continue compilation

7.5. WHEN simulation exceeds 2000 milliseconds, THE Monte_Carlo_Simulator SHALL terminate early and return partial results with confidence penalty

7.6. THE AEIR_Engine SHALL debounce repeated simulation requests within 300 milliseconds to avoid redundant computation

7.7. THE UI SHALL trigger AEIR compilation asynchronously to avoid blocking the main thread

7.8. THE UI SHALL display loading indicators when simulation duration exceeds 500 milliseconds

7.9. THE Cache_Layer SHALL use LRU eviction policy with capacity limit of 50 compiled graphs

7.10. THE AEIR_Engine SHALL expose performance metrics (compilation_time_ms, simulation_time_ms) in result metadata

### Requirement 8: Hierarchical Graph Support

**User Story:** As a system modeler, I want support for hierarchical AEIR graphs with nested subgraphs, so that I can represent complex multi-level agentic systems and reusable agent components.

#### Acceptance Criteria

8.1. THE CompositeNode SHALL contain a nested AEIR_Graph representing a subgraph

8.2. WHEN CompositeNode is executed in simulation, THE Monte_Carlo_Simulator SHALL recursively execute the nested AEIR_Graph

8.3. THE CompositeNode SHALL aggregate token costs from nested execution and propagate to parent graph

8.4. THE CompositeNode SHALL expose input/output interfaces as AEIR_Edge connections to parent graph

8.5. THE AEIR_Compiler SHALL support transformation of nested Agent groups into CompositeNode structures

8.6. THE TopologyCanvas SHALL support collapsed/expanded view modes for CompositeNode visualization

8.7. WHEN CompositeNode is collapsed, THE TopologyCanvas SHALL display aggregate token statistics

8.8. WHEN CompositeNode is expanded, THE TopologyCanvas SHALL render nested subgraph inline or in detail panel

8.9. THE AEIR_Graph SHALL enforce acyclic constraint at each hierarchy level (no cycles within single level)

8.10. THE AEIR_Graph SHALL support cross-hierarchy edges connecting nodes at different nesting levels

### Requirement 9: Migration and Deprecation

**User Story:** As a maintainer, I want clear migration paths and deprecation notices for legacy systems, so that dependent code can transition smoothly to the AEIR-first architecture.

#### Acceptance Criteria

9.1. THE hybrid.ts file SHALL be marked as deprecated with migration guide comments

9.2. THE montecarlo.ts file SHALL be marked as deprecated with migration guide comments

9.3. THE codebase SHALL include migration utilities for converting HybridForecastResult to AEIR output format

9.4. THE codebase SHALL include backward compatibility wrappers that accept Legacy_Topology and internally use AEIR_Compiler

9.5. THE documentation SHALL provide migration guide explaining AEIR_Node type mappings from Agent types

9.6. THE documentation SHALL provide migration guide explaining AEIR_Edge probability semantics from Edge.weight

9.7. WHERE external systems depend on hybrid.ts exports, THE backward compatibility layer SHALL proxy calls to AEIR_Engine

9.8. THE test suite SHALL include migration validation tests ensuring AEIR outputs match hybrid.ts outputs for identical inputs

9.9. THE deprecation timeline SHALL allow minimum 2 release cycles before removing hybrid.ts and montecarlo.ts

9.10. THE AEIR_Engine SHALL log deprecation warnings when backward compatibility wrappers are invoked

### Requirement 10: Testing and Validation

**User Story:** As a quality assurance system, I want comprehensive testing coverage for AEIR engine functionality, so that correctness, performance, and compatibility are continuously validated.

#### Acceptance Criteria

10.1. THE test suite SHALL include unit tests for AEIR_Compiler transformation logic covering all Agent-to-AEIR_Node mappings

10.2. THE test suite SHALL include unit tests for Monte_Carlo_Simulator probabilistic sampling with seeded PRNG for reproducibility

10.3. THE test suite SHALL include integration tests validating External_Schema output format compliance

10.4. THE test suite SHALL include performance tests asserting Compilation_Target (10ms) and Simulation_Budget constraints

10.5. THE test suite SHALL include regression tests comparing AEIR_Engine outputs to hybrid.ts baseline outputs for known topologies

10.6. THE test suite SHALL include property-based tests for AEIR_Graph invariants (acyclic constraint, probability sum validation)

10.7. THE test suite SHALL include snapshot tests for UI component rendering of AEIR_Graph structures

10.8. WHERE alignment_ratio deviates, THE test suite SHALL assert confidence_score is reduced appropriately

10.9. THE test suite SHALL validate Cache_Layer correctness by asserting identical outputs for repeated compilations

10.10. THE test suite SHALL include end-to-end tests simulating full user workflows (create topology → compile → simulate → visualize)
