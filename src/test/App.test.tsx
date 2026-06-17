import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, createTheme } from '@mui/material'
import App from '../App'

const theme = createTheme()

function renderApp() {
  return render(
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  Object.keys(localStorage).filter((k) => k.startsWith('toki:')).forEach((k) => localStorage.removeItem(k))
})

describe('App rendering', () => {
  it('renders the sidebar with logo', () => {
    renderApp()
    expect(screen.getByAltText('Toki logo mark')).toBeInTheDocument()
  })

  it('renders the Workspace page by default', () => {
    renderApp()
    expect(screen.getByText('Traffic Volume')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('renders the cost forecast panel', () => {
    renderApp()
    expect(screen.getByText('Cost Forecast')).toBeInTheDocument()
  })

  it('shows empty state when no agents', () => {
    renderApp()
    expect(screen.getByText('Get started')).toBeInTheDocument()
  })
})

describe('Navigation', () => {
  it('switches to Topology page', async () => {
    renderApp()
    const topoNav = screen.getByText('Topology')
    await userEvent.click(topoNav)
    expect(screen.getByText('No agents yet')).toBeInTheDocument()
  })

  it('switches to Settings page', async () => {
    renderApp()
    const settingsNav = screen.getByText('Settings')
    await userEvent.click(settingsNav)
    expect(screen.getByText('Model Pricing')).toBeInTheDocument()
  })

  it('switches to Simulation page', async () => {
    renderApp()
    const simNav = screen.getByText('Simulation')
    await userEvent.click(simNav)
    expect(screen.getByText('DES Simulator')).toBeInTheDocument()
  })

  it('switches to Help page', async () => {
    renderApp()
    const helpNav = screen.getByText('Help')
    await userEvent.click(helpNav)
    expect(screen.getByText('Help & Documentation')).toBeInTheDocument()
  })
})

describe('Agent management', () => {
  it('adds an agent when clicking Add agent', async () => {
    renderApp()
    const addButtons = screen.getAllByRole('button', { name: /Add agent/i })
    await userEvent.click(addButtons[0])
    expect(screen.getAllByText('Agent 1').length).toBeGreaterThan(0)
  })

  it('adds multiple agents', async () => {
    renderApp()
    const addButtons = screen.getAllByRole('button', { name: /Add agent/i })
    await userEvent.click(addButtons[0])
    await userEvent.click(addButtons[0])
    expect(screen.getAllByText('Agent 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Agent 2').length).toBeGreaterThan(0)
  })
})

describe('Responsive layout', () => {
  it('renders without crashing', () => {
    const { container } = renderApp()
    expect(container.firstChild).toBeInTheDocument()
  })
})
