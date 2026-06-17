/**
 * AgentEditDialog — Reusable modal for editing agent parameters.
 * Used from both the Calculator tab and the Topology tab.
 */
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import type { Agent } from '../features/topology/types'
import { MODEL_OPTIONS } from '../features/topology/config'

type Props = {
  agent: Agent | null
  open: boolean
  onClose: () => void
  onSave: (id: string, patch: Partial<Agent>) => void
  onDelete?: (id: string) => void
  /** Optional list of all model options (including custom) */
  modelOptions?: { value: string; label: string }[]
}

export function AgentEditDialog({ agent, open, onClose, onSave, onDelete, modelOptions }: Props) {
  if (!agent) return null

  const models = modelOptions ?? MODEL_OPTIONS
  const update = (patch: Partial<Agent>) => onSave(agent.id, patch)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Edit Agent</Typography>
            <Chip size="small" label={agent.ragEnabled ? 'RAG' : agent.mcpCalls > 0 ? 'MCP' : 'LLM'} color={agent.ragEnabled ? 'info' : agent.mcpCalls > 0 ? 'warning' : 'default'} variant="outlined" />
          </Stack>
          <Typography variant="caption" color="text.secondary">{agent.id.slice(0, 12)}</Typography>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={2.5}>
          {/* Basic info */}
          <Grid container spacing={2}>
            <Grid size={8}>
              <TextField
                size="small"
                label="Agent Name"
                value={agent.name}
                onChange={(e) => update({ name: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid size={4}>
              <FormControl size="small" fullWidth>
                <InputLabel>Model</InputLabel>
                <Select label="Model" value={agent.model} onChange={(e) => update({ model: String(e.target.value) })}>
                  {models.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Divider />

          {/* Token configuration */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tokens per Call</Typography>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={4}>
                <TextField size="small" type="number" label="Input tokens" value={agent.inputTokensPerCall} onChange={(e) => update({ inputTokensPerCall: Math.max(0, Math.round(Number(e.target.value) || 0)) })} fullWidth />
              </Grid>
              <Grid size={4}>
                <TextField size="small" type="number" label="Output tokens" value={agent.outputTokensPerCall} onChange={(e) => update({ outputTokensPerCall: Math.max(0, Math.round(Number(e.target.value) || 0)) })} fullWidth />
              </Grid>
              <Grid size={4}>
                <TextField size="small" type="number" label="Calls/conv" value={agent.callsPerConversation} onChange={(e) => update({ callsPerConversation: Math.max(1, Math.round(Number(e.target.value) || 1)) })} fullWidth />
              </Grid>
            </Grid>
          </Box>

          {/* Advanced: History + Caching */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>Advanced</Typography>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={6}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>History growth factor</Typography>
                <Slider
                  size="small"
                  value={agent.historyGrowthFactor}
                  min={1}
                  max={3}
                  step={0.1}
                  marks={[{ value: 1, label: '1×' }, { value: 1.5, label: '1.5×' }, { value: 2, label: '2×' }, { value: 3, label: '3×' }]}
                  valueLabelDisplay="auto"
                  onChange={(_, v) => update({ historyGrowthFactor: v as number })}
                />
              </Grid>
              <Grid size={6}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Prompt cache %</Typography>
                <Slider
                  size="small"
                  value={agent.promptCachePercent}
                  min={0}
                  max={100}
                  step={5}
                  marks={[{ value: 0, label: '0%' }, { value: 50, label: '50%' }, { value: 100, label: '100%' }]}
                  valueLabelDisplay="auto"
                  onChange={(_, v) => update({ promptCachePercent: v as number })}
                />
              </Grid>
            </Grid>
          </Box>

          <Divider />

          {/* RAG */}
          <Box>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>RAG Retrieval</Typography>
              <FormControlLabel
                control={<Switch size="small" checked={agent.ragEnabled} onChange={(e) => update({ ragEnabled: e.target.checked })} />}
                label=""
              />
            </Stack>
            {agent.ragEnabled && (
              <Grid container spacing={2}>
                <Grid size={4}>
                  <TextField size="small" type="number" label="Chunks" value={agent.ragChunks} onChange={(e) => update({ ragChunks: Math.max(0, Math.round(Number(e.target.value) || 0)) })} fullWidth />
                </Grid>
                <Grid size={4}>
                  <TextField size="small" type="number" label="Tokens/chunk" value={agent.ragChunkTokens} onChange={(e) => update({ ragChunkTokens: Math.max(0, Math.round(Number(e.target.value) || 0)) })} fullWidth />
                </Grid>
                <Grid size={4}>
                  <TextField size="small" type="number" label="Embedding tok" value={agent.ragEmbeddingTokens} onChange={(e) => update({ ragEmbeddingTokens: Math.max(0, Math.round(Number(e.target.value) || 0)) })} fullWidth />
                </Grid>
              </Grid>
            )}
          </Box>

          {/* MCP Tools */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1, display: 'block' }}>MCP Tool Calls</Typography>
            <Grid container spacing={2}>
              <Grid size={4}>
                <TextField size="small" type="number" label="MCP calls" value={agent.mcpCalls} onChange={(e) => update({ mcpCalls: Math.max(0, Math.round(Number(e.target.value) || 0)) })} fullWidth />
              </Grid>
              <Grid size={4}>
                <TextField size="small" type="number" label="MCP input tok" value={agent.mcpInputTokensPerCall} onChange={(e) => update({ mcpInputTokensPerCall: Math.max(0, Math.round(Number(e.target.value) || 0)) })} fullWidth disabled={agent.mcpCalls === 0} />
              </Grid>
              <Grid size={4}>
                <TextField size="small" type="number" label="MCP output tok" value={agent.mcpOutputTokensPerCall} onChange={(e) => update({ mcpOutputTokensPerCall: Math.max(0, Math.round(Number(e.target.value) || 0)) })} fullWidth disabled={agent.mcpCalls === 0} />
              </Grid>
            </Grid>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        {onDelete ? (
          <Button size="small" color="error" variant="outlined" onClick={() => { onDelete(agent.id); onClose() }}>
            Delete Agent
          </Button>
        ) : <Box />}
        <Button variant="contained" onClick={onClose} disableElevation sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  )
}
