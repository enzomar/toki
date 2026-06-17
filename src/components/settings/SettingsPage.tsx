/**
 * SettingsPage — Model pricing configuration.
 */
import { Box } from '@mui/material'
import type { Dispatch, SetStateAction } from 'react'
import type { Agent, WorkspacePricing } from '../../features/topology/types'
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
  return (
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
      <PageHeader title="Settings" description="Configure model pricing, volume discounts, and batch API options" />

      <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
        <PricingTab
          pricing={pricing}
          setPricing={setPricing}
          agents={agents}
          modelOptions={modelOptions}
          newModelName={newModelName}
          setNewModelName={setNewModelName}
        />
      </Box>
    </Box>
  )
}
