/**
 * ContactDialog — In-app contact form that posts to the author's Formspree form.
 * Used by the sidebar "Contact" action. Submits via fetch to keep the user in-app.
 */
import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { SendRounded } from '@mui/icons-material'

// Hardcoded Formspree form id for author contact (see agent.md invariants).
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xzdwwwzv'

type Status = 'idle' | 'submitting' | 'success' | 'error'

type Props = {
  open: boolean
  onClose: () => void
}

export function ContactDialog({ open, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const reset = () => {
    setEmail('')
    setMessage('')
    setStatus('idle')
    setError('')
  }

  const handleClose = () => {
    if (status === 'submitting') return
    onClose()
    // Delay reset so the closing animation doesn't flicker.
    setTimeout(reset, 200)
  }

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError('Please enter a message.')
      setStatus('error')
      return
    }
    setStatus('submitting')
    setError('')
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message }),
      })
      if (res.ok) {
        setStatus('success')
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.errors?.[0]?.message ?? 'Something went wrong. Please try again.')
        setStatus('error')
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
      setStatus('error')
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Contact the author</DialogTitle>
      <DialogContent>
        {status === 'success' ? (
          <Box sx={{ py: 2 }}>
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              Thanks for reaching out! Your message was sent to Vincenzo.
            </Alert>
          </Box>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Questions, feedback, or feature ideas? Send a note to Vincenzo Marafioti.
            </Typography>
            <TextField
              label="Your email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              size="small"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <TextField
              label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              fullWidth
              required
              multiline
              minRows={4}
              size="small"
            />
            {status === 'error' && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {error}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {status === 'success' ? (
          <Button onClick={handleClose} variant="contained">
            Close
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={status === 'submitting'}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              startIcon={<SendRounded />}
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Sending…' : 'Send'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
