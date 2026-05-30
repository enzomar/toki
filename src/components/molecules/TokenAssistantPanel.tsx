import { Box, Button, Chip, Paper, Stack, TextField, Typography } from '@mui/material'
import type { TokenSampleState } from '../../features/topology/types'
import { getTokenEstimateSummary } from '../../features/topology/utils'

type TokenAssistantPanelProps = {
  tokenSample: TokenSampleState
  onTokenSampleChange: (field: keyof TokenSampleState, value: string) => void
  onApplyEstimate?: (field: 'inputTokens' | 'outputTokens', value: number) => void
  title?: string
  description?: string
  showContainer?: boolean
  showApplyActions?: boolean
}

export function TokenAssistantPanel({
  tokenSample,
  onTokenSampleChange,
  onApplyEstimate,
  title = 'Token assistant',
  description = 'Paste a sample prompt or response to estimate tokens before setting the numeric fields.',
  showContainer = true,
  showApplyActions = true,
}: TokenAssistantPanelProps) {
  const inputEstimate = getTokenEstimateSummary(tokenSample.inputText)
  const outputEstimate = getTokenEstimateSummary(tokenSample.outputText)

  const content = (
    <>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 1.75 }}>
        {description}
      </Typography>

      <Stack spacing={2}>
        <Box>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Sample input text"
            placeholder="Paste a representative prompt, system message, or retrieved context"
            value={tokenSample.inputText}
            helperText={showApplyActions ? 'Use a realistic example so the estimate better matches the actual prompt shape for this agent.' : 'Use a realistic example so the estimate better matches the actual prompt shape you want to size.'}
            onChange={(event) => onTokenSampleChange('inputText', event.target.value)}
          />
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
            <Chip size="small" label={`${inputEstimate.tokens} tokens est.`} color="primary" variant="outlined" />
            <Chip size="small" label={`${inputEstimate.words} words`} variant="outlined" />
            <Chip size="small" label={`${inputEstimate.characters} chars`} variant="outlined" />
          </Stack>
          {showApplyActions ? (
            <Button
              size="small"
              variant="text"
              sx={{ mt: 1 }}
              disabled={inputEstimate.tokens === 0}
              onClick={() => onApplyEstimate?.('inputTokens', inputEstimate.tokens)}
            >
              Use as input tokens
            </Button>
          ) : null}
        </Box>

        <Box>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Sample output text"
            placeholder="Paste a representative answer, plan, or generated result"
            value={tokenSample.outputText}
            helperText={showApplyActions ? 'Paste a representative completion to estimate the response side of the call more accurately.' : 'Paste a representative completion to estimate the response side more accurately.'}
            onChange={(event) => onTokenSampleChange('outputText', event.target.value)}
          />
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
            <Chip size="small" label={`${outputEstimate.tokens} tokens est.`} color="secondary" variant="outlined" />
            <Chip size="small" label={`${outputEstimate.words} words`} variant="outlined" />
            <Chip size="small" label={`${outputEstimate.characters} chars`} variant="outlined" />
          </Stack>
          {showApplyActions ? (
            <Button
              size="small"
              variant="text"
              sx={{ mt: 1 }}
              disabled={outputEstimate.tokens === 0}
              onClick={() => onApplyEstimate?.('outputTokens', outputEstimate.tokens)}
            >
              Use as output tokens
            </Button>
          ) : null}
        </Box>

        <Typography variant="caption" color="text.secondary">
          Token estimates are approximate and use a lightweight character-and-word heuristic, which is usually good enough for early planning.
        </Typography>
      </Stack>
    </>
  )

  if (!showContainer) {
    return <Box>{content}</Box>
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderColor: 'rgba(19, 34, 56, 0.08)',
        bgcolor: 'rgba(255, 255, 255, 0.92)',
      }}
    >
      {content}
    </Paper>
  )
}