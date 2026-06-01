import { useState } from 'react'
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography, useMediaQuery } from '@mui/material'
import { CalculateRounded, ContentCopyRounded } from '@mui/icons-material'
import { getTokenEstimateDetails } from '../features/topology/utils'

type TokenToolDialogProps = {
  open: boolean
  onClose: () => void
  onApply?: (tokens: number) => void
  applyLabel?: string
}

export function TokenToolDialog(props: TokenToolDialogProps) {
  const isPhone = useMediaQuery('(max-width:600px)')
  const [text, setText] = useState('')
  const details = getTokenEstimateDetails(text)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(details.tokens))
    } catch { /* ignore */ }
  }

  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth fullScreen={isPhone}>
      <DialogTitle>Token Converter</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Paste any text, JSON, prompt template, or system message to estimate its token count. Uses a character + word heuristic that's accurate within ~10% of tiktoken for planning purposes.
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={6}
          maxRows={16}
          placeholder="Paste your text, JSON, prompt, or system message here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Chip label={`${details.tokens.toLocaleString()} tokens`} color="primary" sx={{ fontWeight: 700, fontSize: 14 }} />
            <Chip label={`${details.words.toLocaleString()} words`} variant="outlined" />
            <Chip label={`${details.characters.toLocaleString()} chars`} variant="outlined" />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Copy token count">
              <IconButton size="small" onClick={handleCopy} disabled={details.tokens === 0}>
                <ContentCopyRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        {props.onApply && (
          <Button onClick={() => { props.onApply?.(details.tokens); props.onClose() }} disabled={details.tokens === 0}>
            {props.applyLabel ?? 'Use this value'}
          </Button>
        )}
        <Button variant="contained" onClick={props.onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Inline button to open the token tool from a text field */
export function TokenToolInlineButton(props: { onResult: (tokens: number) => void; label?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip title="Estimate tokens from text">
        <IconButton size="small" onClick={() => setOpen(true)} sx={{ ml: 0.5 }}>
          <CalculateRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      <TokenToolDialog
        open={open}
        onClose={() => setOpen(false)}
        onApply={props.onResult}
        applyLabel={props.label ?? 'Apply'}
      />
    </>
  )
}
