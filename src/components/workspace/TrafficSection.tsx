/**
 * TrafficSection — Traffic volume input, the first step in the natural flow.
 * Designed to be approachable: just users × conversations = volume.
 */
import {
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { EstimateConfig, TimeRange } from '../../features/topology/types'
import { computeConversationsPerMonth, toNumber } from '../../features/topology/utils'

type Props = {
  estimateConfig: EstimateConfig
  setEstimateConfig: (updater: (c: EstimateConfig) => EstimateConfig) => void
}

export function TrafficSection({ estimateConfig, setEstimateConfig }: Props) {
  return (
    <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Traffic Volume
        </Typography>
        {estimateConfig.conversationsPerMonth > 0 && (
          <Chip
            label={`${estimateConfig.conversationsPerMonth.toLocaleString()} conv/month`}
            color="primary"
            size="small"
            sx={{ fontWeight: 700 }}
          />
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        How many users interact with your AI system, and how often?
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            fullWidth
            type="number"
            label="Active users"
            placeholder="e.g. 5000"
            value={estimateConfig.users || ''}
            helperText="Active users per time range"
            onChange={(e) => {
              const users = Math.max(0, Math.round(toNumber(e.target.value, 0)))
              setEstimateConfig((c) => ({
                ...c,
                users,
                conversationsPerMonth: computeConversationsPerMonth(users, c.conversationsPerUser, c.timeRange),
              }))
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            fullWidth
            type="number"
            label="Conversations per user"
            placeholder="e.g. 10"
            value={estimateConfig.conversationsPerUser || ''}
            helperText="Average per time range"
            onChange={(e) => {
              const conv = Math.max(0, toNumber(e.target.value, 0))
              setEstimateConfig((c) => ({
                ...c,
                conversationsPerUser: conv,
                conversationsPerMonth: computeConversationsPerMonth(c.users, conv, c.timeRange),
              }))
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <FormControl fullWidth>
            <InputLabel>Time range</InputLabel>
            <Select
              label="Time range"
              value={estimateConfig.timeRange}
              onChange={(e) => {
                const tr = e.target.value as TimeRange
                setEstimateConfig((c) => ({
                  ...c,
                  timeRange: tr,
                  conversationsPerMonth: computeConversationsPerMonth(c.users, c.conversationsPerUser, tr),
                }))
              }}
            >
              <MenuItem value="day">Per day</MenuItem>
              <MenuItem value="week">Per week</MenuItem>
              <MenuItem value="month">Per month</MenuItem>
              <MenuItem value="year">Per year</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>
    </Paper>
  )
}
