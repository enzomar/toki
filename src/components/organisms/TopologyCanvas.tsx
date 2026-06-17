import { useRef, useState, useMemo } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { AddRounded, RemoveRounded, CenterFocusStrongRounded } from '@mui/icons-material'
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { Agent, Edge, LayoutNode, WorkspacePricing } from '../../features/topology/types'
import type { AEIRGraph, AEIRNode } from '../../features/forecasting/aeir-types'
import {
  buildTopologyLayout,
  computeTrafficShares,
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
  onEditAgent?: (agentId: string) => void
  /** Compiled AEIR graph for overlay metadata */
  aeirGraph?: AEIRGraph | null
}

type CanvasPoint = { x: number; y: number }

const MIN_ZOOM = 0.4
const MAX_ZOOM = 3.0
const ZOOM_FACTOR = 1.12
const NODE_W = 220
const NODE_H = 120

// --- Color system ---
const COLORS = {
  entry: { bg: '#ecfdf5', border: '#059669', text: '#065f46' },
  rag: { bg: '#f0fdf4', border: '#16a34a', badge: '#15803d' },
  mcp: { bg: '#fffbeb', border: '#d97706', badge: '#92400e' },
  default: { bg: '#ffffff', border: '#64748b', text: '#1e293b' },
  selected: { border: '#0f172a', shadow: 'rgba(15, 23, 42, 0.25)' },
  edge: { normal: '#94a3b8', active: '#0f766e', label: '#475569' },
}

function getNodeColors(agent: Agent, isEntry: boolean) {
  if (isEntry) return COLORS.entry
  if (agent.ragEnabled) return COLORS.rag
  if (agent.mcpCalls > 0) return COLORS.mcp
  return COLORS.default
}

// --- Bezier curve for edges ---
function computeBezierPath(src: CanvasPoint, tgt: CanvasPoint): string {
  const dx = tgt.x - src.x
  const dy = tgt.y - src.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const curvature = Math.min(dist * 0.3, 80)

  // Horizontal bias for left-to-right flow
  const cx1 = src.x + curvature
  const cy1 = src.y
  const cx2 = tgt.x - curvature
  const cy2 = tgt.y

  return `M ${src.x} ${src.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tgt.x} ${tgt.y}`
}

function getResetView(layout: LayoutNode[], width: number, height: number) {
  if (layout.length === 0) return { zoom: 1, pan: { x: 0, y: 0 } }
  const pad = 80
  const minX = Math.min(...layout.map((n) => n.x - NODE_W / 2)) - pad
  const maxX = Math.max(...layout.map((n) => n.x + NODE_W / 2)) + pad
  const minY = Math.min(...layout.map((n) => n.y - NODE_H / 2)) - pad
  const maxY = Math.max(...layout.map((n) => n.y + NODE_H / 2)) + pad
  const bw = maxX - minX, bh = maxY - minY
  const zoom = Math.max(MIN_ZOOM, Math.min(1.2, Math.min(width / bw, height / bh)))
  return {
    zoom,
    pan: { x: (width - bw * zoom) / 2 - minX * zoom, y: (height - bh * zoom) / 2 - minY * zoom },
  }
}

export function TopologyCanvas(props: TopologyCanvasProps) {
  const width = 1200
  const height = Math.min(800, Math.max(450, props.agents.length * 130))
  const layout = useMemo(() => buildTopologyLayout(props.agents, props.edges, width, height), [props.agents, props.edges, width, height])
  const nodeMap = useMemo(() => new Map(layout.map((n) => [n.agent.id, n])), [layout])
  const trafficShares = useMemo(() => computeTrafficShares(props.agents, props.edges), [props.agents, props.edges])
  const resetViewState = useMemo(() => getResetView(layout, width, height), [layout, width, height])

  // AEIR node lookup for overlay metadata
  const aeirNodeMap = useMemo(() => {
    if (!props.aeirGraph) return new Map<string, AEIRNode>()
    return new Map(props.aeirGraph.nodes.map(n => [n.id, n]))
  }, [props.aeirGraph])

  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ pointerId: number; cx: number; cy: number; px: number; py: number } | null>(null)
  const draggedRef = useRef(false)
  const [zoom, setZoom] = useState(resetViewState.zoom)
  const [pan, setPan] = useState<CanvasPoint>(resetViewState.pan)
  const [isPanning, setIsPanning] = useState(false)

  const clamp = (v: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v))

  const applyZoom = (next: number, anchor = { x: width / 2, y: height / 2 }) => {
    const z = clamp(next)
    if (Math.abs(z - zoom) < 0.001) return
    const gx = (anchor.x - pan.x) / zoom, gy = (anchor.y - pan.y) / zoom
    setPan({ x: anchor.x - gx * z, y: anchor.y - gy * z })
    setZoom(z)
  }

  const resetView = () => { setPan(resetViewState.pan); setZoom(resetViewState.zoom) }

  const getSvgPt = (cx: number, cy: number): CanvasPoint | null => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return null
    return { x: ((cx - r.left) / r.width) * width, y: ((cy - r.top) / r.height) * height }
  }

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return
    draggedRef.current = false
    dragRef.current = { pointerId: e.pointerId, cx: e.clientX, cy: e.clientY, px: pan.x, py: pan.y }
    setIsPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const dx = ((e.clientX - d.cx) / r.width) * width
    const dy = ((e.clientY - d.cy) / r.height) * height
    if (Math.abs(dx) + Math.abs(dy) > 3) draggedRef.current = true
    setPan({ x: d.px + dx, y: d.py + dy })
  }
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return
    dragRef.current = null
    setIsPanning(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const anchor = getSvgPt(e.clientX, e.clientY) ?? { x: width / 2, y: height / 2 }
    applyZoom(e.deltaY < 0 ? zoom * ZOOM_FACTOR : zoom / ZOOM_FACTOR, anchor)
  }
  const clickNode = (id: string) => { if (!draggedRef.current) props.onSelectAgent(id); draggedRef.current = false }
  const dblClickNode = (id: string) => { if (props.onEditAgent) props.onEditAgent(id) }

  if (props.agents.length === 0) {
    return (
      <Box sx={{ minHeight: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed', borderColor: 'divider', borderRadius: 3, bgcolor: (t) => alpha(t.palette.primary.main, 0.02) }}>
        <Typography color="text.secondary" sx={{ fontSize: 15 }}>Add agents to visualize the topology</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ position: 'relative', border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: '#f8fafc', overflow: 'hidden' }}>
      {/* Controls */}
      <Paper elevation={2} sx={{ position: 'absolute', top: 12, right: 12, zIndex: 2, px: 0.75, py: 0.5, borderRadius: 12, bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)' }}>
        <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
          <IconButton size="small" onClick={() => applyZoom(zoom / ZOOM_FACTOR)} aria-label="Zoom out"><RemoveRounded fontSize="small" /></IconButton>
          <Typography variant="caption" sx={{ minWidth: 38, textAlign: 'center', fontWeight: 700, fontSize: 11 }}>{Math.round(zoom * 100)}%</Typography>
          <IconButton size="small" onClick={() => applyZoom(zoom * ZOOM_FACTOR)} aria-label="Zoom in"><AddRounded fontSize="small" /></IconButton>
          <IconButton size="small" onClick={resetView} aria-label="Fit to view"><CenterFocusStrongRounded fontSize="small" /></IconButton>
        </Stack>
      </Paper>

      {/* Legend */}
      <Paper elevation={0} sx={{ position: 'absolute', bottom: 12, left: 12, zIndex: 2, px: 1.5, py: 0.75, borderRadius: 8, bgcolor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', border: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#059669' }} /><Typography variant="caption" sx={{ fontSize: 10 }}>Agent</Typography></Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#2563eb' }} /><Typography variant="caption" sx={{ fontSize: 10 }}>RAG</Typography></Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#7c3aed' }} /><Typography variant="caption" sx={{ fontSize: 10 }}>Tool/MCP</Typography></Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ea580c' }} /><Typography variant="caption" sx={{ fontSize: 10 }}>Router</Typography></Stack>
          <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>AEIR Graph · Drag to pan · Scroll to zoom</Typography>
        </Stack>
      </Paper>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        role="img"
        aria-label="Agent topology graph"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
        style={{ display: 'block', height: 'auto', cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none', minHeight: 400 }}
      >
        <defs>
          {/* Arrow markers */}
          <marker id="arrow-normal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.edge.normal} />
          </marker>
          <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.edge.active} />
          </marker>
          {/* Node shadow */}
          <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.08" />
          </filter>
          <filter id="node-glow" x="-15%" y="-15%" width="130%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="10" floodColor="#0f766e" floodOpacity="0.3" />
          </filter>
          {/* Animated dash for flow */}
          <style>{`
            @keyframes flow { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
            .edge-flow { animation: flow 1.5s linear infinite; }
          `}</style>
        </defs>

        {/* Background grid */}
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
        </pattern>
        <rect width={width} height={height} fill="#f8fafc" />
        <rect width={width} height={height} fill="url(#grid)" opacity="0.5" />

        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {props.edges.map((edge) => {
            const src = nodeMap.get(edge.sourceId)
            const tgt = nodeMap.get(edge.targetId)
            if (!src || !tgt) return null

            const isConnected = props.selectedAgentId
              ? edge.sourceId === props.selectedAgentId || edge.targetId === props.selectedAgentId
              : false
            const dimmed = props.selectedAgentId && !isConnected

            // Edge endpoints at node borders
            const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x)
            const srcPt = { x: src.x + Math.cos(angle) * (NODE_W / 2), y: src.y + Math.sin(angle) * (NODE_H / 2 - 4) }
            const tgtPt = { x: tgt.x - Math.cos(angle) * (NODE_W / 2), y: tgt.y - Math.sin(angle) * (NODE_H / 2 - 4) }
            const path = computeBezierPath(srcPt, tgtPt)
            const midX = (srcPt.x + tgtPt.x) / 2
            const midY = (srcPt.y + tgtPt.y) / 2

            return (
              <g key={edge.id} opacity={dimmed ? 0.15 : 1}>
                {/* Shadow path */}
                <path d={path} fill="none" stroke={isConnected ? COLORS.edge.active : COLORS.edge.normal} strokeWidth={isConnected ? 2.5 : 1.8} markerEnd={isConnected ? 'url(#arrow-active)' : 'url(#arrow-normal)'} />
                {/* Animated flow overlay */}
                {isConnected && (
                  <path d={path} fill="none" stroke={COLORS.edge.active} strokeWidth={2} strokeDasharray="6 14" className="edge-flow" opacity={0.6} />
                )}
                {/* Weight label */}
                <rect x={midX - 20} y={midY - 11} width="40" height="20" rx="10" fill="#fff" stroke={isConnected ? COLORS.edge.active : '#e2e8f0'} strokeWidth="1" />
                <text x={midX} y={midY + 4} fontSize="10" fontWeight="700" fill={isConnected ? COLORS.edge.active : COLORS.edge.label} textAnchor="middle">
                  {`${Math.round(edge.weight * 100)}%`}
                </text>
              </g>
            )
          })}

          {/* Nodes */}
          {layout.map((node) => {
            const { incoming, outgoing } = getAgentConnections(node.agent.id, props.edges)
            const isEntry = props.entryAgents.some((a) => a.id === node.agent.id)
            const isSelected = props.selectedAgentId === node.agent.id
            const colors = getNodeColors(node.agent, isEntry)
            const share = trafficShares.get(node.agent.id) ?? 1
            const dimmed = props.selectedAgentId && !isSelected && !props.edges.some((e) => (e.sourceId === props.selectedAgentId && e.targetId === node.agent.id) || (e.targetId === props.selectedAgentId && e.sourceId === node.agent.id))

            return (
              <g
                key={node.agent.id}
                transform={`translate(${node.x - NODE_W / 2}, ${node.y - NODE_H / 2})`}
                onClick={() => clickNode(node.agent.id)}
                onDoubleClick={() => dblClickNode(node.agent.id)}
                style={{ cursor: 'pointer' }}
                opacity={dimmed ? 0.3 : 1}
              >
                {/* Card */}
                <rect
                  width={NODE_W} height={NODE_H} rx="14"
                  fill={colors.bg}
                  stroke={isSelected ? COLORS.selected.border : colors.border}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  filter={isSelected ? 'url(#node-glow)' : 'url(#node-shadow)'}
                />
                {/* Top accent bar */}
                <rect x="0" y="0" width={NODE_W} height="4" rx="14" fill={colors.border} opacity={0.6} />

                {/* Entry badge */}
                {isEntry && (
                  <g>
                    <rect x={NODE_W - 56} y="10" width="46" height="18" rx="9" fill="#ecfdf5" stroke="#059669" strokeWidth="0.8" />
                    <text x={NODE_W - 33} y="23" fontSize="9" fontWeight="700" fill="#065f46" textAnchor="middle">ENTRY</text>
                  </g>
                )}

                {/* Agent name */}
                <text x="14" y="26" fontSize="13" fontWeight="700" fill="#0f172a">{node.agent.name.length > 22 ? node.agent.name.slice(0, 20) + '…' : node.agent.name}</text>

                {/* Model + traffic share */}
                <text x="14" y="44" fontSize="10.5" fill="#64748b">{getModelLabel(node.agent.model)} · {Math.round(share * 100)}% traffic</text>

                {/* Token info */}
                <text x="14" y="62" fontSize="10" fill="#94a3b8">
                  {`${node.agent.callsPerConversation} call${node.agent.callsPerConversation > 1 ? 's' : ''} · ${node.agent.inputTokensPerCall} in / ${node.agent.outputTokensPerCall} out`}
                </text>

                {/* Routing info */}
                <text x="14" y="78" fontSize="10" fill="#94a3b8">
                  {`${incoming.length} in · ${outgoing.length} out`}
                </text>

                {/* AEIR metadata overlay */}
                {(() => {
                  const aeirNode = aeirNodeMap.get(node.agent.id)
                  if (!aeirNode) return null
                  const typeLabel = aeirNode.type.toUpperCase()
                  const execProb = Math.round(aeirNode.execution_probability * 100)
                  const typeColors: Record<string, { bg: string; text: string }> = {
                    agent: { bg: '#d1fae5', text: '#065f46' },
                    rag: { bg: '#dbeafe', text: '#1e40af' },
                    tool: { bg: '#ede9fe', text: '#5b21b6' },
                    router: { bg: '#ffedd5', text: '#9a3412' },
                    composite: { bg: '#e0e7ff', text: '#3730a3' },
                  }
                  const tc = typeColors[aeirNode.type] || typeColors.agent
                  return (
                    <g>
                      {/* AEIR type badge (top-left) */}
                      <rect x="14" y="86" width={typeLabel.length * 7 + 10} height="16" rx="8" fill={tc.bg} />
                      <text x="19" y="97" fontSize="8" fontWeight="800" fill={tc.text}>{typeLabel}</text>
                      {/* Execution probability (top-right) */}
                      <text x={NODE_W - 14} y="97" fontSize="9" fontWeight="600" fill="#64748b" textAnchor="end">
                        {execProb}% exec
                      </text>
                    </g>
                  )
                })()}

                {/* Badges row */}
                {(node.agent.mcpCalls > 0 || node.agent.ragEnabled) && (
                  <g>
                    {node.agent.mcpCalls > 0 && (
                      <g>
                        <rect x="14" y={NODE_H - 24} width={42 + (node.agent.mcpCalls > 9 ? 6 : 0)} height="18" rx="9" fill="#fef3c7" stroke="#d97706" strokeWidth="0.7" />
                        <text x={14 + 21 + (node.agent.mcpCalls > 9 ? 3 : 0)} y={NODE_H - 11} fontSize="9" fontWeight="700" fill="#92400e" textAnchor="middle">{`MCP ×${node.agent.mcpCalls}`}</text>
                      </g>
                    )}
                    {node.agent.ragEnabled && (
                      <g>
                        <rect x={node.agent.mcpCalls > 0 ? 64 : 14} y={NODE_H - 24} width="34" height="18" rx="9" fill="#dcfce7" stroke="#16a34a" strokeWidth="0.7" />
                        <text x={(node.agent.mcpCalls > 0 ? 64 : 14) + 17} y={NODE_H - 11} fontSize="9" fontWeight="700" fill="#15803d" textAnchor="middle">RAG</text>
                      </g>
                    )}
                  </g>
                )}
              </g>
            )
          })}

        </g>
      </svg>
    </Box>
  )
}
