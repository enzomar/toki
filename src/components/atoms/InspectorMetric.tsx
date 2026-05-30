import { Paper, Typography } from '@mui/material'

type InspectorMetricProps = {
  label: string
  value: string
  helper: string
}

export function InspectorMetric(props: InspectorMetricProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.75,
        height: '100%',
        borderColor: 'rgba(19, 34, 56, 0.08)',
        bgcolor: 'rgba(255, 255, 255, 0.92)',
      }}
    >
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.08em' }}>
        {props.label}
      </Typography>
      <Typography variant="subtitle1" sx={{ mt: 0.5 }}>
        {props.value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {props.helper}
      </Typography>
    </Paper>
  )
}