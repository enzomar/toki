/**
 * TopologyPage — Interactive graph visualization powered by React Flow.
 * Features: drag nodes, drag-to-connect, click edges to edit weight, double-click to edit node.
 */
import { useMemo } from 'react'
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material'
import { ReactFlowProvider } from '@xyflow/react'
import type { Agent, Edge, EstimateSummary, WorkspacePricing } from '../../features/topology/types'
import type { AEIRGraph } from '../../features/forecasting/aeir-types'
import { WORKSPACE_SAMPLES } from '../../features/topology/config'
import { computeTrafficShares, inferEntryAgents } from '../../features/topology/utils'
import { InteractiveTopology } from './InteractiveTopology'
import { PageHeader } from '../layout/PageHeader'

type Props = {
  agents: Agent[]
  edges: Edge[]
  pricing: WorkspacePricing
  estimate: EstimateSummary
  modelOptions: Array<{ value: string; label: string }>
  aeirGraph: AEIRGraph | null
  updateAgent: (id: string, patch: Partial<Agent>) => void
  removeAgent: (id: string) => void
  updateEdge: (id: string, patch: Partial<Edge>) => void
  removeEdge: (id: string) => void
  addEdge: (sourceId: string, targetId: string, weight: number) => void
  addAgent: () => void
  loadSample: (sampleId: string) => void
  formatCost: (v: number) => string
  onSnackbar: (msg: { severity: 'success' | 'error' | 'info'; message: string } | null) => void
}

export function TopologyPage({
  agents, edges, pricing, estimate, modelOptions, aeirGraph,
  updateAgent, removeAgent, updateEdge, removeEdge, addEdge, addAgent, loadSample,
  formatCost, onSnackbar,
}: Props) {
  const entryAgents = useMemo(() => inferEntryAgents(agents, edges), [agents, edges])
  const trafficShares = useMemo(() => computeTrafficShares(agents, edges), [agents, edges])

  const isEntry = (id: string) => entryAgents.some(a => a.id === id)
  const getTrafficShare = (id: string) => trafficShares.get(id) ?? 1
  const getAgentCost = (id: string) => estimate.agents.find(a => a.id === id)?.costPerMonth ?? 0

  if (agents.length === 0) {
    return (
      <Box sx={{ height: '100%', overflowY: 'auto' }}>
        <PageHeader title="Topology" description="Visualize and edit your agent graph" />
        <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
          <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>No agents yet</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Load a sample architecture or add agents in the Workspace tab.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'center' }}>
              {WORKSPACE_SAMPLES.map((sample) => (
                <Paper
                  key={sample.id}
                  variant="outlined"
                  onClick={() => loadSample(sample.id)}
                  sx={{
                    p: 2, cursor: 'pointer', borderRadius: 2, maxWidth: 240, textAlign: 'left',
                    transition: 'all 0.15s',
                    '&:hover': { borderColor: '#0f766e', bgcolor: 'rgba(15,118,110,0.04)' },
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>{sample.label}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{sample.description}</Typography>
                  <Stack direction="row" spacing={0.5}>
                    <Chip size="small" label={`${sample.agents.length} agents`} sx={{ height: 18, fontSize: 9 }} />
                    <Chip size="small" label={`${sample.edges.length} edges`} sx={{ height: 18, fontSize: 9 }} />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Topology"
        description="Interactive agent graph — drag, connect, and configure"
        actions={
          <Stack direction="row" spacing={1}>
            {aeirGraph && (
              <Button size="small" variant="outlined" onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(aeirGraph, null, 2))
                onSnackbar({ severity: 'success', message: 'AEIR JSON copied to clipboard.' })
              }}>
                Copy AEIR JSON
              </Button>
            )}
          </Stack>
        }
      />

      <Box sx={{ flex: 1, px: { xs: 1, md: 4 }, pb: 2 }}>
        <Paper sx={{ height: '100%', minHeight: 500, borderRadius: 3, overflow: 'hidden' }}>
          <ReactFlowProvider>
            <InteractiveTopology
              agents={agents}
              edges={edges}
              pricing={pricing}
              modelOptions={modelOptions}
              aeirGraph={aeirGraph}
              getAgentCost={getAgentCost}
              getTrafficShare={getTrafficShare}
              isEntry={isEntry}
              formatCost={formatCost}
              onUpdateAgent={updateAgent}
              onRemoveAgent={removeAgent}
              onAddEdge={addEdge}
              onUpdateEdge={updateEdge}
              onRemoveEdge={removeEdge}
              onAddAgent={addAgent}
            />
          </ReactFlowProvider>
        </Paper>
      </Box>
    </Box>
  )
}
