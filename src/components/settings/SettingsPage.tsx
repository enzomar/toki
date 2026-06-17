/**
 * SettingsPage — Combines Pricing configuration + Token Tool in a tabbed layout.
 */
import { useState } from 'react'
import {
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import type { Dispatch, SetStateAction } from 'react'
import type { Agent, WorkspacePricing } from '../../features/topology/types'
import { getTokenEstimateDetails } from '../../features/topology/utils'
import { PricingTab } from '../PricingTab'
import { PageHeader } from '../layout/PageHeader'

type Props = {
  pricing: WorkspacePricing
  setPricing: Dispatch<SetStateAction<WorkspacePricing>>
  agents: Agent[]
  modelOptions: Array<{ value: string; label: string }>
  newModelName: string
  setNewModelName: (name: string) => void
}

export function SettingsPage({ pricing, setPricing, agents, modelOptions, newModelName, setNewModelName }: Props) {
  const [tab, setTab] = useState<'pricing' | 'token-tool'>('pricing')

  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <PageHeader title="Settings" description="Configure pricing, models, and tools" />

      <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ px: 3, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(19,34,56,0.02)' }}
          >
            <Tab label="Model Pricing" value="pricing" />
            <Tab label="Token Tool" value="token-tool" />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {tab === 'pricing' ? (
              <PricingTab
                pricing={pricing}
                setPricing={setPricing}
                agents={agents}
                modelOptions={modelOptions}
                newModelName={newModelName}
                setNewModelName={setNewModelName}
              />
            ) : (
              <TokenToolSection />
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}

function TokenToolSection() {
  const [text, setText] = useState('')
  const details = getTokenEstimateDetails(text)

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 800 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Token Converter</Typography>
        <Typography variant="body2" color="text.secondary">
          Paste any text, JSON, prompt template, or system message to estimate its token count.
          Use this to determine the right values for your agent configurations.
        </Typography>
      </Box>

      <TextField
        fullWidth
        multiline
        minRows={8}
        maxRows={20}
        placeholder={'Paste your text here...\n\nExamples:\n- A system prompt\n- A JSON API response\n- A user message with context'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
        <Chip label={`${details.tokens.toLocaleString()} tokens`} color="primary" sx={{ fontWeight: 700, fontSize: 15 }} />
        <Chip label={`${details.words.toLocaleString()} words`} variant="outlined" />
        <Chip label={`${details.characters.toLocaleString()} characters`} variant="outlined" />
      </Stack>

      <Divider />

      <Typography variant="caption" color="text.secondary">
        Token estimates use a lightweight character + word heuristic. Accuracy is within ~10% of tiktoken for English text.
        Good enough for cost planning — not for exact API billing.
      </Typography>
    </Stack>
  )
}
