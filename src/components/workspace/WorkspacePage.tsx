/**
 * WorkspacePage — The main workspace page combining Traffic, Agents, Connections, and Cost.
 * Layout: left content area + right sticky cost panel.
 * Progressive disclosure: basic flow is linear, advanced settings expand on demand.
 */
import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import { Box, Button, Chip, Grid, ListItemText, Menu, MenuItem, Stack, TextField } from '@mui/material'
import { ScienceRounded } from '@mui/icons-material'
import type { Agent, Edge, EstimateConfig, EstimateSummary, WorkspacePricing } from '../../features/topology/types'
import type { ExternalForecastResult } from '../../features/forecasting/aeir'
import type { AEIRSimConfig } from '../../features/forecasting/aeir-config'
import { WORKSPACE_SAMPLES } from '../../features/topology/config'
import { PageHeader } from '../layout/PageHeader'
import { ExportActions } from '../ExportActions'
import { TrafficSection } from './TrafficSection'
import { AgentSection } from './AgentSection'
import { ConnectionsSection } from './ConnectionsSection'
import { CostPanel } from './CostPanel'

export type WorkspacePageProps = {
  // Workspace state
  workspaceName: string
  setWorkspaceName: (name: string) => void
  agents: Agent[]
  edges: Edge[]
  estimateConfig: EstimateConfig
  setEstimateConfig: Dispatch<SetStateAction<EstimateConfig>>
  pricing: WorkspacePricing
  setPricing: Dispatch<SetStateAction<WorkspacePricing>>
  estimate: EstimateSummary
  modelOptions: Array<{ value: string; label: string }>

  // Agent CRUD
  addAgent: () => void
  removeAgent: (id: string) => void
  updateAgent: (id: string, patch: Partial<Agent>) => void

  // Edge CRUD
  addEdge: () => void
  updateEdge: (id: string, patch: Partial<Edge>) => void
  removeEdge: (id: string) => void

  // MC state
  mcReport: ExternalForecastResult | null
  mcRunning: boolean
  mcSimCount: number
  setMcSimCount: (v: number) => void
  simConfig: AEIRSimConfig | null
  setSimConfig: (v: AEIRSimConfig | null) => void
  scaledConfig: EstimateConfig
  growthMultiplier: number
  setGrowthMultiplier: (v: number) => void
  onShowMcDetail: () => void

  // Export/Import
  onImport: (parsed: { agents: Agent[]; edges: Edge[]; estimate: EstimateConfig; pricing: WorkspacePricing }, simConfig?: AEIRSimConfig) => void
  onSnackbar: (msg: { severity: 'success' | 'error' | 'info'; message: string } | null) => void
  onLoadSample: (e: React.MouseEvent<HTMLElement>) => void
  loadSample: (sampleId: string) => void
  bulkChangeModel: (model: string) => void
  formatCost: (v: number) => string
}

export function WorkspacePage(props: WorkspacePageProps) {
  const getAgentCost = (id: string) => props.estimate.agents.find((a) => a.id === id)?.costPerMonth ?? 0
  const [samplesAnchor, setSamplesAnchor] = useState<HTMLElement | null>(null)

  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <PageHeader
        title="Workspace"
        description="Design your AI system and forecast token costs"
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              variant="standard"
              value={props.workspaceName}
              onChange={(e) => props.setWorkspaceName(e.target.value)}
              placeholder="Workspace name"
              slotProps={{ input: { sx: { fontSize: 13, fontWeight: 600 } } }}
              sx={{ minWidth: 180 }}
            />
            <Button
              size="small"
              startIcon={<ScienceRounded sx={{ fontSize: 16 }} />}
              onClick={(e) => setSamplesAnchor(e.currentTarget)}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Samples
            </Button>
            <Menu
              anchorEl={samplesAnchor}
              open={Boolean(samplesAnchor)}
              onClose={() => setSamplesAnchor(null)}
              slotProps={{ paper: { sx: { maxWidth: 360 } } }}
            >
              {WORKSPACE_SAMPLES.map((sample) => (
                <MenuItem
                  key={sample.id}
                  onClick={() => { props.loadSample(sample.id); setSamplesAnchor(null) }}
                  sx={{ whiteSpace: 'normal', py: 1.25 }}
                >
                  <ListItemText
                    primary={sample.label}
                    secondary={
                      <>
                        {sample.description}
                        <br />
                        <Chip size="small" label={`${sample.agents.length} agents`} sx={{ height: 16, fontSize: 9, mt: 0.5, mr: 0.5 }} />
                        <Chip size="small" label={`${sample.edges.length} edges`} sx={{ height: 16, fontSize: 9, mt: 0.5, mr: 0.5 }} />
                        <Chip size="small" label={`${(sample.conversationsPerMonth / 1000).toFixed(0)}k conv/mo`} sx={{ height: 16, fontSize: 9, mt: 0.5 }} />
                      </>
                    }
                    slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'caption', component: 'div' } }}
                  />
                </MenuItem>
              ))}
            </Menu>
            <ExportActions
              agents={props.agents}
              edges={props.edges}
              estimateConfig={props.estimateConfig}
              scaledConfig={props.scaledConfig}
              pricing={props.pricing}
              estimate={props.estimate}
              mcReport={props.mcReport}
              simConfig={props.simConfig}
              workspaceName={props.workspaceName}
              onImport={props.onImport}
              onSnackbar={props.onSnackbar}
            />
          </Stack>
        }
      />

      <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
        <Grid container spacing={3}>
          {/* Left: Content flow */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Stack spacing={2.5}>
              <TrafficSection
                estimateConfig={props.estimateConfig}
                setEstimateConfig={props.setEstimateConfig}
              />
              <AgentSection
                agents={props.agents}
                modelOptions={props.modelOptions}
                addAgent={props.addAgent}
                removeAgent={props.removeAgent}
                updateAgent={props.updateAgent}
                formatCost={props.formatCost}
                getAgentCost={getAgentCost}
                onLoadSample={props.onLoadSample}
                bulkChangeModel={props.bulkChangeModel}
              />
              <ConnectionsSection
                agents={props.agents}
                edges={props.edges}
                addEdge={props.addEdge}
                updateEdge={props.updateEdge}
                removeEdge={props.removeEdge}
              />
            </Stack>
          </Grid>

          {/* Right: Sticky cost panel */}
          <Grid size={{ xs: 12, lg: 4 }}>
            <CostPanel
              estimate={props.estimate}
              mcReport={props.mcReport}
              mcRunning={props.mcRunning}
              mcSimCount={props.mcSimCount}
              setMcSimCount={props.setMcSimCount}
              simConfig={props.simConfig}
              setSimConfig={props.setSimConfig}
              estimateConfig={props.estimateConfig}
              scaledConfig={props.scaledConfig}
              growthMultiplier={props.growthMultiplier}
              setGrowthMultiplier={props.setGrowthMultiplier}
              agents={props.agents}
              formatCost={props.formatCost}
              onShowMcDetail={props.onShowMcDetail}
            />
          </Grid>
        </Grid>
      </Box>
    </Box>
  )
}
