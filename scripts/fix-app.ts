import fs from 'fs'

const p = 'src/App.tsx'
let code = fs.readFileSync(p, 'utf-8')

// We will find the Dialog elements and extract them.
const pricingStart = code.indexOf('<Dialog open={isPricingDialogOpen}')
const pricingEnd = code.indexOf('</Dialog>', pricingStart) + 9

const plannerStart = code.indexOf('<Dialog open={isTokenAssistantOpen}')
const plannerEnd = code.indexOf('</Dialog>', plannerStart) + 9

const pricingStr = code.substring(pricingStart, pricingEnd)
const plannerStr = code.substring(plannerStart, plannerEnd)

// Remove them from where they are
code = code.substring(0, pricingStart) + code.substring(pricingEnd, plannerStart) + code.substring(plannerEnd)

// We also need to REMOVE the old Workspace tools block
// Let's find it: <Paper sx={{ ... "Workspace tools" ... </Paper>
const toolsTitle = '<Typography variant="h6">Workspace tools</Typography>'
const toolsInnerIdx = code.indexOf(toolsTitle)
const toolsBeforePaper = code.lastIndexOf('<Paper', toolsInnerIdx)
const toolsAfterPaper = code.indexOf('</Paper>', toolsInnerIdx) + 8

code = code.substring(0, toolsBeforePaper) + code.substring(toolsAfterPaper)

// Now we need to insert the Dialogs right after the Stepper closed
const statusPos = code.indexOf('{status ? (')
code = code.substring(0, statusPos) + pricingStr + '\n\n' + plannerStr + '\n\n' + code.substring(statusPos)

fs.writeFileSync(p, code)
console.log('Done fixing layout issues')

