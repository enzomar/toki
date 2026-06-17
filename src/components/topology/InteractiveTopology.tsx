/**
 * InteractiveTopology — React Flow powered interactive graph editor.
 * 
 * Features:
 * - Drag nodes to reposition (edit mode)
 * - Drag from handles to create connections (edit mode)
 * - Click edge to edit weight / delete (edit mode)
 * - Double-click nodes to open edit dialog
 * - Node positions are preserved across edge changes
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  Position,
  type Node,
  type Edge as RFEdge,
  type Connection,
  type NodeTypes,
  type OnConnect,
  type NodeMouseHandler,
  type OnNodesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { EditRounded, LockRounded } from '@mui/icons-material'
import type { Agent, Edge as TopoEdge, WorkspacePricing } from '../../features/topology/types'
import type { AEIRGraph } from '../../features/forecasting/aeir-types'
import { getModelLabel } from '../../features/topology/utils'
import { AgentEditDialog } from '../AgentEditDialog'

// --- Types ---

type AgentNodeData = {
  agent: Agent
  isEntry: boolean
  trafficShare: number
  costPerMonth: number
  formatCost: (v: number) => string
  aeirType?: string
}

type TrafficNodeData = {
  users: number
  conversationsPerUser: number
  conversationsPerMonth: number
  timeRange: string
}

type Props = {
  agents: Agent[]
  edges: TopoEdge[]
  pricing: WorkspacePricing
  modelOptions: Array<{ value: string; label: string }>
  aeirGraph: AEIRGraph | null
  getAgentCost: (id: string) => number
  getTrafficShare: (id: string) => number
  isEntry: (id: string) => boolean
  formatCost: (v: number) => string
  trafficConfig?: { users: number; conversationsPerUser: number; conversationsPerMonth: number; timeRange: string }
  onUpdateAgent: (id: string, patch: Partial<Agent>) => void
  onRemoveAgent: (id: string) => void
  onAddEdge: (sourceId: string, targetId: string, weight: number) => void
  onUpdateEdge: (id: string, patch: Partial<TopoEdge>) => void
  onRemoveEdge: (id: string) => void
  onAddAgent: () => void
  onEditTraffic?: () => void
}

// --- Custom Node ---

function AgentNode({ data }: { data: AgentNodeData }) {
  const { agent, isEntry, trafficShare, costPerMonth, formatCost, aeirType } = data
  const borderColor = isEntry ? '#059669' : agent.ragEnabled ? '#16a34a' : agent.mcpCalls > 0 ? '#d97706' : '#64748b'
  const bgColor = isEntry ? '#ecfdf5' : agent.ragEnabled ? '#f0fdf4' : agent.mcpCalls > 0 ? '#fffbeb' : '#ffffff'

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 10, height: 10, background: borderColor, border: '2px solid #fff' }}
      />

      <Box sx={{
        width: 200,
        borderRadius: 3,
        border: `2px solid ${borderColor}`,
        bgcolor: bgColor,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <Box sx={{ p: 1.5 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 12, lineHeight: 1.3 }}>
              {agent.name.length > 20 ? agent.name.slice(0, 18) + '…' : agent.name}
            </Typography>
            {isEntry && (
              <Chip size="small" label="ENTRY" sx={{ height: 16, fontSize: 8, fontWeight: 700, bgcolor: '#ecfdf5', color: '#065f46', border: '1px solid #059669' }} />
            )}
          </Stack>
          <Typography variant="caption" sx={{ fontSize: 10, color: '#64748b', display: 'block' }}>
            {getModelLabel(agent.model)} · {Math.round(trafficShare * 100)}%
          </Typography>
          <Typography variant="caption" sx={{ fontSize: 9, color: '#94a3b8', display: 'block', mt: 0.25 }}>
            {agent.callsPerConversation} call{agent.callsPerConversation > 1 ? 's' : ''} · ↓{agent.inputTokensPerCall} ↑{agent.outputTokensPerCall} tok
          </Typography>
          <Stack direction="row" sx={{ mt: 1, justifyContent: 'space-between', alignItems: 'center' }}>
            <Stack direction="row" spacing={0.5}>
              {agent.mcpCalls > 0 && <Chip size="small" label={`MCP ×${agent.mcpCalls}`} sx={{ height: 16, fontSize: 8, bgcolor: '#fef3c7', color: '#92400e' }} />}
              {agent.ragEnabled && <Chip size="small" label="RAG" sx={{ height: 16, fontSize: 8, bgcolor: '#dcfce7', color: '#15803d' }} />}
              {aeirType && <Chip size="small" label={aeirType} sx={{ height: 16, fontSize: 8, bgcolor: '#e0e7ff', color: '#3730a3' }} />}
            </Stack>
            <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, color: '#0f766e' }}>
              {formatCost(costPerMonth)}
            </Typography>
          </Stack>
        </Box>
      </Box>

      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 10, height: 10, background: borderColor, border: '2px solid #fff' }}
      />
    </>
  )
}

// --- Traffic Node (special shape for users/volume) ---

function TrafficNode({ data }: { data: TrafficNodeData }) {
  return (
    <>
      <Box sx={{
        width: 160,
        borderRadius: '50%',
        border: '2px dashed #6366f1',
        bgcolor: '#eef2ff',
        boxShadow: '0 2px 8px rgba(99,102,241,0.12)',
        p: 2,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 160,
      }}>
        <Typography variant="caption" sx={{ fontSize: 9, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Traffic Source
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 800, color: '#4338ca', lineHeight: 1.2, mt: 0.5 }}>
          {data.users.toLocaleString()}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 10, color: '#64748b' }}>
          users
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 9, color: '#64748b', mt: 0.5 }}>
          {data.conversationsPerUser} conv/{data.timeRange}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, color: '#4338ca', mt: 0.25 }}>
          {data.conversationsPerMonth.toLocaleString()} conv/mo
        </Typography>
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 10, height: 10, background: '#6366f1', border: '2px solid #fff' }}
      />
    </>
  )
}

// --- Layout helper: compute initial positions from topology ---

function computeLayout(agents: Agent[], edges: TopoEdge[], isEntry: (id: string) => boolean): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const entryIds = new Set(agents.filter(a => isEntry(a.id)).map(a => a.id))
  const depths = new Map<string, number>()

  // BFS to assign depths
  const queue = agents.filter(a => entryIds.has(a.id)).map(a => ({ id: a.id, depth: 0 }))
  queue.forEach(({ id, depth }) => depths.set(id, depth))
  const visited = new Set(queue.map(q => q.id))

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    const outgoing = edges.filter(e => e.sourceId === id)
    for (const edge of outgoing) {
      if (!visited.has(edge.targetId)) {
        visited.add(edge.targetId)
        depths.set(edge.targetId, depth + 1)
        queue.push({ id: edge.targetId, depth: depth + 1 })
      }
    }
  }
  agents.forEach(a => { if (!depths.has(a.id)) depths.set(a.id, 0) })

  const depthGroups = new Map<number, string[]>()
  depths.forEach((d, id) => {
    const arr = depthGroups.get(d) || []
    arr.push(id)
    depthGroups.set(d, arr)
  })

  agents.forEach((agent) => {
    const depth = depths.get(agent.id) ?? 0
    const group = depthGroups.get(depth) ?? [agent.id]
    const indexInGroup = group.indexOf(agent.id)
    positions.set(agent.id, { x: depth * 300 + 50, y: indexInGroup * 180 + 50 })
  })

  return positions
}

// --- Main Component ---

export function InteractiveTopology({
  agents, edges, modelOptions, aeirGraph,
  getAgentCost, getTrafficShare, isEntry, formatCost, trafficConfig,
  onUpdateAgent, onRemoveAgent, onAddEdge, onUpdateEdge, onRemoveEdge, onAddAgent,
}: Props) {
  const [editMode, setEditMode] = useState(false)
  const [editDialogId, setEditDialogId] = useState<string | null>(null)
  const [deleteEdgeDialog, setDeleteEdgeDialog] = useState<string | null>(null)

  // Store node positions separately so edge changes don't re-layout
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const prevAgentIdsRef = useRef<string>('')

  // Only recompute layout when agents array changes (add/remove), NOT when edges change
  const agentIds = agents.map(a => a.id).join(',')
  if (agentIds !== prevAgentIdsRef.current) {
    positionsRef.current = computeLayout(agents, edges, isEntry)
    prevAgentIdsRef.current = agentIds
  }

  // Build nodes — positions come from ref (stable across edge changes)
  const rfNodes: Node[] = useMemo(() => {
    const agentNodes: Node[] = agents.map((agent) => {
      const pos = positionsRef.current.get(agent.id) ?? { x: 0, y: 0 }
      const aeirNode = aeirGraph?.nodes.find(n => n.id === agent.id)
      return {
        id: agent.id,
        type: 'agentNode',
        position: pos,
        data: {
          agent,
          isEntry: isEntry(agent.id),
          trafficShare: getTrafficShare(agent.id),
          costPerMonth: getAgentCost(agent.id),
          formatCost,
          aeirType: aeirNode?.type?.toUpperCase(),
        } as AgentNodeData,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      }
    })

    // Add traffic source node if config is available
    if (trafficConfig && trafficConfig.conversationsPerMonth > 0) {
      const trafficPos = positionsRef.current.get('__traffic__') ?? { x: -200, y: 50 }
      agentNodes.unshift({
        id: '__traffic__',
        type: 'trafficNode',
        position: trafficPos,
        data: {
          users: trafficConfig.users,
          conversationsPerUser: trafficConfig.conversationsPerUser,
          conversationsPerMonth: trafficConfig.conversationsPerMonth,
          timeRange: trafficConfig.timeRange,
        } as TrafficNodeData,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: editMode,
        selectable: false,
        connectable: false,
      })
    }

    return agentNodes
  }, [agents, aeirGraph, isEntry, getTrafficShare, getAgentCost, formatCost, trafficConfig, editMode])

  // Build edges
  const rfEdgesMemo: RFEdge[] = useMemo(() => {
    const agentEdges: RFEdge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      type: 'default',
      animated: true,
      label: `${Math.round(edge.weight * 100)}%`,
      labelStyle: { fontSize: 11, fontWeight: 700, fill: '#0f766e' },
      labelBgStyle: { fill: '#fff', stroke: '#e2e8f0', strokeWidth: 1 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 8,
      style: {
        stroke: '#0f766e',
        strokeWidth: Math.max(1.5, edge.weight * 3.5),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#0f766e', width: 16, height: 16 },
      className: `edge-weight-${Math.round(edge.weight * 100)}`,
    }))

    // Add edges from traffic node to entry agents
    if (trafficConfig && trafficConfig.conversationsPerMonth > 0) {
      const entryAgentIds = agents.filter(a => isEntry(a.id)).map(a => a.id)
      entryAgentIds.forEach((entryId) => {
        agentEdges.push({
          id: `__traffic__-${entryId}`,
          source: '__traffic__',
          target: entryId,
          type: 'default',
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '6 3' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 14, height: 14 },
          label: '100%',
          labelStyle: { fontSize: 9, fontWeight: 600, fill: '#6366f1' },
          labelBgStyle: { fill: '#eef2ff', stroke: '#c7d2fe', strokeWidth: 1 },
          labelBgPadding: [4, 3] as [number, number],
          labelBgBorderRadius: 6,
        })
      })
    }

    return agentEdges
  }, [edges, trafficConfig, agents, isEntry])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(rfEdgesMemo)
  const { fitView } = useReactFlow()
  const hasFitRef = useRef(false)

  // Fit view only once on initial mount or when agent count changes
  useEffect(() => {
    if (!hasFitRef.current && agents.length > 0) {
      setTimeout(() => fitView({ padding: 0.2 }), 50)
      hasFitRef.current = true
    }
  }, [agents.length, fitView])

  // Reset fit flag when agents are added/removed so it re-fits
  useEffect(() => {
    if (agentIds !== prevAgentIdsRef.current) {
      hasFitRef.current = false
    }
  }, [agentIds])

  // Sync node DATA when agent properties change (name, model, tokens, cost)
  // but preserve positions from React Flow's internal state
  useEffect(() => {
    setNodes((currentNodes) => {
      const currentPositionMap = new Map(currentNodes.map(n => [n.id, n.position]))
      return rfNodes.map(n => ({
        ...n,
        position: currentPositionMap.get(n.id) ?? n.position,
      }))
    })
  }, [rfNodes, setNodes])

  // Sync edges when they change externally (add/remove/update weight)
  useEffect(() => {
    setFlowEdges(rfEdgesMemo)
  }, [rfEdgesMemo, setFlowEdges])

  // Track position changes from dragging so they persist
  const handleNodesChange: OnNodesChange<Node> = useCallback((changes) => {
    onNodesChange(changes)
    // Save position updates to ref
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        positionsRef.current.set(change.id, change.position)
      }
    }
  }, [onNodesChange])

  // Handle new connections (drag from handle)
  const onConnect: OnConnect = useCallback((connection: Connection) => {
    if (!editMode) return
    if (connection.source && connection.target && connection.source !== connection.target && connection.source !== '__traffic__') {
      // Check if this connection already exists
      const exists = edges.some(e => e.sourceId === connection.source && e.targetId === connection.target)
      if (!exists) {
        onAddEdge(connection.source, connection.target, 0.5)
      }
    }
  }, [editMode, onAddEdge, edges])

  // Double-click node to edit
  const onNodeDoubleClick: NodeMouseHandler<Node> = useCallback((_event, node) => {
    if (node.id === '__traffic__') return
    setEditDialogId(node.id)
  }, [])

  // Click edge to edit weight or delete
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: RFEdge) => {
    if (!editMode) return
    setDeleteEdgeDialog(edge.id)
  }, [editMode])

  // Node types (stable ref)
  const nodeTypes: NodeTypes = useMemo(() => ({ agentNode: AgentNode, trafficNode: TrafficNode }), [])

  return (
    <Box sx={{ height: '100%', minHeight: 500, position: 'relative' }}>
      {/* Dynamic CSS for edge animation speeds proportional to weight */}
      <style>{`
        .react-flow__edge.animated path.react-flow__edge-path {
          animation-name: dashdraw;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
        }
        ${edges.map(edge => {
          const duration = Math.max(0.4, 3.5 - edge.weight * 3)
          return `.react-flow__edge.edge-weight-${Math.round(edge.weight * 100)} path.react-flow__edge-path { animation-duration: ${duration}s !important; }`
        }).join('\n')}
        @keyframes dashdraw {
          from { stroke-dashoffset: 10; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>

      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={editMode ? onEdgesChange : undefined}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        nodesDraggable={editMode}
        nodesConnectable={editMode}
        elementsSelectable={editMode}
        panOnDrag={editMode ? [1, 2] : true}
        selectNodesOnDrag={false}
        connectionLineStyle={{ stroke: '#0f766e', strokeWidth: 2 }}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#0f766e', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#0f766e' },
        }}
        proOptions={{ hideAttribution: true }}
        style={{ borderRadius: 12 }}
      >
        <Background color="#e2e8f0" gap={20} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as AgentNodeData
            if (data?.isEntry) return '#059669'
            if (data?.agent?.ragEnabled) return '#16a34a'
            if (data?.agent?.mcpCalls > 0) return '#d97706'
            return '#64748b'
          }}
          maskColor="rgba(248, 250, 251, 0.7)"
          style={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
        />

        {/* Edit mode toggle */}
        <Panel position="top-left">
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={editMode}
                  onChange={(e) => setEditMode(e.target.checked)}
                  size="small"
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: '#0f766e' },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#0f766e' },
                  }}
                />
              }
              label={
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  {editMode ? <EditRounded sx={{ fontSize: 14, color: '#0f766e' }} /> : <LockRounded sx={{ fontSize: 14, color: '#94a3b8' }} />}
                  <Typography variant="caption" sx={{ fontWeight: 600, color: editMode ? '#0f766e' : '#94a3b8' }}>
                    {editMode ? 'Edit mode' : 'View only'}
                  </Typography>
                </Stack>
              }
              sx={{
                m: 0,
                px: 1.5,
                py: 0.75,
                bgcolor: 'rgba(255,255,255,0.95)',
                borderRadius: 2,
                border: '1px solid',
                borderColor: editMode ? 'rgba(15,118,110,0.3)' : '#e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                backdropFilter: 'blur(8px)',
              }}
            />
            {editMode && (
              <Button
                size="small"
                variant="contained"
                onClick={onAddAgent}
                sx={{
                  bgcolor: '#0f766e',
                  '&:hover': { bgcolor: '#115e59' },
                  fontSize: 11,
                  px: 1.5,
                  py: 0.75,
                  minWidth: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
              >
                + Agent
              </Button>
            )}
          </Stack>
        </Panel>

        {/* Instructions */}
        <Panel position="top-right">
          <Box sx={{ px: 1.5, py: 1, bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 2, border: '1px solid #e2e8f0', backdropFilter: 'blur(8px)', maxWidth: 220 }}>
            <Typography variant="caption" sx={{ fontSize: 10, color: '#64748b', lineHeight: 1.6 }}>
              {editMode ? (
                <>
                  <strong style={{ color: '#0f766e' }}>Edit mode</strong><br/>
                  • Drag nodes to reposition<br/>
                  • Drag from ● handles to connect<br/>
                  • Click an edge to edit/delete<br/>
                  • Double-click a node to edit<br/>
                  • Middle-click/right-drag to pan
                </>
              ) : (
                <>
                  <strong>View mode</strong><br/>
                  • Scroll to zoom · Drag to pan<br/>
                  • Toggle Edit to rearrange
                </>
              )}
            </Typography>
          </Box>
        </Panel>

        {/* Legend */}
        <Panel position="bottom-left">
          <Stack direction="row" spacing={1.5} sx={{ px: 1.5, py: 0.75, bgcolor: 'rgba(255,255,255,0.9)', borderRadius: 2, border: '1px solid #e2e8f0', backdropFilter: 'blur(8px)' }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#059669' }} /><Typography variant="caption" sx={{ fontSize: 9 }}>Entry</Typography></Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#16a34a' }} /><Typography variant="caption" sx={{ fontSize: 9 }}>RAG</Typography></Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#d97706' }} /><Typography variant="caption" sx={{ fontSize: 9 }}>MCP</Typography></Stack>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#64748b' }} /><Typography variant="caption" sx={{ fontSize: 9 }}>Agent</Typography></Stack>
          </Stack>
        </Panel>
      </ReactFlow>

      {/* Agent Edit Dialog */}
      <AgentEditDialog
        agent={agents.find(a => a.id === editDialogId) ?? null}
        open={Boolean(editDialogId)}
        onClose={() => setEditDialogId(null)}
        onSave={(id, patch) => onUpdateAgent(id, patch)}
        onDelete={(id) => { onRemoveAgent(id); setEditDialogId(null) }}
        modelOptions={modelOptions}
      />

      {/* Edge Edit/Delete Dialog */}
      <EdgeEditDialog
        open={Boolean(deleteEdgeDialog)}
        edgeId={deleteEdgeDialog}
        weight={edges.find(e => e.id === deleteEdgeDialog)?.weight ?? 0.5}
        sourceName={agents.find(a => a.id === edges.find(e => e.id === deleteEdgeDialog)?.sourceId)?.name ?? ''}
        targetName={agents.find(a => a.id === edges.find(e => e.id === deleteEdgeDialog)?.targetId)?.name ?? ''}
        onClose={() => setDeleteEdgeDialog(null)}
        onSave={(id, weight) => { onUpdateEdge(id, { weight }); setDeleteEdgeDialog(null) }}
        onDelete={(id) => { onRemoveEdge(id); setDeleteEdgeDialog(null) }}
      />
    </Box>
  )
}

// --- Edge Edit Dialog ---

function EdgeEditDialog({ open, edgeId, weight, sourceName, targetName, onClose, onSave, onDelete }: {
  open: boolean
  edgeId: string | null
  weight: number
  sourceName: string
  targetName: string
  onClose: () => void
  onSave: (id: string, weight: number) => void
  onDelete: (id: string) => void
}) {
  const [val, setVal] = useState(Math.round(weight * 100))
  useEffect(() => { setVal(Math.round(weight * 100)) }, [weight])

  if (!edgeId) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Edit Connection</Typography>
        <Typography variant="body2" color="text.secondary">
          {sourceName} → {targetName}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Traffic probability — what % of conversations flowing through the source will trigger the target.
            </Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Slider
                value={val}
                min={0}
                max={100}
                step={5}
                marks={[{ value: 0, label: '0%' }, { value: 50, label: '50%' }, { value: 100, label: '100%' }]}
                valueLabelDisplay="auto"
                onChange={(_, v) => setVal(v as number)}
                sx={{ flex: 1, color: '#0f766e' }}
              />
              <TextField
                size="small"
                type="number"
                value={val}
                slotProps={{ htmlInput: { min: 0, max: 100, step: 5 } }}
                onChange={(e) => setVal(Number(e.target.value))}
                sx={{ width: 70 }}
              />
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Button size="small" color="error" variant="outlined" onClick={() => onDelete(edgeId)}>
          Delete connection
        </Button>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={() => onSave(edgeId, val / 100)}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}>
            Save
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  )
}
