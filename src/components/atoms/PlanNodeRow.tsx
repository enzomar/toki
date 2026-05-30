import type { ReactNode } from 'react'
import { Box, Chip, ListItemButton, ListItemIcon, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'

type PlanNodeRowProps = {
  active: boolean
  depth?: number
  label: string
  helper: string
  icon: ReactNode
  badge?: string
  onClick: () => void
}

export function PlanNodeRow(props: PlanNodeRowProps) {
  return (
    <ListItemButton
      onClick={props.onClick}
      selected={props.active}
      sx={{
        pl: 1.25 + (props.depth ?? 0) * 2,
        borderRadius: 3,
        alignItems: 'flex-start',
        '&.Mui-selected': {
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
        },
      }}
    >
      <ListItemIcon sx={{ minWidth: 34, color: props.active ? 'primary.main' : 'text.secondary', mt: 0.25 }}>{props.icon}</ListItemIcon>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{props.label}</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.3, fontSize: 12.5 }}>
          {props.helper}
        </Typography>
      </Box>
      {props.badge ? <Chip size="small" label={props.badge} variant="outlined" sx={{ ml: 1 }} /> : null}
    </ListItemButton>
  )
}