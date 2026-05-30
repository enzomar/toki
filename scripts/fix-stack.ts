import fs from 'fs'

const p = 'src/App.tsx'
let code = fs.readFileSync(p, 'utf-8')

code = code.replace('<Stack direction="row" spacing={2} alignItems="center">', '<Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>')
code = code.replace('<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">', '<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>')

fs.writeFileSync(p, code)
console.log('Done fixing layout issues')

