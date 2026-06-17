/**
 * AgentSection — Agent list with progressive disclosure.
 * Basic fields always visible, advanced (MCP, RAG, history) expand on demand.
 */
import { useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import {
  AddRounded,
  DeleteOutlineRounded,
  ExpandMoreRounded,
  TuneRounded,
} from '@mui/icons-material'
import type { Agent } from '../../features/topology/types'
import { getModelLabel, toNumber } from '../../features/topology/utils'
import { TokenToolInlineButton } from '../TokenTool'

type Props = {
  agents: Agent[]
  modelOptions: Array<{ value: string; label: string }>
  addAgent: () => void
  removeAgent: (id: string) => void
  updateAgent: (id: string, patch: Partial<Agent>) => void
  formatCost: (v: number) => string
  getAgentCost: (id: string) => number
  onLoadSample: (e: React.MouseEvent<HTMLElement>) => void
  bulkChangeModel: (model: string) => void
}

export function AgentSection({
  agents,
  modelOptions,
  addAgent,
  removeAgent,
  updateAgent,
  formatCost,
  getAgentCost,
  onLoadSample,
  bulkChangeModel,
}: Props) {
  return (
    <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Agents</Typography>
        <Stack direction="row" spacing={1}>
          {agents.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Bulk model</InputLabel>
              <Select label="Bulk model" value="" onChange={(e) => { if (e.target.value) bulkChangeModel(String(e.target.value)) }}>
                {modelOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <Button startIcon={<AddRounded />} variant="contained" size="small" onClick={addAgent}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
            Add agent
          </Button>
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Each agent is a cost line item. Configure the LLM agents in your AI system.
      </Typography>

      {agents.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed', borderRadius: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Get started</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Load a sample architecture or add your first agent.
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center' }}>
            <Button variant="outlined" onClick={onLoadSample}>Load sample</Button>
            <Button variant="contained" startIcon={<AddRounded />} onClick={addAgent}
              sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
              Add agent
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              costPerMonth={getAgentCost(agent.id)}
              formatCost={formatCost}
              modelOptions={modelOptions}
              onUpdate={(patch) => updateAgent(agent.id, patch)}
              onRemove={() => removeAgent(agent.id)}
            />
          ))}
        </Stack>
      )}
    </Paper>
  )
}

// --- Agent Card with progressive disclosure ---

function AgentCard(props: {
  agent: Agent
  costPerMonth: number
  formatCost: (v: number) => string
  modelOptions: Array<{ value: string; label: string }>
  onUpdate: (patch: Partial<Agent>) => void
  onRemove: () => void
}) {
  const { agent } = props
  const [expanded, setExpanded] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <Card variant="outlined" sx={{ borderRadius: 2.5, borderColor: 'rgba(19, 34, 56, 0.08)', '&:hover': { borderColor: 'rgba(15, 118, 110, 0.3)' }, transition: 'border-color 0.2s' }}>
      {/* Header — always visible */}
      <Stack
        direction="row"
        sx={{ px: 2, py: 1.5, justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <IconButton size="small" sx={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <ExpandMoreRounded fontSize="small" />
          </IconButton>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{agent.name}</Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
              <Chip size="small" label={getModelLabel(agent.model)} variant="outlined" sx={{ height: 18, fontSize: 10 }} />
              {agent.ragEnabled && <Chip size="small" label="RAG" color="success" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
              {agent.mcpCalls > 0 && <Chip size="small" label={`MCP ×${agent.mcpCalls}`} color="warning" variant="outlined" sx={{ height: 18, fontSize: 10 }} />}
            </Stack>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <Chip label={props.formatCost(props.costPerMonth) + '/mo'} color="primary" size="small" sx={{ fontWeight: 700, fontSize: 12 }} />
          <IconButton size="small" color="error" onClick={props.onRemove}><DeleteOutlineRounded fontSize="small" /></IconButton>
        </Stack>
      </Stack>

      {/* Expanded body */}
      <Collapse in={expanded}>
        <CardContent sx={{ pt: 0, pb: '16px !important' }}>
          {/* Basic fields — always shown when expanded */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField fullWidth size="small" label="Name" value={agent.name}
                onChange={(e) => props.onUpdate({ name: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Model</InputLabel>
                <Select label="Model" value={agent.model} onChange={(e) => props.onUpdate({ model: String(e.target.value) })}>
                  {props.modelOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              <Stack direction="row" sx={{ alignItems: 'flex-start' }}>
                <TextField fullWidth size="small" type="number" label="Input tokens"
                  value={agent.inputTokensPerCall}
                  onChange={(e) => props.onUpdate({ inputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.inputTokensPerCall))) })} />
                <TokenToolInlineButton onResult={(tokens) => props.onUpdate({ inputTokensPerCall: tokens })} label="Set as input" />
              </Stack>
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              <Stack direction="row" sx={{ alignItems: 'flex-start' }}>
                <TextField fullWidth size="small" type="number" label="Output tokens"
                  value={agent.outputTokensPerCall}
                  onChange={(e) => props.onUpdate({ outputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.outputTokensPerCall))) })} />
                <TokenToolInlineButton onResult={(tokens) => props.onUpdate({ outputTokensPerCall: tokens })} label="Set as output" />
              </Stack>
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              <TextField fullWidth size="small" type="number" label="Calls/conv"
                value={agent.callsPerConversation}
                onChange={(e) => props.onUpdate({ callsPerConversation: Math.max(1, Math.round(toNumber(e.target.value, agent.callsPerConversation))) })} />
            </Grid>
          </Grid>

          {/* Advanced toggle */}
          <Button
            size="small"
            startIcon={<TuneRounded sx={{ fontSize: 14 }} />}
            onClick={() => setShowAdvanced((v) => !v)}
            sx={{ mt: 2, fontSize: 12, color: 'text.secondary', textTransform: 'none' }}
          >
            {showAdvanced ? 'Hide advanced settings' : 'MCP tools, RAG, caching...'}
          </Button>

          <Collapse in={showAdvanced}>
            <Stack spacing={2} sx={{ mt: 1.5 }}>
              {/* MCP Tools */}
              <Box sx={{ p: 2, bgcolor: 'rgba(217, 119, 6, 0.03)', border: '1px solid rgba(217, 119, 6, 0.1)', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5 }}>MCP Tool Calls</Typography>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 4 }}>
                    <TextField fullWidth size="small" type="number" label="Tool calls"
                      value={agent.mcpCalls}
                      onChange={(e) => props.onUpdate({ mcpCalls: Math.max(0, Math.round(toNumber(e.target.value, agent.mcpCalls))) })} />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <TextField fullWidth size="small" type="number" label="Input tok/call"
                      value={agent.mcpInputTokensPerCall} disabled={agent.mcpCalls === 0}
                      onChange={(e) => props.onUpdate({ mcpInputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.mcpInputTokensPerCall))) })} />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <TextField fullWidth size="small" type="number" label="Output tok/call"
                      value={agent.mcpOutputTokensPerCall} disabled={agent.mcpCalls === 0}
                      onChange={(e) => props.onUpdate({ mcpOutputTokensPerCall: Math.max(0, Math.round(toNumber(e.target.value, agent.mcpOutputTokensPerCall))) })} />
                  </Grid>
                </Grid>
              </Box>

              {/* RAG */}
              <Box sx={{ p: 2, bgcolor: 'rgba(47, 133, 90, 0.03)', border: '1px solid rgba(47, 133, 90, 0.1)', borderRadius: 2 }}>
                <FormControlLabel
                  control={<Switch size="small" checked={agent.ragEnabled} onChange={(e) => props.onUpdate({
                    ragEnabled: e.target.checked,
                    ragChunks: e.target.checked && agent.ragChunks === 0 ? 4 : agent.ragChunks,
                    ragChunkTokens: e.target.checked && agent.ragChunkTokens === 0 ? 150 : agent.ragChunkTokens,
                    ragEmbeddingTokens: e.target.checked && agent.ragEmbeddingTokens === 0 ? 60 : agent.ragEmbeddingTokens,
                  })} />}
                  label={<Typography variant="caption" sx={{ fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: 0.5 }}>RAG Retrieval</Typography>}
                />
                {agent.ragEnabled && (
                  <Grid container spacing={2} sx={{ mt: 0.5 }}>
                    <Grid size={{ xs: 4 }}>
                      <TextField fullWidth size="small" type="number" label="Chunks"
                        value={agent.ragChunks}
                        onChange={(e) => props.onUpdate({ ragChunks: Math.max(0, Math.round(toNumber(e.target.value, agent.ragChunks))) })} />
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <TextField fullWidth size="small" type="number" label="Tokens/chunk"
                        value={agent.ragChunkTokens}
                        onChange={(e) => props.onUpdate({ ragChunkTokens: Math.max(0, Math.round(toNumber(e.target.value, agent.ragChunkTokens))) })} />
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <TextField fullWidth size="small" type="number" label="Embedding tok"
                        value={agent.ragEmbeddingTokens}
                        onChange={(e) => props.onUpdate({ ragEmbeddingTokens: Math.max(0, Math.round(toNumber(e.target.value, agent.ragEmbeddingTokens))) })} />
                    </Grid>
                  </Grid>
                )}
              </Box>

              {/* History & Cache */}
              <Box sx={{ p: 2, bgcolor: 'rgba(19, 34, 56, 0.02)', border: '1px solid rgba(19, 34, 56, 0.06)', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>Context & Caching</Typography>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 6 }}>
                    <TextField fullWidth size="small" type="number" label="History growth factor"
                      value={agent.historyGrowthFactor}
                      helperText="1.0 = flat, 1.5 = 50% growth/turn"
                      slotProps={{ htmlInput: { step: 0.1, min: 1, max: 3 } }}
                      onChange={(e) => props.onUpdate({ historyGrowthFactor: Math.max(1, Math.min(3, toNumber(e.target.value, agent.historyGrowthFactor))) })} />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField fullWidth size="small" type="number" label="Cache hit rate (%)"
                      value={agent.promptCachePercent}
                      helperText="% of input from cache (90% savings)"
                      slotProps={{ htmlInput: { step: 5, min: 0, max: 100 } }}
                      onChange={(e) => props.onUpdate({ promptCachePercent: Math.max(0, Math.min(100, Math.round(toNumber(e.target.value, agent.promptCachePercent)))) })} />
                  </Grid>
                </Grid>
              </Box>
            </Stack>
          </Collapse>
        </CardContent>
      </Collapse>
    </Card>
  )
}
