import { Box, Stack, Typography } from '@mui/material'

type TokiLogoProps = {
  light?: boolean
  caption?: string
}

export function TokiLogo({ light = false, caption = 'Multi-Agent Token Forecasting' }: TokiLogoProps) {
  const primaryColor = light ? 'common.white' : '#132238'
  const secondaryColor = light ? '#dbe6f3' : 'rgba(19, 34, 56, 0.72)'

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Box
        component="img"
        src={`${import.meta.env.BASE_URL}toki-logo.png`}
        alt="Toki logo mark"
        sx={{ height: { xs: 46, md: 52 }, width: 'auto', display: 'block', flexShrink: 0 }}
      />
      <Box>
        <Typography
          sx={{
            color: primaryColor,
            fontSize: { xs: '1.52rem', md: '1.8rem' },
            fontWeight: 900,
            letterSpacing: '0.22em',
            lineHeight: 0.95,
            pl: '0.22em',
          }}
        >
          TOKI
        </Typography>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.55,
            color: secondaryColor,
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            fontWeight: 700,
          }}
        >
          {caption}
        </Typography>
      </Box>
    </Stack>
  )
}