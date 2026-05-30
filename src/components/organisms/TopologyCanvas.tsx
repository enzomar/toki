import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { AddRounded, RemoveRounded, RestartAltRounded } from '@mui/icons-material'
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { Agent, Edge, SimulationReport, WorkspacePricing } from '../../features/topology/types'
import {
  buildTopologyLayout,
  formatCurrency,
  formatMetricNumber,
  getAgentConnections,
  getModelLabel,
  getPerRunCost,
  getRoutingModeShortLabel,
} from '../../features/topology/utils'

type TopologyCanvasProps = {
  agents: Agent[]
  edges: Edge[]
  entryAgents: Agent[]
  selectedAgentId: string | null
  report: SimulationReport | null
  workspacePricing: WorkspacePricing
  onSelectAgent: (agentId: string) => void
}

type CanvasPoint = {
  x: number
  y: number
}

const DEFAULT_ZOOM = 1
const MIN_ZOOM = 0.65
const MAX_ZOOM = 2.4
const ZOOM_FACTOR = 1.14

export function TopologyCanvas(props: TopologyCanvasProps) {
  const width = 1120
  const height = Math.min(720, Math.max(420, props.agents.length * 120))
  const layout = buildTopologyLayout(props.agents, props.edges, width, height)
  const nodeMap = new Map(layout.map((node) => [node.agent.id, node]))
  const reportMap = new Map((props.report?.summary ?? []).map((summary) => [summary.id, summary]))
  const nodeWidth = 220
  const nodeHeight = 128
  const levels = Array.from(new Set(layout.map((node) => node.depth))).sort((left, right) => left - right)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragStateRef = useRef<{ pointerId: number; clientX: number; clientY: number; panX: number; panY: number } | null>(null)
  const draggedRef = useRef(false)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [pan, setPan] = useState<CanvasPoint>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const formatCost = (value: number) => formatCurrency(value, props.workspacePricing.currency)

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

  const getSvgPoint = (clientX: number, clientY: number): CanvasPoint | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) {
      return null
    }

    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    }
  }

  const applyZoom = (requestedZoom: number, anchor = { x: width / 2, y: height / 2 }) => {
    const nextZoom = clampZoom(requestedZoom)
    if (Math.abs(nextZoom - zoom) < 0.001) {
      return
    }

    const graphX = (anchor.x - pan.x) / zoom
    const graphY = (anchor.y - pan.y) / zoom

    setPan({
      x: anchor.x - graphX * nextZoom,
      y: anchor.y - graphY * nextZoom,
    })
    setZoom(nextZoom)
  }

  const resetView = () => {
    setPan({ x: 0, y: 0 })
    setZoom(DEFAULT_ZOOM)
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType !== 'touch') {
      return
    }

    draggedRef.current = false
    dragStateRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) {
      return
    }

    const deltaX = ((event.clientX - dragState.clientX) / rect.width) * width
    const deltaY = ((event.clientY - dragState.clientY) / rect.height) * height

    if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
      draggedRef.current = true
    }

    setPan({
      x: dragState.panX + deltaX,
      y: dragState.panY + deltaY,
    })
  }

  const finishPointerInteraction = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return
    }

    dragStateRef.current = null
    setIsPanning(false)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const anchor = getSvgPoint(event.clientX, event.clientY) ?? { x: width / 2, y: height / 2 }
    const nextZoom = event.deltaY < 0 ? zoom * ZOOM_FACTOR : zoom / ZOOM_FACTOR
    applyZoom(nextZoom, anchor)
  }

  const handleNodeClick = (agentId: string) => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }

    props.onSelectAgent(agentId)
  }

  if (props.agents.length === 0) {
    return (
      <Box
        sx={{
          minHeight: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed',
          borderColor: 'divider',
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.03),
        }}
      >
        <Typography color="text.secondary">Add at least one agent to render the topology.</Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        position: 'relative',
        border: '1px solid',
        borderColor: 'rgba(19, 34, 56, 0.08)',
        bgcolor: '#fffdf8',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          top: { xs: 10, sm: 14 },
          right: { xs: 10, sm: 14 },
          zIndex: 2,
          p: 0.5,
          maxWidth: { xs: 'calc(100% - 20px)', sm: 'none' },
          borderRadius: 12,
          border: '1px solid rgba(19, 34, 56, 0.08)',
          bgcolor: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.25} sx={{ alignItems: 'center' }}>
          <IconButton size="small" onClick={() => applyZoom(zoom / ZOOM_FACTOR)} aria-label="Zoom out">
            <RemoveRounded fontSize="small" />
          </IconButton>
          <Typography variant="caption" sx={{ minWidth: 44, textAlign: 'center', fontWeight: 700, color: '#516072' }}>
            {`${Math.round(zoom * 100)}%`}
          </Typography>
          <IconButton size="small" onClick={() => applyZoom(zoom * ZOOM_FACTOR)} aria-label="Zoom in">
            <AddRounded fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={resetView} aria-label="Reset view">
            <RestartAltRounded fontSize="small" />
          </IconButton>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          left: { xs: 10, sm: 14 },
          right: { xs: 10, sm: 'auto' },
          bottom: { xs: 10, sm: 14 },
          zIndex: 2,
          px: 1.25,
          py: 0.75,
          borderRadius: { xs: 8, sm: 12 },
          border: '1px solid rgba(19, 34, 56, 0.08)',
          bgcolor: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Typography variant="caption" sx={{ color: '#516072', fontWeight: 600, display: 'block', textAlign: { xs: 'center', sm: 'left' } }}>
          Drag to pan, scroll to zoom, reset to recenter.
        </Typography>
      </Paper>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label="Topology graph"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
        onWheel={handleWheel}
        style={{
          display: 'block',
          height: 'auto',
          cursor: isPanning ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <defs>
          <marker id="arrow-head" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
            <path d="M 0 0 L 12 6 L 0 12 z" fill="#74839a" />
          </marker>
          <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#132238" floodOpacity="0.12" />
          </filter>
          <linearGradient id="topology-background" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fffdfa" />
            <stop offset="100%" stopColor="#f7f8f5" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={width} height={height} fill="url(#topology-background)" />

        <g transform={`translate(${pan.x} ${pan.y})`}>
          <g transform={`scale(${zoom})`}>
            {levels.map((level) => {
              const levelNodes = layout.filter((node) => node.depth === level)
              const centerX = levelNodes.reduce((sum, node) => sum + node.x, 0) / levelNodes.length

              return (
                <g key={level}>
                  <text x={centerX} y="34" fontSize="11" fontWeight="700" fill="#7b8799" textAnchor="middle" letterSpacing="0.12em">
                    {`STAGE ${level + 1}`}
                  </text>
                  <line x1={centerX} y1="48" x2={centerX} y2={height - 32} stroke="#e3e8ef" strokeDasharray="8 10" />
                </g>
              )
            })}

            {props.edges.map((edge) => {
              const source = nodeMap.get(edge.sourceId)
              const target = nodeMap.get(edge.targetId)

              if (!source || !target) {
                return null
              }

              const isConnectedToSelection = props.selectedAgentId
                ? edge.sourceId === props.selectedAgentId || edge.targetId === props.selectedAgentId
                : false
              const stroke = isConnectedToSelection ? '#0f766e' : '#8a97ac'
              const opacity = props.selectedAgentId && !isConnectedToSelection ? 0.28 : 0.88
              const strokeWidth = Math.min(4.5, 1.6 + edge.weight * 1.1)

              if (edge.sourceId === edge.targetId) {
                const loopX = source.x + nodeWidth / 2 - 22
                const loopY = source.y - nodeHeight / 2 + 18
                return (
                  <g key={edge.id} opacity={opacity}>
                    <path
                      d={`M ${loopX} ${loopY} C ${loopX + 42} ${loopY - 48}, ${loopX - 40} ${loopY - 48}, ${loopX} ${loopY}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      markerEnd="url(#arrow-head)"
                    />
                    <rect x={loopX - 2} y={loopY - 62} width="48" height="20" rx="10" fill="#ffffff" stroke="#dbe3ef" />
                    <text x={loopX + 22} y={loopY - 48} fontSize="11" fill="#60708f" textAnchor="middle">
                      {`x${edge.weight.toFixed(2)}`}
                    </text>
                  </g>
                )
              }

              const angle = Math.atan2(target.y - source.y, target.x - source.x)
              const startX = source.x + Math.cos(angle) * (nodeWidth / 2 - 10)
              const startY = source.y + Math.sin(angle) * (nodeHeight / 2 - 12)
              const endX = target.x - Math.cos(angle) * (nodeWidth / 2 - 10)
              const endY = target.y - Math.sin(angle) * (nodeHeight / 2 - 12)
              const labelX = (startX + endX) / 2
              const labelY = (startY + endY) / 2 - 8

              return (
                <g key={edge.id} opacity={opacity}>
                  <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={stroke} strokeWidth={strokeWidth} markerEnd="url(#arrow-head)" />
                  <rect x={labelX - 24} y={labelY - 11} width="48" height="20" rx="10" fill="#ffffff" stroke="#dbe3ef" />
                  <text x={labelX} y={labelY + 3} fontSize="11" fill="#60708f" textAnchor="middle">
                    {`x${edge.weight.toFixed(2)}`}
                  </text>
                </g>
              )
            })}

            {layout.map((node) => {
              const reportSummary = reportMap.get(node.agent.id)
              const { incoming, outgoing } = getAgentConnections(node.agent.id, props.edges)
              const isEntry = props.entryAgents.some((agent) => agent.id === node.agent.id)
              const isSelected = props.selectedAgentId === node.agent.id
              const accent = node.agent.ragEnabled ? '#2f855a' : node.agent.mcpCalls > 0 ? '#d97706' : '#0f766e'
              const forecastLabel = reportSummary
                ? `${formatMetricNumber(reportSummary.tokens)} tok • ${reportSummary.visits.toFixed(1)} visits`
                : `${formatCost(getPerRunCost(node.agent, props.workspacePricing.models, props.workspacePricing.embeddingPricePer1M))} / run`
              const flagLabel = [
                getRoutingModeShortLabel(node.agent.routingMode),
                node.agent.ragEnabled ? `RAG x${node.agent.retrievalMultiplier.toFixed(2)}` : null,
                node.agent.mcpCalls > 0 ? `MCP x${node.agent.mcpCalls}` : null,
              ]
                .filter((value): value is string => value !== null)
                .join(' • ')

              return (
                <g
                  key={node.agent.id}
                  transform={`translate(${node.x - nodeWidth / 2}, ${node.y - nodeHeight / 2})`}
                  onClick={() => handleNodeClick(node.agent.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect width={nodeWidth} height={nodeHeight} rx="24" fill="#ffffff" filter="url(#card-shadow)" />
                  <rect
                    width={nodeWidth}
                    height={nodeHeight}
                    rx="24"
                    fill="none"
                    stroke={isSelected ? '#132238' : accent}
                    strokeWidth={isSelected ? 3 : 1.8}
                  />
                  <rect x="0" y="0" width={nodeWidth} height="12" rx="24" fill={accent} opacity="0.12" />

                  {isEntry ? (
                    <g>
                      <rect x="150" y="14" width="56" height="20" rx="10" fill="#e0f2fe" />
                      <text x="178" y="28" fontSize="10.5" fontWeight="700" fill="#0f5ea8" textAnchor="middle">
                        ENTRY
                      </text>
                    </g>
                  ) : null}

                  <text x="18" y="34" fontSize="16" fontWeight="700" fill="#132238">
                    {node.agent.name.slice(0, 22)}
                  </text>
                  <text x="18" y="52" fontSize="12" fill="#60708f">
                    {getModelLabel(node.agent.model)}
                  </text>

                  <text x="18" y="74" fontSize="10.5" fontWeight="700" fill="#7b8799" letterSpacing="0.08em">
                    BASE I/O
                  </text>
                  <text x="18" y="89" fontSize="12.5" fontWeight="600" fill="#132238">
                    {`${node.agent.inputTokens} / ${node.agent.outputTokens}`}
                  </text>

                  <text x="128" y="74" fontSize="10.5" fontWeight="700" fill="#7b8799" letterSpacing="0.08em">
                    ROUTING
                  </text>
                  <text x="128" y="89" fontSize="12.5" fontWeight="600" fill="#132238">
                    {`${incoming.length} in • ${outgoing.length} out`}
                  </text>

                  <text x="18" y="109" fontSize="10.5" fontWeight="700" fill="#7b8799" letterSpacing="0.08em">
                    {reportSummary ? 'FORECAST' : 'ESTIMATE'}
                  </text>
                  <text x="18" y="124" fontSize="12" fontWeight="600" fill="#132238">
                    {forecastLabel}
                  </text>

                  <text x="128" y="109" fontSize="10.5" fontWeight="700" fill="#7b8799" letterSpacing="0.08em">
                    {reportSummary ? 'SPEND' : 'PROFILE'}
                  </text>
                  <text x="128" y="124" fontSize="12" fontWeight="600" fill="#132238">
                    {reportSummary ? formatCost(reportSummary.cost) : flagLabel || 'Base profile'}
                  </text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>
    </Box>
  )
}