/**
 * AppShell — Main layout wrapper providing the navigation sidebar and content area.
 * Professional dashboard-style layout with collapsible nav.
 */
import { useState } from 'react'
import {
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import {
  CalculateRounded,
  AccountTreeRounded,
  ScienceRounded,
  TuneRounded,
  HelpOutlineRounded,
  MenuRounded,
  ChevronLeftRounded,
  TokenRounded,
} from '@mui/icons-material'
import { TokiLogo } from '../atoms/TokiLogo'

export type NavPage = 'workspace' | 'topology' | 'simulation' | 'token-tool' | 'settings' | 'help'

type Props = {
  activePage: NavPage
  onNavigate: (page: NavPage) => void
  children: React.ReactNode
  version: string
}

const NAV_ITEMS: Array<{ id: NavPage; label: string; sublabel: string; icon: React.ReactNode; description: string }> = [
  { id: 'workspace', label: 'Workspace', sublabel: 'Design & Cost', icon: <CalculateRounded />, description: 'Design your system and forecast costs' },
  { id: 'topology', label: 'Topology', sublabel: 'Agent Graph', icon: <AccountTreeRounded />, description: 'Visualize agent connections' },
  { id: 'simulation', label: 'Simulation', sublabel: 'BETA - DES Load Test', icon: <ScienceRounded />, description: 'Discrete event simulation' },
  { id: 'token-tool', label: 'Token Tool', sublabel: 'Text → Tokens', icon: <TokenRounded />, description: 'Estimate token count from text' },
  { id: 'settings', label: 'Settings', sublabel: 'Pricing & Models', icon: <TuneRounded />, description: 'Pricing & configuration' },
  { id: 'help', label: 'Help', sublabel: 'Docs & Guides', icon: <HelpOutlineRounded />, description: 'Documentation & guides' },
]

const DRAWER_WIDTH = 220
const DRAWER_COLLAPSED = 64

export function AppShell({ activePage, onNavigate, children, version }: Props) {
  const isPhone = useMediaQuery('(max-width:900px)')
  const [drawerOpen, setDrawerOpen] = useState(!isPhone)
  const [mobileOpen, setMobileOpen] = useState(false)

  const drawerWidth = drawerOpen ? DRAWER_WIDTH : DRAWER_COLLAPSED

  const navContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#0b1523' }}>
      {/* Logo area */}
      <Stack
        direction="row"
        sx={{ px: drawerOpen ? 2 : 1.5, py: 2, alignItems: 'center', justifyContent: drawerOpen ? 'space-between' : 'center' }}
      >
        {drawerOpen ? (
          <>
            <TokiLogo light caption="" />
            {!isPhone && (
              <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                <ChevronLeftRounded fontSize="small" />
              </IconButton>
            )}
          </>
        ) : (
          <IconButton size="small" onClick={() => setDrawerOpen(true)} sx={{ color: 'rgba(255,255,255,0.7)' }}>
            <MenuRounded fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {/* Navigation */}
      <List sx={{ flex: 1, px: 1, py: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id
          const button = (
            <ListItemButton
              key={item.id}
              selected={isActive}
              onClick={() => {
                onNavigate(item.id)
                if (isPhone) setMobileOpen(false)
              }}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                px: drawerOpen ? 2 : 1.5,
                minHeight: 44,
                justifyContent: drawerOpen ? 'initial' : 'center',
                '&.Mui-selected': {
                  bgcolor: 'rgba(94, 234, 212, 0.1)',
                  '&:hover': { bgcolor: 'rgba(94, 234, 212, 0.15)' },
                },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: drawerOpen ? 36 : 'auto',
                  color: isActive ? '#5eead4' : 'rgba(255,255,255,0.5)',
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {drawerOpen && (
                <ListItemText
                  primary={item.label}
                  secondary={item.sublabel}
                  slotProps={{
                    primary: {
                      sx: { fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? '#f7fafc' : 'rgba(255,255,255,0.7)', lineHeight: 1.3 },
                    },
                    secondary: {
                      sx: { fontSize: 10, color: isActive ? 'rgba(94,234,212,0.7)' : 'rgba(255,255,255,0.35)', lineHeight: 1.2 },
                    },
                  }}
                />
              )}
            </ListItemButton>
          )

          return drawerOpen ? button : (
            <Tooltip key={item.id} title={item.label} placement="right" arrow>
              {button}
            </Tooltip>
          )
        })}
      </List>

      {/* Footer */}
      {drawerOpen && (
        <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
            Toki v{version}
          </Typography>
        </Box>
      )}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Desktop drawer */}
      {!isPhone && (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            transition: 'width 0.2s ease',
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              transition: 'width 0.2s ease',
              border: 'none',
              overflow: 'hidden',
            },
          }}
        >
          {navContent}
        </Drawer>
      )}

      {/* Mobile drawer */}
      {isPhone && (
        <>
          <Box sx={{ position: 'fixed', top: 12, left: 12, zIndex: 1300 }}>
            <IconButton onClick={() => setMobileOpen(true)} sx={{ bgcolor: '#0b1523', color: '#fff', '&:hover': { bgcolor: '#1e293b' } }}>
              <MenuRounded />
            </IconButton>
          </Box>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 'none' } }}
          >
            {navContent}
          </Drawer>
        </>
      )}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: '#f8fafb',
          minHeight: '100vh',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
