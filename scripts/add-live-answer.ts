import fs from 'fs'

const p = 'src/App.tsx'
let code = fs.readFileSync(p, 'utf-8')

const stepperBlock = `          <Step completed={runtimeAnswerMode === 'calibrated' || runtimeAnswerMode === 'detailed'}>
            <StepButton onClick={() => setWorkspaceTab('results')}>4. Final Answer</StepButton>
          </Step>
        </Stepper>`

const insertPos = code.indexOf(stepperBlock) + stepperBlock.length

const liveAnswerCode = `

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mb: 4,
            borderColor: runtimeAnswerMode === 'calibrated' || runtimeAnswerMode === 'detailed' ? 'success.main' : 'rgba(19, 34, 56, 0.12)',
            bgcolor: runtimeAnswerMode === 'calibrated' || runtimeAnswerMode === 'detailed' ? (theme) => alpha(theme.palette.success.main, 0.04) : 'rgba(246, 248, 251, 0.95)',
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}>
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.1em' }}>
                CURRENT ANSWER
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.25 }}>
                {runtimeAnswerHeadline}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 800 }}>
                {runtimeAnswerText}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Chip label={runtimeAnswerConfidence.label} color={runtimeAnswerConfidence.color} variant="outlined" />
              {runtimeAnswerMode === 'calibrated' || runtimeAnswerMode === 'detailed' ? (
                <Button variant="contained" color="success" onClick={copyRuntimeAnswer}>
                  Copy Answer
                </Button>
              ) : null}
            </Stack>
          </Stack>
        </Paper>`

code = code.substring(0, insertPos) + liveAnswerCode + code.substring(insertPos)

fs.writeFileSync(p, code)
console.log('Done inserting Live Answer')
