/**
 * TokenToolPage — Standalone page for text-to-token estimation.
 * Accessible directly from the nav for quick access.
 */
import { useState } from 'react'
import { Box, Chip, Divider, Paper, Stack, TextField, Typography } from '@mui/material'
import { getTokenEstimateDetails } from '../../features/topology/utils'
import { PageHeader } from '../layout/PageHeader'

export function TokenToolPage() {
  const [text, setText] = useState('')
  const details = getTokenEstimateDetails(text)

  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <PageHeader
        title="Token Tool"
        description="Estimate token counts from text — use this to configure your agent parameters accurately"
      />

      <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
        <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, maxWidth: 800 }}>
          <TextField
            fullWidth
            multiline
            minRows={10}
            maxRows={24}
            placeholder={'Paste your text here...\n\nExamples:\n- A system prompt\n- A JSON API response\n- A user message with context\n- A retrieved RAG chunk\n- An MCP tool schema'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            sx={{ mb: 2.5 }}
          />

          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', mb: 2.5 }}>
            <Chip label={`${details.tokens.toLocaleString()} tokens`} color="primary" sx={{ fontWeight: 700, fontSize: 16, height: 36, px: 1 }} />
            <Chip label={`${details.words.toLocaleString()} words`} variant="outlined" sx={{ height: 36 }} />
            <Chip label={`${details.characters.toLocaleString()} characters`} variant="outlined" sx={{ height: 36 }} />
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="body2" color="text.secondary">
            Token estimates use a character + word heuristic accurate within ~10% of tiktoken for English text.
            Use this to measure your actual prompts, system messages, and tool schemas — then plug those values
            into your agent configurations for more accurate cost forecasts.
          </Typography>
        </Paper>
      </Box>
    </Box>
  )
}
