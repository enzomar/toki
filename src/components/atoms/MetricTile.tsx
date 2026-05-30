import type { ReactNode } from 'react'
import { Avatar, Box, Card, CardContent, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'

type MetricTileProps = {
  label: string
  value: string
  helper: string
  icon: ReactNode
}

export function MetricTile(props: MetricTileProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: 'rgba(19, 34, 56, 0.08)',
        bgcolor: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 20px 45px rgba(19, 34, 56, 0.08)',
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Avatar sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12), color: 'primary.main', width: 50, height: 50 }}>
            {props.icon}
          </Avatar>
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.12em' }}>
              {props.label}
            </Typography>
            <Typography variant="h5" sx={{ lineHeight: 1.05 }}>
              {props.value}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {props.helper}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}