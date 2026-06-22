/**
 * SimulationPage — Discrete Event Simulation page.
 */
import type { Dispatch, SetStateAction } from 'react'
import { Box } from '@mui/material'
import type { Agent, Edge, LLMPerformanceSettings, WorkspacePricing } from '../../features/topology/types'
import { DESTab } from '../DESTab'
import { PageHeader } from '../layout/PageHeader'

type Props = {
  agents: Agent[]
  edges: Edge[]
  pricing: WorkspacePricing
  llmPerformance: LLMPerformanceSettings
  setLLMPerformance: Dispatch<SetStateAction<LLMPerformanceSettings>>
}

export function SimulationPage({ agents, edges, pricing, llmPerformance, setLLMPerformance }: Props) {
  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <PageHeader
        title="Simulation"
        description="Discrete Event Simulation — observe queueing, latency, and infrastructure sizing"
      />

      <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
        <DESTab agents={agents} edges={edges} pricing={pricing} llmPerformance={llmPerformance} setLLMPerformance={setLLMPerformance} />
      </Box>
    </Box>
  )
}
