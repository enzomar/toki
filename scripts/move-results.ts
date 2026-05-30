import fs from 'fs'

const p = 'src/App.tsx'
let code = fs.readFileSync(p, 'utf-8')

// the first results block starts with:
//        {workspaceTab === 'results' ? (
//          <>
//            <Paper

const blockStart = code.indexOf(`{workspaceTab === 'results' ? (\n          <>\n            <Paper`)
if (blockStart === -1) throw new Error("Could not find start")

// the block ends with:
//          </>
//        ) : null}
//
//        {workspaceTab === 'estimate' ? (

const blockEndStr = `          </>\n        ) : null}\n\n        {workspaceTab === 'estimate' ? (`
const blockEnd = code.indexOf(blockEndStr)
if (blockEnd === -1) throw new Error("Could not find end")

const blockContent = code.substring(blockStart + `{workspaceTab === 'results' ? (\n          <>\n`.length, blockEnd)

// remove the first results block completely
code = code.substring(0, blockStart) + code.substring(blockEnd + `          </>\n        ) : null}\n\n`.length)

// now find the second one:
//        {workspaceTab === 'results' ? (
//          <Box sx={{ maxWidth: 980, mx: 'auto' }}>

const targetPos = code.indexOf(`{workspaceTab === 'results' ? (\n          <Box`)
if (targetPos === -1) throw new Error("Could not find target")

// inject the content right inside the second block! Wait, it should go before the Box? Or after?
// Let's put it right after `{workspaceTab === 'results' ? (\n          <>\n`
// oh, the second block doesn't have a `<>`. Let's add it!
code = code.substring(0, targetPos) + `{workspaceTab === 'results' ? (\n          <>\n` + blockContent + `\n` + code.substring(targetPos + `{workspaceTab === 'results' ? (\n`.length).replace(`            </Paper>\n          </Box>\n        ) : null}`, `            </Paper>\n          </Box>\n          </>\n        ) : null}`)

fs.writeFileSync(p, code)
console.log('Done moving')
