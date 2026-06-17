import type { Dispatch, SetStateAction } from 'react'
import { useMemo } from 'react'
import {
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { AddRounded, DeleteOutlineRounded, ScienceRounded } from '@mui/icons-material'
import type { Agent, Edge, EstimateConfig, EstimateSummary, TimeRange, WorkspacePricing } from '../features/topology/types'
import { computeConversationsPerMonth, toNumber } from '../features/topology/utils'

// Reuse AgentCard from App (it's defined in the same file, we import it indirectly)
// We'll accept it as a render prop or move it later. For now, keep inline reference via children.

export interface CalculatorPanelProps {
  agents: Agent[]
  edges: Edge[]
  estimateConfig: EstimateConfig
  setEstimateConfig: Dispatch<SetStateAction<EstimateConfig>>
  pricing: WorkspacePricing
  modelOptions: Array<{ value: string; label: string }>
  estimate: EstimateSummary
  addAgent: () => void
  removeAgent: (id: string) => void
  updateAgent: (id: string, patch: Partial<Agent>) => void
  addEdge: () => void
  updateEdge: (id: string, patch: Partial<Edge>) => void
  removeEdge: (id: string) => void
  setSnackbar: (snack: { severity: 'success' | 'error' | 'info'; message: string } | null) => void
  formatCost: (v: number) => string
  bulkChangeModel: (model: string) => void
  onLoadSample: (e: React.MouseEvent<HTMLElement>) => void
  renderAgentCard: (agent: Agent, costPerMonth: number) => React.ReactNode
}

export function CalculatorPanel({
  agents,
  edges,
  estimateConfig,
  setEstimateConfig,
  modelOptions,
  estimate,
  addAgent,
  addEdge,
  updateEdge,
  removeEdge,
  bulkChangeModel,
  onLoadSample,
  renderAgentCard,
}: CalculatorPanelProps) {
  // Compute total outgoing traffic per agent for connection weight validation
  const totalOutgoingTraffic = useMemo(() => {
    const outByAgent = new Map<string, number>()
    edges.forEach((e) => {
      outByAgent.set(e.sourceId, (outByAgent.get(e.sourceId) ?? 0) + e.weight)
    })
    return outByAgent
  }, [edges])

  return (
    <Grid size={{ xs: 12, lg: 8 }}>
      <Stack spacing={2}>
        {/* Volume input */}
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>Traffic volume</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            How many users do you have, and how often do they interact?
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                type="number"
                label="Number of users"
                placeholder="e.g. 5000"
                value={estimateConfig.users || ''}
                helperText="Active users in the selected time range."
                onChange={(e) => {
                  const users = Math.max(0, Math.round(toNumber(e.target.value, 0)))
                  setEstimateConfig((c) => ({ ...c, users, conversationsPerMonth: computeConversationsPerMonth(users, c.conversationsPerUser, c.timeRange) }))
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                type="number"
                label="Conversations per user"
                placeholder="e.g. 10"
                value={estimateConfig.conversationsPerUser || ''}
                helperText="Average conversations each user has."
                onChange={(e) => {
                  const conv = Math.max(0, toNumber(e.target.value, 0))
                  setEstimateConfig((c) => ({ ...c, conversationsPerUser: conv, conversationsPerMonth: computeConversationsPerMonth(c.users, conv, c.timeRange) }))
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth>
                <InputLabel>Time range</InputLabel>
                <Select
                  label="Time range"
                  value={estimateConfig.timeRange}
                  onChange={(e) => {
                    const tr = e.target.value as TimeRange
                    setEstimateConfig((c) => ({ ...c, timeRange: tr, conversationsPerMonth: computeConversationsPerMonth(c.users, c.conversationsPerUser, tr) }))
                  }}
                >
                  <MenuItem value="day">Per day</MenuItem>
                  <MenuItem value="week">Per week</MenuItem>
                  <MenuItem value="month">Per month</MenuItem>
                  <MenuItem value="year">Per year</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          {estimateConfig.conversationsPerMonth > 0 && (
            <Chip
              label={`≈ ${estimateConfig.conversationsPerMonth.toLocaleString()} conversations / month`}
              color="primary"
              variant="outlined"
              sx={{ mt: 2 }}
            />
          )}
        </Paper>

        {/* Agents */}
        <Paper sx={{ p: 2.5 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h6">Agents</Typography>
              <Typography variant="body2" color="text.secondary">Each agent is a cost line item. Add the LLM agents in your system.</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              {agents.length > 1 && (
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Bulk model</InputLabel>
                  <Select label="Bulk model" value="" onChange={(e) => { if (e.target.value) bulkChangeModel(String(e.target.value)) }}>
                    {modelOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
              <Button startIcon={<AddRounded />} variant="contained" onClick={addAgent}>Add agent</Button>
            </Stack>
          </Stack>

          {agents.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderStyle: 'dashed' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Get started</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Load a sample architecture to explore, or add your first agent manually.</Typography>
              <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center' }}>
                <Button variant="contained" startIcon={<ScienceRounded />} onClick={onLoadSample}>Load a sample</Button>
                <Button variant="outlined" startIcon={<AddRounded />} onClick={addAgent}>Add agent</Button>
              </Stack>
            </Paper>
          ) : (
            <Stack spacing={2}>
              {agents.map((agent) => renderAgentCard(agent, estimate.agents.find((a) => a.id === agent.id)?.costPerMonth ?? 0))}
            </Stack>
          )}
        </Paper>

        {/* Connections */}
        {agents.length >= 2 && (
        <Paper sx={{ p: 2.5 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h6">Connections</Typography>
              <Typography variant="body2" color="text.secondary">Define how agents hand off work to each other.</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Traffic % is an absolute probability — "50%" means 50% of conversations trigger that agent. Values don't need to sum to 100% because one conversation can trigger multiple specialists.
              </Typography>
            </Box>
            <Button startIcon={<AddRounded />} variant="outlined" onClick={addEdge}>Add connection</Button>
          </Stack>
          {edges.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No connections. Each agent operates independently.</Typography>
          ) : (
            <Stack spacing={1.5}>
              {edges.map((edge) => (
                <Paper key={edge.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel>From</InputLabel>
                      <Select label="From" value={edge.sourceId} onChange={(e) => updateEdge(edge.id, { sourceId: String(e.target.value) })}>
                        {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <Typography color="text.secondary">→</Typography>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel>To</InputLabel>
                      <Select label="To" value={edge.targetId} onChange={(e) => updateEdge(edge.id, { targetId: String(e.target.value) })}>
                        {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <TextField size="small" type="number" label="Traffic %" value={Math.round(edge.weight * 100)} sx={{ width: 100 }} slotProps={{ htmlInput: { step: 5, min: 0, max: 100 } }} onChange={(e) => updateEdge(edge.id, { weight: Math.max(0, Math.min(1, toNumber(e.target.value, edge.weight * 100) / 100)) })} />
                    <IconButton size="small" color="error" onClick={() => removeEdge(edge.id)}><DeleteOutlineRounded fontSize="small" /></IconButton>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
          {/* Connection weight validation */}
          {edges.length > 0 && (() => {
            const notes: string[] = []
            totalOutgoingTraffic.forEach((total, agentId) => {
              const name = agents.find((a) => a.id === agentId)?.name ?? agentId
              notes.push(`${name}: ${Math.round(total * 100)}% outgoing`)
            })
            return notes.length > 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Traffic summary: {notes.join(' · ')}
              </Typography>
            ) : null
          })()}
        </Paper>
        )}
      </Stack>
    </Grid>
  )
}
