/**
 * ConnectionsSection — Agent connections editor with clear visual hierarchy.
 * Only shown when 2+ agents exist.
 */
import {
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { AddRounded, DeleteOutlineRounded, ExpandMoreRounded } from '@mui/icons-material'
import type { Agent, Edge } from '../../features/topology/types'
import { toNumber } from '../../features/topology/utils'
import { useState } from 'react'

type Props = {
  agents: Agent[]
  edges: Edge[]
  addEdge: () => void
  updateEdge: (id: string, patch: Partial<Edge>) => void
  removeEdge: (id: string) => void
}

export function ConnectionsSection({ agents, edges, addEdge, updateEdge, removeEdge }: Props) {
  const [expanded, setExpanded] = useState(edges.length > 0)

  if (agents.length < 2) return null

  return (
    <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <IconButton size="small" sx={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <ExpandMoreRounded fontSize="small" />
          </IconButton>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Connections</Typography>
            <Typography variant="body2" color="text.secondary">
              Define how agents route traffic to each other.
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          {edges.length > 0 && (
            <Chip size="small" label={`${edges.length} connection${edges.length > 1 ? 's' : ''}`} variant="outlined" />
          )}
          <Button size="small" startIcon={<AddRounded />} variant="outlined" onClick={addEdge}>Add</Button>
        </Stack>
      </Stack>

      <Collapse in={expanded}>
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Traffic % is absolute probability — "50%" means half of all conversations trigger that downstream agent. Values don't need to sum to 100%.
          </Typography>

          {edges.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No connections defined. Each agent runs independently.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {edges.map((edge) => (
                <Paper key={edge.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <FormControl size="small" sx={{ minWidth: 130, flex: 1 }}>
                      <InputLabel>From</InputLabel>
                      <Select label="From" value={edge.sourceId} onChange={(e) => updateEdge(edge.id, { sourceId: String(e.target.value) })}>
                        {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <Typography color="text.secondary" sx={{ fontSize: 18 }}>→</Typography>
                    <FormControl size="small" sx={{ minWidth: 130, flex: 1 }}>
                      <InputLabel>To</InputLabel>
                      <Select label="To" value={edge.targetId} onChange={(e) => updateEdge(edge.id, { targetId: String(e.target.value) })}>
                        {agents.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <TextField
                      size="small" type="number" label="Traffic %"
                      value={Math.round(edge.weight * 100)}
                      sx={{ width: 90 }}
                      slotProps={{ htmlInput: { step: 5, min: 0, max: 100 } }}
                      onChange={(e) => updateEdge(edge.id, { weight: Math.max(0, Math.min(1, toNumber(e.target.value, edge.weight * 100) / 100)) })}
                    />
                    <IconButton size="small" color="error" onClick={() => removeEdge(edge.id)}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Paper>
  )
}
