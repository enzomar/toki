/**
 * PricingTab — Professional model pricing configuration.
 * Features: search/filter, provider grouping, tier badges, cached pricing, batch toggle.
 */
import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  DeleteOutlineRounded,
  SearchRounded,
  ExpandMoreRounded,
  ExpandLessRounded,
  InfoOutlined,
  EditRounded,
} from '@mui/icons-material'
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

// Provider detection
function detectProvider(model: string): string {
  if (model.startsWith('gpt-') || model.startsWith('o3') || model.startsWith('o4')) return 'OpenAI'
  if (model.startsWith('claude-')) return 'Anthropic'
  if (model.startsWith('gemini-')) return 'Google'
  if (model.startsWith('mistral-')) return 'Mistral'
  if (model.startsWith('llama-') || model.startsWith('meta-')) return 'Meta'
  if (model.startsWith('command-') || model.startsWith('cohere-')) return 'Cohere'
  return 'Custom'
}

function groupByProvider(models: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const model of models) {
    const provider = detectProvider(model)
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
  Meta: '#0668e1',
  Cohere: '#39594d',
  Custom: '#6366f1',
}

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  OpenAI: 'GPT-4.1, o3/o4 reasoning models — best for structured output and tool use',
  Anthropic: 'Claude Sonnet/Opus/Haiku — strong reasoning, long context, code generation',
  Google: 'Gemini models — multimodal, large context windows',
  Mistral: 'Mistral models — fast, cost-effective European provider',
  Meta: 'LLaMA models — open-weight, self-hostable',
  Cohere: 'Command models — enterprise RAG and search',
  Custom: 'User-defined models with custom pricing',
}

/** Tier badge for cost positioning */
function getTierBadge(inPrice: number): { label: string; color: string } {
  if (inPrice >= 10) return { label: 'Premium', color: '#7c3aed' }
  if (inPrice >= 2) return { label: 'Standard', color: '#0891b2' }
  if (inPrice >= 0.5) return { label: 'Economy', color: '#059669' }
  return { label: 'Nano', color: '#64748b' }
}

export function PricingTab({ pricing, setPricing, agents, newModelName, setNewModelName }: PricingTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [showAddModel, setShowAddModel] = useState(false)
  const [editingModel, setEditingModel] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const allModels = Object.keys(pricing.models)
  const modelGroups = useMemo(() => groupByProvider(allModels), [allModels])

  // Filter models by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return modelGroups
    const q = searchQuery.toLowerCase()
    const filtered = new Map<string, string[]>()
    for (const [provider, models] of modelGroups) {
      const matching = models.filter(
        (m) =>
          m.toLowerCase().includes(q) ||
          getModelLabel(m).toLowerCase().includes(q) ||
          provider.toLowerCase().includes(q)
      )
      if (matching.length > 0) filtered.set(provider, matching)
    }
    return filtered
  }, [modelGroups, searchQuery])

  // Stats
  const totalModels = allModels.length
  const activeModels = allModels.filter((m) => agents.some((a) => a.model === m)).length
  const providerCount = modelGroups.size

  const toggleProvider = (provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  const addModel = () => {
    const name = newModelName.trim()
    if (!name) return
    if (pricing.models[name]) return
    setPricing((c) => ({ ...c, models: { ...c.models, [name]: { in: 1, out: 4 } } }))
    setNewModelName('')
    setShowAddModel(false)
  }

  const startRename = (model: string) => {
    setEditingModel(model)
    setEditValue(model)
  }

  const commitRename = () => {
    if (!editingModel) return
    const newName = editValue.trim()
    if (!newName || newName === editingModel) { setEditingModel(null); return }
    if (pricing.models[newName]) { setEditingModel(null); return } // already exists
    setPricing((c) => {
      const next = { ...c.models }
      next[newName] = next[editingModel]
      delete next[editingModel]
      return { ...c, models: next }
    })
    setEditingModel(null)
  }

  return (
    <Stack spacing={3}>
      {/* Summary Bar */}
      <Paper sx={{ p: 2.5, background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
              Model Pricing
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Configure per-model costs driving deterministic and Monte Carlo forecasts
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Chip
              size="small"
              label={`${totalModels} models`}
              sx={{ fontWeight: 600, bgcolor: '#e2e8f0' }}
            />
            <Chip
              size="small"
              label={`${activeModels} in use`}
              color="primary"
              sx={{ fontWeight: 600 }}
            />
            <Chip
              size="small"
              label={`${providerCount} providers`}
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
        </Stack>
      </Paper>

      {/* Global Settings */}
      <Paper sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Global Cost Settings
        </Typography>
        <Grid container spacing={3}>
          {/* Embedding price */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Embedding
                </Typography>
                <Tooltip title="Cost per 1M embedding tokens. Applied to all RAG retrieval operations." arrow>
                  <InfoOutlined sx={{ fontSize: 14, color: 'text.disabled' }} />
                </Tooltip>
              </Stack>
              <TextField
                fullWidth size="small" type="number"
                label={`${pricing.currency} / 1M tokens`}
                value={pricing.embeddingPricePer1M}
                slotProps={{ htmlInput: { step: 0.001, min: 0 } }}
                onChange={(e) => setPricing((c) => ({ ...c, embeddingPricePer1M: Math.max(0, toNumber(e.target.value, c.embeddingPricePer1M)) }))}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontSize: 10 }}>
                OpenAI ada-002: $0.02/1M · text-embedding-3-small: $0.02/1M
              </Typography>
            </Paper>
          </Grid>

          {/* Volume discount */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Volume Discount
                </Typography>
                <Tooltip title="Enterprise/committed-use discount applied globally. Typical corporate agreements offer 10-30% off list price." arrow>
                  <InfoOutlined sx={{ fontSize: 14, color: 'text.disabled' }} />
                </Tooltip>
              </Stack>
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
                <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 40, color: (pricing.volumeDiscountPercent ?? 0) > 0 ? 'success.main' : 'text.secondary' }}>
                  {pricing.volumeDiscountPercent ?? 0}%
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontSize: 10 }}>
                Applied after per-model rates. Typical: 10-20% for $50k+/yr spend
              </Typography>
            </Paper>
          </Grid>

          {/* Batch pricing */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2 }}>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Batch API
                </Typography>
                <Tooltip title="Batch API offers 50% discount with 24h turnaround. Suitable for non-latency-sensitive workloads like nightly analytics, bulk classification, or offline processing." arrow>
                  <InfoOutlined sx={{ fontSize: 14, color: 'text.disabled' }} />
                </Tooltip>
              </Stack>
              <FormControlLabel
                control={
                  <Switch
                    checked={pricing.useBatchPricing ?? false}
                    onChange={(e) => setPricing((c) => ({ ...c, useBatchPricing: e.target.checked }))}
                    color="success"
                  />
                }
                label={<Typography variant="body2" sx={{ fontWeight: 500 }}>Enable batch pricing (50% off)</Typography>}
                sx={{ mt: 1 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontSize: 10 }}>
                24h SLA turnaround. Best for offline batch jobs.
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Paper>

      {/* Search & Filter Bar */}
      <Paper sx={{ p: 2, position: 'sticky', top: 0, zIndex: 10, borderRadius: 2, boxShadow: 1 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <TextField
            fullWidth size="small"
            placeholder="Search models by name, provider, or identifier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded sx={{ fontSize: 20, color: 'text.disabled' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' } }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={() => setShowAddModel(!showAddModel)}
            sx={{ whiteSpace: 'nowrap', borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            + Add model
          </Button>
        </Stack>

        {/* Add model inline form */}
        <Collapse in={showAddModel}>
          <Box sx={{ mt: 2, p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Add Provider / Model
            </Typography>
            <Stack spacing={1.5} sx={{ maxWidth: 600 }}>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  fullWidth size="small"
                  label="Model identifier"
                  placeholder="e.g. gemini-2.5-pro, llama-3-70b, my-custom-model"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addModel() }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                  helperText="Prefix determines provider (gpt-* = OpenAI, claude-* = Anthropic, gemini-* = Google)"
                />
                <Button
                  variant="contained" onClick={addModel}
                  sx={{ whiteSpace: 'nowrap', borderRadius: 2, textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start', mt: '1px' }}
                >
                  Add
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                New models are added with default pricing ($1/1M in, $4/1M out, 50 tok/sec). Edit after adding.
                To add a new provider, use a unique prefix (e.g. "mycompany-model-v1" will appear under "Custom").
              </Typography>
            </Stack>
          </Box>
        </Collapse>
      </Paper>

      {/* No results */}
      {filteredGroups.size === 0 && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No models match "{searchQuery}". Try a different search or add a custom model.
        </Alert>
      )}

      {/* Provider groups */}
      {Array.from(filteredGroups.entries()).map(([provider, models]) => {
        const isCollapsed = expandedProviders.has(provider)
        const providerColor = PROVIDER_COLORS[provider] || '#64748b'
        const providerDesc = PROVIDER_DESCRIPTIONS[provider] || ''
        const modelsInUse = models.filter((m) => agents.some((a) => a.model === m)).length

        return (
          <Paper key={provider} sx={{ overflow: 'hidden', borderRadius: 2.5, border: '1px solid #e2e8f0' }}>
            {/* Provider header */}
            <Box
              sx={{
                px: 2.5,
                py: 2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                bgcolor: '#fafbfc',
                borderBottom: isCollapsed ? 'none' : '1px solid #e2e8f0',
                '&:hover': { bgcolor: '#f1f5f9' },
                transition: 'background 0.15s',
              }}
              onClick={() => toggleProvider(provider)}
            >
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: providerColor, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{provider}</Typography>
                  <Chip size="small" label={`${models.length}`} sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: `${providerColor}18`, color: providerColor }} />
                  {modelsInUse > 0 && (
                    <Chip size="small" label={`${modelsInUse} active`} color="primary" sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontSize: 11 }}>
                  {providerDesc}
                </Typography>
              </Box>
              <IconButton size="small">
                {isCollapsed ? <ExpandMoreRounded /> : <ExpandLessRounded />}
              </IconButton>
            </Box>

            {/* Model cards */}
            <Collapse in={!isCollapsed}>
              <Box sx={{ p: 2 }}>
                <Grid container spacing={2}>
                  {models.map((model) => {
                    const rates = getPricing(model, pricing.models)
                    const usedBy = agents.filter((a) => a.model === model).length
                    const tier = getTierBadge(rates.in)

                    return (
                      <Grid key={model} size={{ xs: 12, sm: 6, md: 4 }}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            position: 'relative',
                            borderRadius: 2,
                            borderColor: usedBy > 0 ? 'primary.light' : 'divider',
                            borderWidth: usedBy > 0 ? 1.5 : 1,
                            transition: 'box-shadow 0.15s, border-color 0.15s',
                            '&:hover': { boxShadow: 2 },
                          }}
                        >
                          {/* Model header */}
                          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              {editingModel === model ? (
                                <TextField
                                  size="small"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={commitRename}
                                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingModel(null) }}
                                  autoFocus
                                  fullWidth
                                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5, fontSize: 12, fontFamily: 'monospace' } }}
                                />
                              ) : (
                                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 13 }}>
                                    {getModelLabel(model)}
                                  </Typography>
                                  <Chip
                                    size="small"
                                    label={tier.label}
                                    sx={{ height: 18, fontSize: 9, fontWeight: 700, bgcolor: `${tier.color}14`, color: tier.color, border: `1px solid ${tier.color}30` }}
                                  />
                                  <Tooltip title="Rename model identifier">
                                    <IconButton size="small" onClick={() => startRename(model)} sx={{ ml: 0.5, opacity: 0.5, '&:hover': { opacity: 1 } }}>
                                      <EditRounded sx={{ fontSize: 13 }} />
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              )}
                              {editingModel !== model && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, fontFamily: 'monospace' }}>
                                  {model}
                                </Typography>
                              )}
                            </Box>
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                              {usedBy > 0 && (
                                <Chip size="small" label={`${usedBy} agent${usedBy > 1 ? 's' : ''}`} color="primary" sx={{ fontSize: 9, height: 20 }} />
                              )}
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
                                    <DeleteOutlineRounded sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Stack>
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
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                              />
                              <TextField
                                size="small" type="number" fullWidth
                                label="Output $/1M"
                                value={rates.out}
                                slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
                                onChange={(e) => setPricing((c) => ({ ...c, models: { ...c.models, [model]: { ...c.models[model], out: Math.max(0, toNumber(e.target.value, rates.out)) } } }))}
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                              />
                            </Stack>

                            {/* Token speed (per model) */}
                            <TextField
                              size="small" type="number" fullWidth
                              label="Tok/sec (generation speed)"
                              value={rates.tokensPerSecond}
                              slotProps={{ htmlInput: { step: 5, min: 1, max: 500 } }}
                              onChange={(e) => setPricing((c) => ({ ...c, models: { ...c.models, [model]: { ...c.models[model], tokensPerSecond: Math.max(1, Math.round(toNumber(e.target.value, rates.tokensPerSecond))) } } }))}
                              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                            />

                            {/* Cached pricing info */}
                            {rates.cached_in > 0 && rates.cached_in < rates.in && (
                              <Box sx={{ px: 1.5, py: 0.75, bgcolor: 'rgba(5,150,105,0.06)', borderRadius: 1.5, border: '1px solid rgba(5,150,105,0.15)' }}>
                                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                    Cached input
                                  </Typography>
                                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main', fontSize: 11 }}>
                                    ${rates.cached_in.toFixed(2)}/1M ({Math.round((1 - rates.cached_in / rates.in) * 100)}% savings)
                                  </Typography>
                                </Stack>
                              </Box>
                            )}

                            {/* Effective cost summary */}
                            {(pricing.volumeDiscountPercent ?? 0) > 0 && (
                              <Box sx={{ px: 1.5, py: 0.75, bgcolor: '#f8fafc', borderRadius: 1.5 }}>
                                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                    Effective (with {pricing.volumeDiscountPercent}% discount)
                                  </Typography>
                                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 10, color: 'success.main' }}>
                                    ${(rates.in * (1 - (pricing.volumeDiscountPercent ?? 0) / 100)).toFixed(2)} / ${(rates.out * (1 - (pricing.volumeDiscountPercent ?? 0) / 100)).toFixed(2)}
                                  </Typography>
                                </Stack>
                              </Box>
                            )}
                          </Stack>
                        </Paper>
                      </Grid>
                    )
                  })}
                </Grid>
              </Box>
            </Collapse>
          </Paper>
        )
      })}

      {/* Cost comparison hint */}
      <Paper sx={{ p: 2, bgcolor: 'rgba(15,118,110,0.03)', border: '1px solid rgba(15,118,110,0.1)', borderRadius: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <InfoOutlined sx={{ fontSize: 16, color: '#0f766e', mt: 0.25 }} />
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#0f766e', display: 'block' }}>
              Corporate pricing tips
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, lineHeight: 1.5 }}>
              Enterprise agreements typically offer 10-30% volume discounts for committed spend above $50k/year.
              Batch API pricing (50% off) suits workloads with 24h SLA tolerance.
              Prompt caching (configured per agent) reduces input costs by 50-90% for repetitive system prompts.
              Consider mixing model tiers: use Nano/Mini for routing and classification, Standard for core logic, Premium for complex reasoning.
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  )
}
