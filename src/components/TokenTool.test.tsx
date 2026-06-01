import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider, createTheme } from '@mui/material'
import { TokenToolDialog, TokenToolInlineButton } from './TokenTool'

const theme = createTheme()

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

describe('TokenToolDialog', () => {
  it('renders when open', () => {
    wrap(<TokenToolDialog open={true} onClose={() => {}} />)
    expect(screen.getByText('Token Converter')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    wrap(<TokenToolDialog open={false} onClose={() => {}} />)
    expect(screen.queryByText('Token Converter')).not.toBeInTheDocument()
  })

  it('shows token count for typed text', async () => {
    wrap(<TokenToolDialog open={true} onClose={() => {}} />)
    const textarea = screen.getByPlaceholderText(/Paste your text/i)
    await userEvent.type(textarea, 'Hello world testing tokens')

    expect(screen.getByText(/\d+ tokens/)).toBeInTheDocument()
    expect(screen.getByText(/\d+ words/)).toBeInTheDocument()
    expect(screen.getByText(/\d+ chars/)).toBeInTheDocument()
  })

  it('shows 0 tokens for empty input', () => {
    wrap(<TokenToolDialog open={true} onClose={() => {}} />)
    expect(screen.getByText('0 tokens')).toBeInTheDocument()
  })

  it('calls onApply with token count', async () => {
    const onApply = vi.fn()
    wrap(<TokenToolDialog open={true} onClose={() => {}} onApply={onApply} applyLabel="Use value" />)

    const textarea = screen.getByPlaceholderText(/Paste your text/i)
    await userEvent.type(textarea, 'Some text for estimation')

    const applyButton = screen.getByRole('button', { name: 'Use value' })
    await userEvent.click(applyButton)

    expect(onApply).toHaveBeenCalledWith(expect.any(Number))
    expect(onApply.mock.calls[0][0]).toBeGreaterThan(0)
  })

  it('disables apply button when no text', () => {
    wrap(<TokenToolDialog open={true} onClose={() => {}} onApply={() => {}} applyLabel="Apply" />)
    const applyButton = screen.getByRole('button', { name: 'Apply' })
    expect(applyButton).toBeDisabled()
  })

  it('calls onClose when Close is clicked', async () => {
    const onClose = vi.fn()
    wrap(<TokenToolDialog open={true} onClose={onClose} />)
    const closeButton = screen.getByRole('button', { name: 'Close' })
    await userEvent.click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TokenToolInlineButton', () => {
  it('renders a calculator icon button', () => {
    wrap(<TokenToolInlineButton onResult={() => {}} />)
    expect(screen.getByRole('button', { name: /Estimate tokens/i })).toBeInTheDocument()
  })

  it('opens dialog on click', async () => {
    wrap(<TokenToolInlineButton onResult={() => {}} />)
    const button = screen.getByRole('button', { name: /Estimate tokens/i })
    await userEvent.click(button)
    expect(screen.getByText('Token Converter')).toBeInTheDocument()
  })
})
