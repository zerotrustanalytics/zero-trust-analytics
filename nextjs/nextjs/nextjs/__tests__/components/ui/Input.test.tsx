import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Input } from '@/components/ui/Input'

describe('Input', () => {
  describe('rendering', () => {
    it('renders input element', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('renders with label', () => {
      render(<Input label="Email" name="email" />)
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
    })

    it('renders without label', () => {
      render(<Input placeholder="Enter text" />)
      expect(screen.queryByRole('label')).not.toBeInTheDocument()
    })

    it('renders with placeholder', () => {
      render(<Input placeholder="Enter your email" />)
      expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('displays error message', () => {
      render(<Input name="email" error="Email is required" />)
      expect(screen.getByText('Email is required')).toBeInTheDocument()
    })

    it('has error role on error message', () => {
      render(<Input name="email" error="Invalid email" />)
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email')
    })

    it('applies error styles', () => {
      render(<Input name="email" error="Error" />)
      expect(screen.getByRole('textbox')).toHaveClass('border-destructive')
    })

    it('sets aria-invalid when error', () => {
      render(<Input name="email" error="Error" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    })

    it('sets aria-describedby to error id', () => {
      render(<Input name="email" id="email-input" error="Error" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'email-input-error')
    })
  })

  describe('hint state', () => {
    it('displays hint text', () => {
      render(<Input name="password" hint="Must be 8+ characters" />)
      expect(screen.getByText('Must be 8+ characters')).toBeInTheDocument()
    })

    it('sets aria-describedby to hint id', () => {
      render(<Input name="password" id="password-input" hint="Hint text" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', 'password-input-hint')
    })

    it('error takes precedence over hint', () => {
      render(<Input name="field" error="Error text" hint="Hint text" />)
      expect(screen.getByText('Error text')).toBeInTheDocument()
      expect(screen.queryByText('Hint text')).not.toBeInTheDocument()
    })
  })

  describe('interactions', () => {
    it('handles onChange', async () => {
      const handleChange = vi.fn()
      render(<Input onChange={handleChange} />)
      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'test')
      expect(handleChange).toHaveBeenCalled()
    })

    it('handles onBlur', () => {
      const handleBlur = vi.fn()
      render(<Input onBlur={handleBlur} />)
      const input = screen.getByRole('textbox')
      fireEvent.blur(input)
      expect(handleBlur).toHaveBeenCalledTimes(1)
    })

    it('handles onFocus', () => {
      const handleFocus = vi.fn()
      render(<Input onFocus={handleFocus} />)
      const input = screen.getByRole('textbox')
      fireEvent.focus(input)
      expect(handleFocus).toHaveBeenCalledTimes(1)
    })

    it('accepts and displays typed value', async () => {
      render(<Input />)
      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'Hello World')
      expect(input).toHaveValue('Hello World')
    })
  })

  describe('disabled state', () => {
    it('can be disabled', () => {
      render(<Input disabled />)
      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('applies disabled styles', () => {
      render(<Input disabled />)
      expect(screen.getByRole('textbox')).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed')
    })
  })

  describe('input types', () => {
    it('can be queried as textbox (default input behavior)', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('accepts email type', () => {
      render(<Input type="email" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email')
    })

    it('accepts password type', () => {
      render(<Input type="password" />)
      // password inputs don't have textbox role
      expect(document.querySelector('input[type="password"]')).toBeInTheDocument()
    })

    it('accepts number type', () => {
      render(<Input type="number" />)
      expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number')
    })
  })

  describe('accessibility', () => {
    it('links label to input via htmlFor', () => {
      render(<Input label="Username" id="username" />)
      const label = screen.getByText('Username')
      expect(label).toHaveAttribute('for', 'username')
    })

    it('uses name as id fallback', () => {
      render(<Input label="Email" name="email" />)
      expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'email')
    })

    it('is focusable', () => {
      render(<Input />)
      const input = screen.getByRole('textbox')
      input.focus()
      expect(input).toHaveFocus()
    })

    it('has focus ring styles', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).toHaveClass('focus:ring-2', 'focus:ring-primary')
    })

    it('accepts custom className', () => {
      render(<Input className="custom-input" />)
      expect(screen.getByRole('textbox')).toHaveClass('custom-input')
    })

    it('forwards ref correctly', () => {
      const ref = { current: null }
      render(<Input ref={ref} />)
      expect(ref.current).toBeInstanceOf(HTMLInputElement)
    })
  })

  describe('required field', () => {
    it('accepts required attribute', () => {
      render(<Input required />)
      expect(screen.getByRole('textbox')).toBeRequired()
    })
  })
})
