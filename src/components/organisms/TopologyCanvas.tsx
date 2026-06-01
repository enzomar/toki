import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { AddRounded, RemoveRounded, RestartAltRounded } from '@mui/icons-material'
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { Agent, Edge, LayoutNode, WorkspacePricing } from '../../features/topology/types'
import {
  buildTopologyLayout,
  getAgentConnections,
  getModelLabel,
} from '../../features/topology/utils'

type TopologyCanvasProps = {
  agents: Agent[]
  edges: Edge[]
  entryAgents: Agent[]
  selectedAgentId: string | null
  report: null
  workspacePricing: WorkspacePricing
  onSelectAgent: (agentId: string) => void
}

type CanvasPoint = { x: number; y: number }

const DEFAULT_ZOOM = 1
const MIN_ZOOM = 0.65
const MAX_ZOOM = 2.4
const ZOOM_FACTOR = 1.14

function getResetViewState(layout: LayoutNode[], width: number, height: number, nodeWidth: number, nodeHeight: number) {
  if (layout.length === 0) return { zoom: DEFAULT_ZOOM, pan: { x: 0, y: 0 } }
  const paddingX = 72, paddingY = 64
  const minX = Math.min(...layout.map((n) => n.x - nodeWidth / 2))
  const maxX = Math.max(...layout.map((n) => n.x + nodeWidth / 2))
  const minY = Math.min(...layout.map((n) => n.y - nodeHeight / 2))
  const maxY = Math.max(...layout.map((n) => n.y + nodeHeight / 2))
  const fitZoom = Math.min(DEFAULT_ZOOM, (width - paddingX * 2) / Math.max(1, maxX - minX), (height - paddingY * 2) / Math.max(1, maxY - minY))
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom))
  return { zoom, pan: { x: width / 2 - ((minX + maxX) / 2) * zoom, y: height / 2 - ((minY + maxY) / 2) * zoom } }
}

export function TopologyCanvas(props: TopologyCanvasProps) {
  const width = 1120
  const height = Math.min(720, Math.max(420, props.agents.length * 120))
  const layout = buildTopologyLayout(props.agents, props.edges, width, height)
  const nodeMap = new Map(layout.map((n) => [n.agent.id, n]))
  const nodeWidth = 200, nodeHeight = 100
  const resetViewState = getResetViewState(layout, width, height, nodeWidth, nodeHeight)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragStateRef = useRef<{ pointerId: number; clientX: number; clientY: number; panX: number; panY: number } | null>(null)
  const draggedRef = useRef(false)
  const [zoom, setZoom] = useState(resetViewState.zoom)
  const [pan, setPan] = useState<CanvasPoint>(resetViewState.pan)
  const [isPanning, setIsPanning] = useState(false)

  const clampZoom = (v: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v))
  const getSvgPoint = (cx: number, cy: number): CanvasPoint | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return { x: ((cx - rect.left) / rect.width) * width, y: ((cy - rect.top) / rect.height) * height }
  }
  const applyZoom = (requested: number, anchor = { x: width / 2, y: height / 2 }) => {
    const next = clampZoom(requested)
    if (Math.abs(next - zoom) < 0.001) return
    const gx = (anchor.x - pan.x) / zoom, gy = (anchor.y - pan.y) / zoom
    setPan({ x: anchor.x - gx * next, y: anchor.y - gy * next })
    setZoom(next)
  }
  const resetView = () => { setPan(resetViewState.pan); setZoom(resetViewState.zoom) }

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return
    draggedRef.current = false
    dragStateRef.current = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y }
    setIsPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const ds = dragStateRef.current
    if (!ds || ds.pointerId !== e.pointerId) return
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const dx = ((e.clientX - ds.clientX) / rect.width) * width
    const dy = ((e.clientY - ds.clientY) / rect.height) * height
    if (Math.abs(dx) + Math.abs(dy) > 2) draggedRef.current = true
    setPan({ x: ds.panX + dx, y: ds.panY + dy })
  }
  const finishPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragStateRef.current?.pointerId !== e.pointerId) return
    dragStateRef.current = null
    setIsPanning(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const handleWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const anchor = getSvgPoint(e.clientX, e.clientY) ?? { x: width / 2, y: height / 2 }
    applyZoom(e.deltaY < 0 ? zoom * ZOOM_FACTOR : zoom / ZOOM_FACTOR, anchor)
  }
  const handleNodeClick = (id: string) => { if (!draggedRef.current) props.onSelectAgent(id); draggedRef.current = false }

  if (props.agents.length === 0) {
    return (
      <Box sx={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed', borderColor: 'divider', bgcolor: (t) => alpha(t.palette.primary.main, 0.03) }}>
        <Typography color="text.secondary">Add at least one agent to render the topology.</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ position: 'relative', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#fafbfc' }}>
      <Paper elevation={0} sx={{ position: 'absolute', top: 12, right: 12, zIndex: 2, p: 0.5, borderRadius: 10, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)' }}>
        <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
          <IconButton size="small" onClick={() => applyZoom(zoom / ZOOM_FACTOR)} aria-label="Zoom out"><RemoveRounded fontSize="small" /></IconButton>
          <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center', fontWeight: 700 }}>{Math.round(zoom * 100)}%</Typography>
          <IconButton size="small" onClick={() => applyZoom(zoom * ZOOM_FACTOR)} aria-label="Zoom in"><AddRounded fontSize="small" /></IconButton>
          <IconButton size="small" onClick={resetView} aria-label="Reset"><RestartAltRounded fontSize="small" /></IconButton>
        </Stack>
      </Paper>

      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Topology graph"
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer} onWheel={handleWheel}
        style={{ display: 'block', height: 'auto', cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}>
        <defs>
          <marker id="arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 12 6 L 0 12 z" fill="#8a97ac" />
          </marker>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="#fafbfc" />
        <g transform={`translate(${pan.x} ${pan.y})`}>
          <g transform={`scale(${zoom})`}>
            {/* Edges */}
            {props.edges.map((edge) => {
              const src = nodeMap.get(edge.sourceId), tgt = nodeMap.get(edge.targetId)
              if (!src || !tgt) return null
              const connected = props.selectedAgentId ? edge.sourceId === props.selectedAgentId || edge.targetId === props.selectedAgentId : false
              const opacity = props.selectedAgentId && !connected ? 0.2 : 0.8
              const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x)
              const sx = src.x + Math.cos(angle) * (nodeWidth / 2 - 8)
              const sy = src.y + Math.sin(angle) * (nodeHeight / 2 - 8)
              const ex = tgt.x - Math.cos(angle) * (nodeWidth / 2 - 8)
              const ey = tgt.y - Math.sin(angle) * (nodeHeight / 2 - 8)
              return (
                <g key={edge.id} opacity={opacity}>
                  <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={connected ? '#0f766e' : '#8a97ac'} strokeWidth={2} markerEnd="url(#arrow)" />
                  <rect x={(sx + ex) / 2 - 18} y={(sy + ey) / 2 - 10} width="36" height="18" rx="9" fill="#fff" stroke={connected ? '#0f766e' : '#dbe3ef'} strokeWidth="0.8" />
                  <text x={(sx + ex) / 2} y={(sy + ey) / 2 + 4} fontSize="10" fontWeight="700" fill={connected ? '#0f766e' : '#60708f'} textAnchor="middle">{`${Math.round(edge.weight * 100)}%`}</text>
                </g>
              )
            })}
            {/* Nodes */}
            {layout.map((node) => {
              const { incoming, outgoing } = getAgentConnections(node.agent.id, props.edges)
              const isEntry = props.entryAgents.some((a) => a.id === node.agent.id)
              const isSelected = props.selectedAgentId === node.agent.id
              const accent = node.agent.ragEnabled ? '#2f855a' : node.agent.mcpCalls > 0 ? '#d97706' : '#0f766e'
              return (
                <g key={node.agent.id} transform={`translate(${node.x - nodeWidth / 2}, ${node.y - nodeHeight / 2})`} onClick={() => handleNodeClick(node.agent.id)} style={{ cursor: 'pointer' }}>
                  <rect width={nodeWidth} height={nodeHeight} rx="16" fill="#fff" stroke={isSelected ? '#132238' : accent} strokeWidth={isSelected ? 2.5 : 1.5} />
                  {isEntry && <><rect x={nodeWidth - 52} y="8" width="44" height="18" rx="9" fill="#e0f2fe" /><text x={nodeWidth - 30} y="21" fontSize="9" fontWeight="700" fill="#0f5ea8" textAnchor="middle">ENTRY</text></>}
                  <text x="14" y="28" fontSize="13" fontWeight="700" fill="#132238">{node.agent.name.slice(0, 20)}</text>
                  <text x="14" y="46" fontSize="11" fill="#60708f">{getModelLabel(node.agent.model)}</text>
                  <text x="14" y="66" fontSize="10" fill="#7b8799">{`${node.agent.callsPerConversation} calls · ${node.agent.inputTokensPerCall}/${node.agent.outputTokensPerCall} tok`}</text>
                  <text x="14" y="84" fontSize="10" fill={node.agent.mcpCalls > 0 ? '#d97706' : '#7b8799'}>{node.agent.mcpCalls > 0 ? `MCP ×${node.agent.mcpCalls} · ${incoming.length} in · ${outgoing.length} out` : `${incoming.length} in · ${outgoing.length} out`}</text>
                  {node.agent.mcpCalls > 0 && <rect x={nodeWidth - 42} y={nodeHeight - 22} width="34" height="16" rx="8" fill="#fef3c7" stroke="#d97706" strokeWidth="0.8" />}
                  {node.agent.mcpCalls > 0 && <text x={nodeWidth - 25} y={nodeHeight - 10} fontSize="9" fontWeight="700" fill="#92400e" textAnchor="middle">{`MCP`}</text>}
                </g>
              )
            })}
          </g>
        </g>
      </svg>
    </Box>
  )
}
