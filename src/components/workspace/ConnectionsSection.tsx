/**
 * ConnectionsSection — Agent connections editor.
 * Shows a row for each connection with From → To and Traffic %.
 */
import {
  Box,
  Button,
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
import { AddRounded, DeleteOutlineRounded } from '@mui/icons-material'
import type { Agent, Edge } from '../../features/topology/types'
import { toNumber } from '../../features/topology/utils'

type Props = {
  agents: Agent[]
  edges: Edge[]
  addEdge: () => void
  updateEdge: (id: string, patch: Partial<Edge>) => void
  removeEdge: (id: string) => void
}

export function ConnectionsSection({ agents, edges, addEdge, updateEdge, removeEdge }: Props) {
  if (agents.length < 2) return null

  return (
    <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Connections</Typography>
          <Typography variant="body2" color="text.secondary">
            Traffic % is absolute probability — each connection is independent.
          </Typography>
        </Box>
        <Button size="small" startIcon={<AddRounded />} variant="outlined" onClick={addEdge}>
          Add
        </Button>
      </Stack>

      {edges.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No connections defined. Each agent runs independently. Click "Add" to connect agents.
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
    </Paper>
  )
}
