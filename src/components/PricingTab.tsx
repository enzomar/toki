/**
 * PricingTab — Model pricing configuration with clear visual hierarchy.
 * Groups models by provider, shows cached pricing, batch discount toggle.
 */
import type { Dispatch, SetStateAction } from 'react'
import {
  Box,
  Button,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { DeleteOutlineRounded } from '@mui/icons-material'
import { MODEL_OPTIONS } from '../features/topology/config'
import type { Agent, WorkspacePricing } from '../features/topology/types'
import { getModelLabel, getPricing, toNumber } from '../features/topology/utils'

export interface PricingTabProps {
  pricing: WorkspacePricing
  setPricing: Dispatch<SetStateAction<WorkspacePricing>>
  agents: Agent[]
  modelOptions: Array<{ value: string; label: string }>
  newModelName: string
  setNewModelName: (name: string) => void
}

// Group models by provider prefix
function groupByProvider(models: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const model of models) {
    let provider = 'Custom'
    if (model.startsWith('gpt-') || model.startsWith('o3') || model.startsWith('o4')) provider = 'OpenAI'
    else if (model.startsWith('claude-')) provider = 'Anthropic'
    else if (model.startsWith('gemini-')) provider = 'Google'
    else if (model.startsWith('mistral-')) provider = 'Mistral'
    const arr = groups.get(provider) || []
    arr.push(model)
    groups.set(provider, arr)
  }
  return groups
}

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: '#10a37f',
  Anthropic: '#cc785c',
  Google: '#4285f4',
  Mistral: '#ff7000',
  Custom: '#6366f1',
}

export function PricingTab({ pricing, setPricing, agents, newModelName, setNewModelName }: PricingTabProps) {
  const addModel = () => {
    const name = newModelName.trim()
    if (!name) return
    if (pricing.models[name]) return
    setPricing((c) => ({ ...c, models: { ...c.models, [name]: { in: 1, out: 4 } } }))
    setNewModelName('')
  }

  const modelGroups = groupByProvider(Object.keys(pricing.models))

  return (
    <Stack spacing={3}>
      {/* Header + Global Settings */}
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>Pricing Configuration</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Configure model costs per 1M tokens. These rates drive both deterministic and Monte Carlo cost forecasts.
        </Typography>

        <Grid container spacing={3}>
          {/* Embedding price */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>Embedding</Typography>
              <TextField
                fullWidth size="small" type="number" sx={{ mt: 1 }}
                label="EUR / 1M tokens"
                value={pricing.embeddingPricePer1M}
                slotProps={{ htmlInput: { step: 0.001, min: 0 } }}
                onChange={(e) => setPricing((c) => ({ ...c, embeddingPricePer1M: Math.max(0, toNumber(e.target.value, c.embeddingPricePer1M)) }))}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Applied to all RAG retrieval embedding operations.
              </Typography>
            </Paper>
          </Grid>

          {/* Volume discount */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>Volume Discount</Typography>
              <Stack direction="row" sx={{ alignItems: 'center', mt: 1.5, gap: 1.5 }}>
                <Slider
                  size="small"
                  value={pricing.volumeDiscountPercent ?? 0}
                  min={0} max={50} step={5}
                  marks={[{ value: 0, label: '0%' }, { value: 25, label: '25%' }, { value: 50, label: '50%' }]}
                  valueLabelDisplay="auto"
                  onChange={(_, v) => setPricing((c) => ({ ...c, volumeDiscountPercent: v as number }))}
                  sx={{ flex: 1 }}
                />
                <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 40 }}>
                  {pricing.volumeDiscountPercent ?? 0}%
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Enterprise/committed-use discount applied to all models.
              </Typography>
            </Paper>
          </Grid>

          {/* Batch pricing */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>Batch API</Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={pricing.useBatchPricing ?? false}
                    onChange={(e) => setPricing((c) => ({ ...c, useBatchPricing: e.target.checked }))}
                  />
                }
                label={<Typography variant="body2">Use batch pricing (50% off)</Typography>}
                sx={{ mt: 1 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Batch API offers 50% discount with 24h turnaround. Enable if your workload isn't latency-sensitive.
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Paper>

      {/* Model cards grouped by provider */}
      {Array.from(modelGroups.entries()).map(([provider, models]) => (
        <Paper key={provider} sx={{ p: 2.5 }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: PROVIDER_COLORS[provider] || '#64748b' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{provider}</Typography>
            <Chip size="small" label={`${models.length} model${models.length > 1 ? 's' : ''}`} variant="outlined" sx={{ ml: 'auto' }} />
          </Stack>

          <Grid container spacing={2}>
            {models.map((model) => {
              const rates = getPricing(model, pricing.models)
              const usedBy = agents.filter((a) => a.model === model).length
              const isBuiltIn = MODEL_OPTIONS.some((o) => o.value === model)
              const cachedPrice = pricing.models[model]?.cached_in

              return (
                <Grid key={model} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Paper variant="outlined" sx={{ p: 2, position: 'relative', borderColor: usedBy > 0 ? 'primary.light' : 'divider' }}>
                    {/* Model name + badge */}
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{getModelLabel(model)}</Typography>
                        <Typography variant="caption" color="text.secondary">{model}</Typography>
                      </Box>
                      {usedBy > 0 && (
                        <Chip size="small" label={`${usedBy} agent${usedBy > 1 ? 's' : ''}`} color="primary" sx={{ fontSize: 10 }} />
                      )}
                    </Stack>

                    {/* Price inputs */}
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          size="small" type="number" fullWidth
                          label="Input $/1M"
                          value={rates.in}
                          slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
                          onChange={(e) => setPricing((c) => ({ ...c, models: { ...c.models, [model]: { ...c.models[model], in: Math.max(0, toNumber(e.target.value, rates.in)) } } }))}
                        />
                        <TextField
                          size="small" type="number" fullWidth
                          label="Output $/1M"
                          value={rates.out}
                          slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
                          onChange={(e) => setPricing((c) => ({ ...c, models: { ...c.models, [model]: { ...c.models[model], out: Math.max(0, toNumber(e.target.value, rates.out)) } } }))}
                        />
                      </Stack>

                      {/* Cached price (if set) */}
                      {cachedPrice !== undefined && (
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, minWidth: 55 }}>Cached:</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.main' }}>
                            €{cachedPrice.toFixed(2)}/1M ({Math.round((1 - cachedPrice / rates.in) * 100)}% off)
                          </Typography>
                        </Stack>
                      )}
                    </Stack>

                    {/* Delete (custom models only) */}
                    {!isBuiltIn && (
                      <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                        <Tooltip title={usedBy > 0 ? 'Remove agents using this model first' : 'Remove model'}>
                          <span>
                            <IconButton
                              size="small" color="error" disabled={usedBy > 0}
                              onClick={() => setPricing((c) => {
                                const next = { ...c.models }
                                delete next[model]
                                return { ...c, models: next }
                              })}
                            >
                              <DeleteOutlineRounded sx={{ fontSize: 16 }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    )}
                  </Paper>
                </Grid>
              )
            })}
          </Grid>
        </Paper>
      ))}

      {/* Add custom model */}
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Add custom model</Typography>
        <Stack direction="row" spacing={1.5} sx={{ maxWidth: 500 }}>
          <TextField
            fullWidth size="small"
            label="Model identifier"
            placeholder="e.g. gemini-2.5-pro"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addModel() }}
            helperText="Enter the model API name. You can set pricing after adding."
          />
          <Button variant="contained" onClick={addModel} sx={{ whiteSpace: 'nowrap', alignSelf: 'flex-start', mt: '1px' }}>
            Add
          </Button>
        </Stack>
      </Paper>
    </Stack>
  )
}
