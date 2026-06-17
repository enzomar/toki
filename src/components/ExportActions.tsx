/**
 * ExportActions — All export logic extracted from App.tsx
 * Handles: CSV, Excel, PDF, Workspace JSON, Share URL, Copy to Clipboard
 */
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Button, Divider, ListItemText, Menu, MenuItem, Stack, Tooltip } from '@mui/material'
import { FileDownloadOutlined, FileUploadOutlined, ShareRounded, ContentCopyRounded } from '@mui/icons-material'
import type { Agent, Edge, EstimateConfig, EstimateSummary, WorkspacePricing } from '../features/topology/types'
import type { ExternalForecastResult } from '../features/forecasting/aeir'
import type { AEIRSimConfig } from '../features/forecasting/aeir-config'
import {
  createTopologyDocument,
  encodeWorkspaceToUrl,
  formatCurrency,
  formatMetricNumber,
  getModelLabel,
  parseTopologyDocument,
} from '../features/topology/utils'

type Props = {
  agents: Agent[]
  edges: Edge[]
  estimateConfig: EstimateConfig
  scaledConfig: EstimateConfig
  pricing: WorkspacePricing
  estimate: EstimateSummary
  mcReport: ExternalForecastResult | null
  simConfig: AEIRSimConfig | null
  workspaceName: string
  onImport: (parsed: { agents: Agent[]; edges: Edge[]; estimate: EstimateConfig; pricing: WorkspacePricing }, simConfig?: AEIRSimConfig) => void
  onSnackbar: (msg: { severity: 'success' | 'error' | 'info'; message: string }) => void
}

export function ExportActions({ agents, edges, estimateConfig, scaledConfig, pricing, estimate, mcReport, simConfig, workspaceName, onImport, onSnackbar }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null)
  const formatCost = (v: number) => formatCurrency(v, pricing.currency || 'EUR')

  function fileSlug() {
    return workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'toki'
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // --- Workspace JSON ---
  const exportWorkspace = () => {
    const doc = createTopologyDocument(agents, edges, estimateConfig, pricing)
    const exportDoc = simConfig ? { ...doc, simConfig } : doc
    const blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `${fileSlug()}-workspace.json`)
    onSnackbar({ severity: 'success', message: 'Workspace exported as JSON.' })
  }

  // --- Import ---
  const importWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    try {
      const raw = JSON.parse(await file.text())
      const parsed = parseTopologyDocument(raw)
      const importedSimConfig = raw.simConfig && typeof raw.simConfig === 'object' ? raw.simConfig : undefined
      onImport(parsed, importedSimConfig)
      onSnackbar({ severity: 'success', message: `Imported: ${parsed.agents.length} agents.` })
    } catch (err) {
      onSnackbar({ severity: 'error', message: err instanceof Error ? err.message : 'Import failed.' })
    } finally {
      event.currentTarget.value = ''
    }
  }

  // --- Share URL ---
  const shareWorkspace = async () => {
    if (agents.length === 0) { onSnackbar({ severity: 'info', message: 'Add agents before sharing.' }); return }
    const doc = createTopologyDocument(agents, edges, estimateConfig, pricing)
    const shareUrl = encodeWorkspaceToUrl(doc)
    try {
      await navigator.clipboard.writeText(shareUrl)
      onSnackbar({ severity: 'success', message: 'Share link copied to clipboard.' })
    } catch {
      window.prompt('Copy this share link:', shareUrl)
    }
  }

  // --- Copy ---
  const copyEstimate = async () => {
    const lines = [
      `═══ ${workspaceName} ═══`,
      ``,
      `Traffic: ${scaledConfig.conversationsPerMonth.toLocaleString()} conv/mo`,
      `Agents: ${agents.length}`,
      ``,
      `── DETERMINISTIC ──`,
      `  Monthly cost: ${formatCost(estimate.totalCostPerMonth)}`,
      `  Cost/conv: ${formatCost(estimate.costPerConversation)}`,
      `  Tokens/mo: ${formatMetricNumber(estimate.totalTokensPerMonth)}`,
    ]
    if (mcReport) {
      lines.push(
        ``,
        `── MONTE CARLO (${mcReport.simulation_count} runs) ──`,
        `  Expected: ${formatCost(mcReport.cost_expected_monthly)}/mo`,
        `  p50: ${formatCost(mcReport.cost_p50_monthly)} · p90: ${formatCost(mcReport.cost_p90_monthly)} · p99: ${formatCost(mcReport.cost_p99_monthly)}`,
        `  Tail risk: ${mcReport.tail_risk_factor.toFixed(2)}× · Confidence: ${Math.round(mcReport.confidence_score * 100)}%`,
      )
    }
    lines.push(``, ...estimate.agents.map(a => `  ${a.name}: ${formatCost(a.costPerMonth)}/mo (${Math.round(a.trafficShare * 100)}%)`))
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      onSnackbar({ severity: 'success', message: 'Estimate copied.' })
    } catch { onSnackbar({ severity: 'error', message: 'Copy failed.' }) }
  }

  // --- CSV ---
  const exportCsv = () => {
    if (agents.length === 0) { onSnackbar({ severity: 'info', message: 'Add agents first.' }); return }
    const rows: (string | number)[][] = [
      ['Workspace', workspaceName],
      ['Conversations/month', scaledConfig.conversationsPerMonth],
      [],
      ['=== DETERMINISTIC ==='],
      ['Agent', 'Model', 'Traffic%', 'Calls/Conv', 'Input', 'Output', 'MCP', 'RAG', 'Tok/Mo', 'Cost/Mo'],
      ...estimate.agents.map(a => [a.name, a.model, Math.round(a.trafficShare * 100), agents.find(ag => ag.id === a.id)?.callsPerConversation ?? 0, a.inputTokensPerMonth, a.outputTokensPerMonth, agents.find(ag => ag.id === a.id)?.mcpCalls ?? 0, agents.find(ag => ag.id === a.id)?.ragEnabled ? 'yes' : 'no', a.totalTokensPerMonth, a.costPerMonth.toFixed(4)]),
      ['TOTAL', '', '', '', estimate.totalInputTokens, estimate.totalOutputTokens, '', '', estimate.totalTokensPerMonth, estimate.totalCostPerMonth.toFixed(4)],
    ]
    if (mcReport) {
      rows.push([], ['=== MONTE CARLO ==='], ['Metric', 'p50', 'p90', 'p99', 'Expected'])
      rows.push(['Tokens/conv', mcReport.tokens_p50_per_conv, mcReport.tokens_p90_per_conv, mcReport.tokens_p99_per_conv, mcReport.tokens_expected_per_conv])
      rows.push(['Cost/mo', mcReport.cost_p50_monthly.toFixed(2), mcReport.cost_p90_monthly.toFixed(2), mcReport.cost_p99_monthly.toFixed(2), mcReport.cost_expected_monthly.toFixed(2)])
      rows.push(['Confidence', Math.round(mcReport.confidence_score * 100) + '%'])
      rows.push(['Tail risk', mcReport.tail_risk_factor.toFixed(2)])
    }
    const csv = rows.map(r => (Array.isArray(r) ? r : [r]).map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `${fileSlug()}-forecast.csv`)
    onSnackbar({ severity: 'success', message: 'CSV exported.' })
  }

  // --- Excel ---
  const exportExcel = async () => {
    if (agents.length === 0) { onSnackbar({ severity: 'info', message: 'Add agents first.' }); return }
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Toki'

    // Sheet 1: Deterministic
    const ws = wb.addWorksheet('Deterministic')
    const hdr = ws.addRow(['Agent', 'Model', 'Traffic%', 'Tok/Mo', 'Cost/Mo (EUR)'])
    hdr.font = { bold: true }
    estimate.agents.forEach(a => { const r = ws.addRow([a.name, a.model, Math.round(a.trafficShare * 100), a.totalTokensPerMonth, a.costPerMonth]); r.getCell(5).numFmt = '€#,##0.00' })
    const tot = ws.addRow(['TOTAL', '', '', estimate.totalTokensPerMonth, estimate.totalCostPerMonth])
    tot.font = { bold: true }; tot.getCell(5).numFmt = '€#,##0.00'
    ws.columns.forEach(c => { c.width = 18 })

    // Sheet 2: Monte Carlo
    if (mcReport) {
      const mc = wb.addWorksheet('Monte Carlo')
      mc.addRow(['Monte Carlo Forecast']).font = { bold: true, size: 14 }
      mc.addRow([])
      const ph = mc.addRow(['', 'p50', 'p90', 'p99', 'Expected']); ph.font = { bold: true }
      mc.addRow(['Tokens/conv', mcReport.tokens_p50_per_conv, mcReport.tokens_p90_per_conv, mcReport.tokens_p99_per_conv, mcReport.tokens_expected_per_conv])
      const cr = mc.addRow(['Cost/mo', mcReport.cost_p50_monthly, mcReport.cost_p90_monthly, mcReport.cost_p99_monthly, mcReport.cost_expected_monthly])
      ;[2,3,4,5].forEach(i => { cr.getCell(i).numFmt = '€#,##0.00' })
      mc.addRow([]); mc.addRow(['Confidence', Math.round(mcReport.confidence_score * 100) + '%'])
      mc.addRow(['Tail risk', mcReport.tail_risk_factor.toFixed(2) + '×'])
      mc.addRow(['Simulations', mcReport.simulation_count])
      mc.columns.forEach(c => { c.width = 16 })
    }

    const buf = await wb.xlsx.writeBuffer()
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileSlug()}-forecast.xlsx`)
    onSnackbar({ severity: 'success', message: 'Excel exported.' })
  }

  // --- PDF ---
  const exportPdf = async () => {
    if (agents.length === 0) { onSnackbar({ severity: 'info', message: 'Add agents first.' }); return }
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 20

    // Title
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('Token Cost Forecast Report', pageWidth / 2, y, { align: 'center' })
    y += 8
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(workspaceName, pageWidth / 2, y, { align: 'center' })
    y += 4
    doc.text(`Generated ${new Date().toLocaleDateString()} · Toki v2`, pageWidth / 2, y, { align: 'center' })
    y += 12

    // Summary box
    doc.setTextColor(0)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Executive Summary', 14, y); y += 7
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Traffic volume: ${scaledConfig.conversationsPerMonth.toLocaleString()} conversations/month`, 14, y); y += 5
    doc.text(`Agents: ${agents.length}`, 14, y); y += 5
    doc.text(`Deterministic cost: ${formatCost(estimate.totalCostPerMonth)}/month`, 14, y); y += 5
    if (mcReport) {
      doc.text(`Monte Carlo expected cost: ${formatCost(mcReport.cost_expected_monthly)}/month`, 14, y); y += 5
      doc.text(`Monte Carlo p90 cost: ${formatCost(mcReport.cost_p90_monthly)}/month (budget recommendation)`, 14, y); y += 5
      doc.text(`Monte Carlo p99 cost: ${formatCost(mcReport.cost_p99_monthly)}/month (worst-case tail risk)`, 14, y); y += 5
      doc.text(`Confidence: ${Math.round(mcReport.confidence_score * 100)}% · Tail risk: ${mcReport.tail_risk_factor.toFixed(2)}×`, 14, y); y += 5
    }
    y += 8

    // Deterministic table
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Deterministic Breakdown (per agent)', 14, y); y += 3

    autoTable(doc, {
      startY: y,
      head: [['Agent', 'Model', 'Traffic', 'Tokens/mo', 'Cost/mo']],
      body: [
        ...estimate.agents.map(a => [a.name, getModelLabel(a.model), `${Math.round(a.trafficShare * 100)}%`, formatMetricNumber(a.totalTokensPerMonth), formatCost(a.costPerMonth)]),
        ['TOTAL', '', '', formatMetricNumber(estimate.totalTokensPerMonth), formatCost(estimate.totalCostPerMonth)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 118, 110] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    })

    y = (doc as any).lastAutoTable.finalY + 12

    // Monte Carlo section
    if (mcReport) {
      if (y > 240) { doc.addPage(); y = 20 }
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Monte Carlo Simulation Results', 14, y); y += 3

      autoTable(doc, {
        startY: y,
        head: [['Metric', 'p50', 'p90', 'p99', 'Expected']],
        body: [
          ['Tokens/conversation', formatMetricNumber(mcReport.tokens_p50_per_conv), formatMetricNumber(mcReport.tokens_p90_per_conv), formatMetricNumber(mcReport.tokens_p99_per_conv), formatMetricNumber(mcReport.tokens_expected_per_conv)],
          ['Cost/month', formatCost(mcReport.cost_p50_monthly), formatCost(mcReport.cost_p90_monthly), formatCost(mcReport.cost_p99_monthly), formatCost(mcReport.cost_expected_monthly)],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 118, 110] },
      })

      y = (doc as any).lastAutoTable.finalY + 8

      // Dominant nodes
      if (mcReport.dominant_nodes && mcReport.dominant_nodes.length > 0) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text('Top Cost Contributors', 14, y); y += 3

        autoTable(doc, {
          startY: y,
          head: [['Agent', 'Type', 'Tokens', 'Cost %', 'Risk']],
          body: mcReport.dominant_nodes.map(dn => [dn.label, dn.type, formatMetricNumber(dn.tokens_expected), `${Math.round(dn.cost_fraction * 100)}%`, dn.is_cost_spike ? '⚡ Spike' : 'Stable']),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [100, 116, 139] },
        })

        y = (doc as any).lastAutoTable.finalY + 8
      }

      // Metadata
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100)
      doc.text(`Simulations: ${mcReport.simulation_count} · Compile: ${mcReport.compilation_time_ms.toFixed(1)}ms · Sim: ${mcReport.simulation_time_ms.toFixed(0)}ms · Alignment: ×${mcReport.alignment_ratio.toFixed(2)}`, 14, y)
    }

    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text(`Toki Token Cost Forecast · ${workspaceName} · Page ${i}/${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })
    }

    doc.save(`${fileSlug()}-forecast-report.pdf`)
    onSnackbar({ severity: 'success', message: 'PDF report exported.' })
  }

  return (
    <>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={fileInputRef} hidden type="file" accept=".json" onChange={importWorkspace} />
        <Button size="small" startIcon={<FileUploadOutlined />} onClick={() => fileInputRef.current?.click()}>Import</Button>
        <Button size="small" startIcon={<FileDownloadOutlined />} onClick={(e) => setExportAnchor(e.currentTarget)}>Export</Button>
        <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
          <MenuItem onClick={() => { exportWorkspace(); setExportAnchor(null) }}>
            <ListItemText primary="Workspace (JSON)" secondary="Topology, pricing, simulation config" slotProps={{ secondary: { variant: 'caption' } }} />
          </MenuItem>
          <MenuItem onClick={() => { exportCsv(); setExportAnchor(null) }}>
            <ListItemText primary="Forecast (CSV)" secondary="Deterministic + Monte Carlo table" slotProps={{ secondary: { variant: 'caption' } }} />
          </MenuItem>
          <MenuItem onClick={() => { exportExcel(); setExportAnchor(null) }}>
            <ListItemText primary="Forecast (Excel)" secondary="Multi-sheet workbook with formulas" slotProps={{ secondary: { variant: 'caption' } }} />
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => { exportPdf(); setExportAnchor(null) }}>
            <ListItemText primary="Report (PDF)" secondary="Executive summary for stakeholders" slotProps={{ secondary: { variant: 'caption' } }} />
          </MenuItem>
        </Menu>
        <Button size="small" startIcon={<ShareRounded />} onClick={shareWorkspace}>Share</Button>
        <Tooltip title="Copy forecast to clipboard">
          <Button size="small" startIcon={<ContentCopyRounded />} onClick={copyEstimate}>Copy</Button>
        </Tooltip>
      </Stack>
    </>
  )
}
