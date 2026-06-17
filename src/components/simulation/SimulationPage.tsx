/**
 * SimulationPage — Discrete Event Simulation page.
 */
import { Box } from '@mui/material'
import type { Agent, Edge, WorkspacePricing } from '../../features/topology/types'
import { DESTab } from '../DESTab'
import { PageHeader } from '../layout/PageHeader'

type Props = {
  agents: Agent[]
  edges: Edge[]
  pricing: WorkspacePricing
}

export function SimulationPage({ agents, edges, pricing }: Props) {
  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <PageHeader
        title="Simulation"
        description="Discrete Event Simulation — observe queueing, latency, and infrastructure sizing"
      />

      <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
        <DESTab agents={agents} edges={edges} pricing={pricing} />
      </Box>
    </Box>
  )
}
