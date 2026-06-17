/**
 * PageHeader — Consistent page header with title, description, and action area.
 */
import { Box, Stack, Typography } from '@mui/material'

type Props = {
  title: string
  description?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}

export function PageHeader({ title, description, actions, children }: Props) {
  return (
    <Box sx={{ px: { xs: 2, md: 4 }, pt: { xs: 2.5, md: 3 }, pb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {actions}
          </Stack>
        )}
      </Stack>
      {children}
    </Box>
  )
}
