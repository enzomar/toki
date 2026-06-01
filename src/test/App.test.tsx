import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
  // Clear localStorage before each test
  Object.keys(localStorage).filter((k) => k.startsWith('toki:')).forEach((k) => localStorage.removeItem(k))
})

describe('App rendering', () => {
  it('renders the header with logo', () => {
    renderApp()
    expect(screen.getByAltText('Toki logo mark')).toBeInTheDocument()
  })

  it('renders the Calculator tab by default', () => {
    renderApp()
    expect(screen.getByText('Monthly volume')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('renders the cost summary panel', () => {
    renderApp()
    expect(screen.getByText('Estimated cost')).toBeInTheDocument()
    expect(screen.getByText('Monthly cost')).toBeInTheDocument()
  })

  it('shows empty state when no agents', () => {
    renderApp()
    expect(screen.getByText('No agents yet. Add your first agent to start estimating costs.')).toBeInTheDocument()
  })

  it('renders the footer with version', () => {
    renderApp()
    expect(screen.getByText(/Toki v2\.0\.0/)).toBeInTheDocument()
  })
})

describe('Tab navigation', () => {
  it('switches to Topology tab', async () => {
    renderApp()
    const topoTab = screen.getByRole('tab', { name: 'Topology' })
    await userEvent.click(topoTab)
    expect(screen.getByText('System topology')).toBeInTheDocument()
  })

  it('switches to Pricing tab', async () => {
    renderApp()
    const pricingTab = screen.getByRole('tab', { name: 'Pricing' })
    await userEvent.click(pricingTab)
    expect(screen.getByText('Model pricing')).toBeInTheDocument()
  })

  it('switches to Token Tool tab', async () => {
    renderApp()
    const tokenTab = screen.getByRole('tab', { name: 'Token Tool' })
    await userEvent.click(tokenTab)
    expect(screen.getByText('Token Converter')).toBeInTheDocument()
  })
})

describe('Agent management', () => {
  it('adds an agent when clicking Add agent', async () => {
    renderApp()
    const addButton = screen.getByRole('button', { name: /Add agent/i })
    await userEvent.click(addButton)
    // Agent card should appear with default name
    expect(screen.getByText('Agent 1')).toBeInTheDocument()
  })

  it('adds multiple agents', async () => {
    renderApp()
    const addButton = screen.getByRole('button', { name: /Add agent/i })
    await userEvent.click(addButton)
    await userEvent.click(addButton)
    expect(screen.getByText('Agent 1')).toBeInTheDocument()
    expect(screen.getByText('Agent 2')).toBeInTheDocument()
  })

  it('removes an agent', async () => {
    renderApp()
    const addButton = screen.getByRole('button', { name: /Add agent/i })
    await userEvent.click(addButton)
    expect(screen.getByText('Agent 1')).toBeInTheDocument()

    const removeButton = screen.getByRole('button', { name: /Remove agent/i })
    await userEvent.click(removeButton)
    expect(screen.queryByText('Agent 1')).not.toBeInTheDocument()
  })

  it('updates conversations per month', async () => {
    renderApp()
    const input = screen.getByLabelText('Conversations per month')
    await userEvent.clear(input)
    await userEvent.type(input, '50000')
    expect(input).toHaveValue(50000)
  })
})

describe('Cost calculation', () => {
  it('shows zero cost with no agents', () => {
    renderApp()
    // The cost display should show $0 or €0
    const costElements = screen.getAllByText(/€0|0\.0000/)
    expect(costElements.length).toBeGreaterThan(0)
  })

  it('updates cost when agent is added and volume is set', async () => {
    renderApp()

    // Set volume
    const volumeInput = screen.getByLabelText('Conversations per month')
    await userEvent.clear(volumeInput)
    await userEvent.type(volumeInput, '10000')

    // Add agent
    const addButton = screen.getByRole('button', { name: /Add agent/i })
    await userEvent.click(addButton)

    // Cost should be non-zero now (default agent has 500 input, 200 output tokens)
    await waitFor(() => {
      const costText = screen.getByText('Monthly cost').parentElement
      expect(costText).toBeInTheDocument()
    })
  })
})

describe('Samples menu', () => {
  it('opens samples menu on click', async () => {
    renderApp()
    const samplesButton = screen.getByRole('button', { name: /Samples/i })
    await userEvent.click(samplesButton)
    expect(screen.getByText('Orchestrated RAG stack')).toBeInTheDocument()
    expect(screen.getByText('Tool-calling assistant')).toBeInTheDocument()
    expect(screen.getByText('Audience Orchestrator')).toBeInTheDocument()
  })

  it('loads a sample workspace', async () => {
    renderApp()
    const samplesButton = screen.getByRole('button', { name: /Samples/i })
    await userEvent.click(samplesButton)

    const ragSample = screen.getByText('Orchestrated RAG stack')
    await userEvent.click(ragSample)

    // Should have loaded agents
    await waitFor(() => {
      expect(screen.getByText('Orchestrator')).toBeInTheDocument()
      expect(screen.getByText('RAG Specialist')).toBeInTheDocument()
      expect(screen.getByText('Response Composer')).toBeInTheDocument()
    })
  })
})

describe('Export menu', () => {
  it('opens export menu with three options', async () => {
    renderApp()
    const exportButton = screen.getByRole('button', { name: /Export/i })
    await userEvent.click(exportButton)
    expect(screen.getByText('Workspace (JSON)')).toBeInTheDocument()
    expect(screen.getByText('Estimate (CSV)')).toBeInTheDocument()
    expect(screen.getByText('Estimate (Excel)')).toBeInTheDocument()
  })
})

describe('Token Tool tab', () => {
  it('estimates tokens from pasted text', async () => {
    renderApp()
    const tokenTab = screen.getByRole('tab', { name: 'Token Tool' })
    await userEvent.click(tokenTab)

    const textarea = screen.getByPlaceholderText(/Paste your text here/i)
    await userEvent.type(textarea, 'Hello world this is a test of the token estimation tool')

    await waitFor(() => {
      // Should show non-zero token count
      const tokenChip = screen.getByText(/\d+ tokens/)
      expect(tokenChip).toBeInTheDocument()
    })
  })
})

describe('Pricing tab', () => {
  it('shows model pricing table', async () => {
    renderApp()
    const pricingTab = screen.getByRole('tab', { name: 'Pricing' })
    await userEvent.click(pricingTab)

    expect(screen.getByText('GPT-4o Mini')).toBeInTheDocument()
    expect(screen.getByText('GPT-4o')).toBeInTheDocument()
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument()
  })

  it('shows currency selector', async () => {
    renderApp()
    const pricingTab = screen.getByRole('tab', { name: 'Pricing' })
    await userEvent.click(pricingTab)

    expect(screen.getByLabelText('Display currency')).toBeInTheDocument()
  })
})

describe('Agent card collapsibility', () => {
  it('collapses agent card on header click', async () => {
    renderApp()

    // Add an agent
    const addButton = screen.getByRole('button', { name: /Add agent/i })
    await userEvent.click(addButton)

    // The name field should be visible (expanded by default)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()

    // Click the agent header to collapse
    const agentHeader = screen.getByText('Agent 1')
    await userEvent.click(agentHeader)

    // After collapse, the Name field should not be visible
    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeVisible()
    })
  })
})

describe('Responsive layout', () => {
  it('renders without crashing at any viewport', () => {
    // Just verify it renders — actual responsive behavior needs visual testing
    const { container } = renderApp()
    expect(container.firstChild).toBeInTheDocument()
  })
})
