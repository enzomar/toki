import fs from 'fs'
const p = 'src/App.tsx'
let code = fs.readFileSync(p, 'utf-8')

// We will update the copyRuntimeAnswer function to generate a rich markdown report
const functionStart = code.indexOf('const copyRuntimeAnswer = async () => {')
const functionEnd = code.indexOf('setStatus({ severity: \'success\'', functionStart)
if (functionStart > -1 && functionEnd > -1) {
  const replaceStr = `const copyRuntimeAnswer = async () => {
    if (!navigator.clipboard?.writeText) {
      setStatus({ severity: 'error', message: 'Clipboard is not available in this browser.' })
      return
    }

    const businessCaseReport = [
      '# Architecture Token Forecast: Business Case Report',
      '',
      \`**Query:** How many tokens will the system consume at runtime?\`,
      \`**Answer:** \${runtimeAnswerText}\`,
      '',
      '## 1. Runtime Forecast',
      \`- **Tokens per session:** \${report ? formatMetricNumber(forecastTokensPerSession) : formatMetricNumber(quickEstimateSummary.totalTokensPerSession)}\`,
      \`- **Tokens per minute:** \${report ? formatMetricNumber(detailedTokensPerMinute) : formatMetricNumber(baselineTokensPerMinute)}\`,
      \`- **Monthly tokens:** \${report ? formatMetricNumber(detailedMonthlyTokens) : formatMetricNumber(quickEstimateSummary.monthlyTokens)}\`,
      \`- **Monthly cost:** \${report ? formatCurrency(detailedMonthlyCost) : formatCurrency(quickEstimateSummary.monthlyCost)}\`,
      '',
      '## 2. Key Business Assumptions',
      ...runtimeAssumptionLines.map(line => \`- \${line}\`),
      '',
      '## 3. Audit Readiness',
      \`**Confidence Rating:** \${runtimeAnswerConfidence.label} (\${runtimeAnswerConfidence.helper})\`,
      \`**Completed Checks:** \${readyRequiredCount}/\${requiredRuntimeReadiness.length}\`,
      \`**Recommended Next Step:** \${runtimeNextStep.label}\`
    ].join('\\n')

    try {
      await navigator.clipboard.writeText(businessCaseReport)
      `
  
  const originalEnd = code.indexOf('} catch (error)', functionStart)
  code = code.substring(0, functionStart) + replaceStr + code.substring(originalEnd)
  fs.writeFileSync(p, code)
  console.log('Updated copyRuntimeAnswer to generate a robust Markdown export.')
}
