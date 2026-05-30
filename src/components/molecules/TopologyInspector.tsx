import { Alert, Avatar, Box, Chip, Divider, Grid, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { InspectorMetric } from '../atoms/InspectorMetric'
import { TokenAssistantPanel } from './TokenAssistantPanel'
import type { Agent, Edge, SimulationReport, TokenSampleState, WorkspacePricing } from '../../features/topology/types'
import {
  formatCurrency,
  formatMetricNumber,
  getAgentConnections,
  getAgentVisitForecast,
  getEmbeddingTokensPerVisit,
  getModelLabel,
  getRetrievedContextTokens,
  getRoutingModeLabel,
  getRoutingModeShortLabel,
} from '../../features/topology/utils'

type TopologyInspectorProps = {
  agent: Agent | null
  agents: Agent[]
  edges: Edge[]
  entryAgents: Agent[]
  report: SimulationReport | null
  workspacePricing: WorkspacePricing
  tokenSample: TokenSampleState
  onTokenSampleChange: (field: keyof TokenSampleState, value: string) => void
  onApplyEstimate: (field: 'inputTokens' | 'outputTokens', value: number) => void
}

export function TopologyInspector(props: TopologyInspectorProps) {
  if (!props.agent) {
    return <Alert severity="info">Select an agent to inspect routing and forecast impact.</Alert>
  }

  const connections = getAgentConnections(props.agent.id, props.edges)
  const isEntry = props.entryAgents.some((agent) => agent.id === props.agent?.id)
  const reportSummary = props.report?.summary.find((summary) => summary.id === props.agent?.id)
  const promptOverhead = props.agent.fixedPromptTokens + props.agent.historyCarryoverTokens
  const perRunForecast = getAgentVisitForecast(props.agent, 1, 1, props.workspacePricing.models, props.workspacePricing.embeddingPricePer1M)
  const formatCost = (value: number) => formatCurrency(value, props.workspacePricing.currency)
  const retrievedContextTokens = getRetrievedContextTokens(props.agent)
  const embeddingTokens = getEmbeddingTokensPerVisit(props.agent)
  const flowNames = (items: Edge[], direction: 'sourceId' | 'targetId') =>
    items
      .map((edge) => props.agents.find((agent) => agent.id === edge[direction])?.name)
      .filter((name): name is string => Boolean(name))

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
        <Avatar sx={{ width: 56, height: 56, bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}>
          {props.agent.name.slice(0, 1).toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant="h6">{props.agent.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {getModelLabel(props.agent.model)}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {isEntry ? <Chip label="Entry point" color="primary" variant="outlined" /> : null}
        <Chip label={`Logic: ${getRoutingModeShortLabel(props.agent.routingMode)}`} variant="outlined" />
        {props.agent.ragEnabled ? <Chip label={`RAG x${props.agent.retrievalMultiplier.toFixed(2)}`} color="success" /> : null}
        {props.agent.ragEnabled ? <Chip label={`${formatMetricNumber(props.agent.averageRetrievedChunks)} chunks x ${props.agent.averageChunkTokens}`} color="success" variant="outlined" /> : null}
        {props.agent.mcpCalls > 0 ? <Chip label={`MCP x${props.agent.mcpCalls}`} color="secondary" /> : null}
        {props.agent.retryProbability > 0 ? <Chip label={`Retry ${Math.round(props.agent.retryProbability * 100)}%`} color="warning" variant="outlined" /> : null}
        {props.agent.fallbackProbability > 0 ? <Chip label={`Fallback ${Math.round(props.agent.fallbackProbability * 100)}%`} color="warning" variant="outlined" /> : null}
        {!props.agent.ragEnabled && props.agent.mcpCalls === 0 ? <Chip label="Base execution" variant="outlined" /> : null}
      </Stack>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <InspectorMetric label="Input core" value={props.agent.inputTokens.toLocaleString()} helper="Request tokens before prompt overhead and retrieval" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <InspectorMetric label="Output core" value={props.agent.outputTokens.toLocaleString()} helper="Response tokens before retries or fallback" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <InspectorMetric label="Prompt + history" value={promptOverhead.toLocaleString()} helper="Fixed prompt overhead plus expected conversation carryover" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <InspectorMetric
            label="Retrieval / embeddings"
            value={`${formatMetricNumber(retrievedContextTokens)} / ${formatMetricNumber(embeddingTokens)}`}
            helper="Retrieved context tokens added to the prompt / embedding tokens used for retrieval"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <InspectorMetric
            label="Routing"
            value={`${connections.incoming.length} in / ${connections.outgoing.length} out`}
            helper={`${getRoutingModeLabel(props.agent.routingMode)} controller`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <InspectorMetric
            label={reportSummary ? 'Forecast cost' : 'Est. cost / run'}
            value={reportSummary ? formatCost(reportSummary.cost) : formatCost(perRunForecast.cost)}
            helper={reportSummary ? 'Current scenario total for this agent' : `${formatMetricNumber(perRunForecast.expectedAttempts)} expected attempts including retries and fallback`}
          />
        </Grid>
      </Grid>

      <TokenAssistantPanel
        tokenSample={props.tokenSample}
        onTokenSampleChange={props.onTokenSampleChange}
        onApplyEstimate={props.onApplyEstimate}
      />

      {reportSummary ? (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderColor: 'rgba(19, 34, 56, 0.08)',
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.05),
          }}
        >
          <Typography variant="subtitle2">Forecast footprint</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {`${formatMetricNumber(reportSummary.tokens)} tokens across ${reportSummary.visits.toFixed(2)} effective visits, including ${formatMetricNumber(reportSummary.embeddingTokens)} embedding tokens.`}
          </Typography>
        </Paper>
      ) : null}

      <Divider />

      <Box>
        <Typography variant="subtitle2">Incoming traffic</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 1.25 }}>
          {connections.incoming.length > 0
            ? `Receives traffic from ${flowNames(connections.incoming, 'sourceId').join(', ')}.`
            : 'No incoming flow. This agent can start a session.'}
        </Typography>
        <Stack spacing={1}>
          {connections.incoming.length > 0 ? (
            connections.incoming.map((edge) => {
              const source = props.agents.find((agent) => agent.id === edge.sourceId)

              return (
                <Paper key={edge.id} variant="outlined" sx={{ p: 1.25, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="subtitle2">{source?.name ?? edge.sourceId}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Upstream source
                      </Typography>
                    </Box>
                    <Chip size="small" label={`x${edge.weight.toFixed(2)}`} variant="outlined" />
                  </Stack>
                </Paper>
              )
            })
          ) : (
            <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
              <Typography variant="body2" color="text.secondary">
                Keep this node as an entry point, or add an incoming flow to make it downstream.
              </Typography>
            </Paper>
          )}
        </Stack>
      </Box>

      <Box>
        <Typography variant="subtitle2">Outgoing traffic</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 1.25 }}>
          {connections.outgoing.length > 0
            ? `Routes work to ${flowNames(connections.outgoing, 'targetId').join(', ')}.`
            : 'No downstream flow. This agent ends its branch here.'}
        </Typography>
        <Stack spacing={1}>
          {connections.outgoing.length > 0 ? (
            connections.outgoing.map((edge) => {
              const target = props.agents.find((agent) => agent.id === edge.targetId)

              return (
                <Paper key={edge.id} variant="outlined" sx={{ p: 1.25, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="subtitle2">{target?.name ?? edge.targetId}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Downstream target
                      </Typography>
                    </Box>
                    <Chip size="small" label={`x${edge.weight.toFixed(2)}`} color="primary" variant="outlined" />
                  </Stack>
                </Paper>
              )
            })
          ) : (
            <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'rgba(19, 34, 56, 0.08)' }}>
              <Typography variant="body2" color="text.secondary">
                Add a flow if this node should branch, hand off, or loop back into the topology.
              </Typography>
            </Paper>
          )}
        </Stack>
      </Box>
    </Stack>
  )
}