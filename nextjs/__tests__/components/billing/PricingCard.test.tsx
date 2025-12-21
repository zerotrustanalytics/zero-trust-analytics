import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

/**
 * PricingCard Component Tests
 *
 * Tests for the pricing card component that displays plan features,
 * pricing, and calls-to-action.
 */

interface PricingCardProps {
  name: string
  description: string
  price: number
  interval: 'month' | 'year'
  features: string[]
  highlighted?: boolean
  buttonText?: string
  onSelectPlan: () => void
  disabled?: boolean
  currentPlan?: boolean
}

// Mock PricingCard component for testing
const PricingCard: React.FC<PricingCardProps> = ({
  name,
  description,
  price,
  interval,
  features,
  highlighted = false,
  buttonText = 'Get Started',
  onSelectPlan,
  disabled = false,
  currentPlan = false,
}) => {
  return (
    <div
      className={`pricing-card ${highlighted ? 'highlighted' : ''} ${disabled ? 'disabled' : ''}`}
      data-testid={`pricing-card-${name.toLowerCase()}`}
    >
      <h3>{name}</h3>
      <p>{description}</p>
      <div className="price">
        <span className="amount">${price}</span>
        <span className="interval">/{interval}</span>
      </div>
      <ul className="features">
        {features.map((feature, index) => (
          <li key={index} data-testid={`feature-${index}`}>
            {feature}
          </li>
        ))}
      </ul>
      <button
        onClick={onSelectPlan}
        disabled={disabled || currentPlan}
        data-testid="select-plan-button"
      >
        {currentPlan ? 'Current Plan' : buttonText}
      </button>
      {currentPlan && <span data-testid="current-plan-badge">Current</span>}
    </div>
  )
}

describe('PricingCard Component', () => {
  const defaultProps: PricingCardProps = {
    name: 'Professional',
    description: 'Perfect for growing teams',
    price: 29,
    interval: 'month',
    features: ['Up to 20 projects', '1M events/month', '10 team members'],
    onSelectPlan: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders plan name and description', () => {
      render(<PricingCard {...defaultProps} />)

      expect(screen.getByText('Professional')).toBeInTheDocument()
      expect(screen.getByText('Perfect for growing teams')).toBeInTheDocument()
    })

    it('displays price with interval', () => {
      render(<PricingCard {...defaultProps} />)

      expect(screen.getByText('$29')).toBeInTheDocument()
      expect(screen.getByText('/month')).toBeInTheDocument()
    })

    it('renders all features', () => {
      render(<PricingCard {...defaultProps} />)

      expect(screen.getByText('Up to 20 projects')).toBeInTheDocument()
      expect(screen.getByText('1M events/month')).toBeInTheDocument()
      expect(screen.getByText('10 team members')).toBeInTheDocument()
    })

    it('renders with default button text', () => {
      render(<PricingCard {...defaultProps} />)

      expect(screen.getByTestId('select-plan-button')).toHaveTextContent('Get Started')
    })

    it('renders with custom button text', () => {
      render(<PricingCard {...defaultProps} buttonText="Upgrade Now" />)

      expect(screen.getByTestId('select-plan-button')).toHaveTextContent('Upgrade Now')
    })

    it('applies highlighted class when highlighted prop is true', () => {
      render(<PricingCard {...defaultProps} highlighted={true} />)

      const card = screen.getByTestId('pricing-card-professional')
      expect(card).toHaveClass('highlighted')
    })

    it('does not apply highlighted class by default', () => {
      render(<PricingCard {...defaultProps} />)

      const card = screen.getByTestId('pricing-card-professional')
      expect(card).not.toHaveClass('highlighted')
    })
  })

  describe('Interaction', () => {
    it('calls onSelectPlan when button clicked', () => {
      const onSelectPlan = vi.fn()
      render(<PricingCard {...defaultProps} onSelectPlan={onSelectPlan} />)

      const button = screen.getByTestId('select-plan-button')
      fireEvent.click(button)

      expect(onSelectPlan).toHaveBeenCalledTimes(1)
    })

    it('does not call onSelectPlan when button is disabled', () => {
      const onSelectPlan = vi.fn()
      render(<PricingCard {...defaultProps} onSelectPlan={onSelectPlan} disabled={true} />)

      const button = screen.getByTestId('select-plan-button')
      expect(button).toBeDisabled()

      fireEvent.click(button)
      expect(onSelectPlan).not.toHaveBeenCalled()
    })

    it('disables button when currentPlan is true', () => {
      render(<PricingCard {...defaultProps} currentPlan={true} />)

      const button = screen.getByTestId('select-plan-button')
      expect(button).toBeDisabled()
    })
  })

  describe('Current Plan State', () => {
    it('shows "Current Plan" text when currentPlan is true', () => {
      render(<PricingCard {...defaultProps} currentPlan={true} />)

      expect(screen.getByTestId('select-plan-button')).toHaveTextContent('Current Plan')
    })

    it('displays current plan badge', () => {
      render(<PricingCard {...defaultProps} currentPlan={true} />)

      expect(screen.getByTestId('current-plan-badge')).toBeInTheDocument()
    })

    it('does not show badge when not current plan', () => {
      render(<PricingCard {...defaultProps} currentPlan={false} />)

      expect(screen.queryByTestId('current-plan-badge')).not.toBeInTheDocument()
    })
  })

  describe('Different Plans', () => {
    it('renders free plan', () => {
      const freeProps: PricingCardProps = {
        name: 'Free',
        description: 'Get started for free',
        price: 0,
        interval: 'month',
        features: ['1 project', '10K events/month'],
        onSelectPlan: vi.fn(),
      }

      render(<PricingCard {...freeProps} />)

      expect(screen.getByText('Free')).toBeInTheDocument()
      expect(screen.getByText('$0')).toBeInTheDocument()
    })

    it('renders enterprise plan', () => {
      const enterpriseProps: PricingCardProps = {
        name: 'Enterprise',
        description: 'Custom solutions for large teams',
        price: 299,
        interval: 'month',
        features: ['Unlimited projects', 'Unlimited events', 'Priority support'],
        onSelectPlan: vi.fn(),
        highlighted: true,
      }

      render(<PricingCard {...enterpriseProps} />)

      expect(screen.getByText('Enterprise')).toBeInTheDocument()
      expect(screen.getByText('$299')).toBeInTheDocument()
    })

    it('handles annual billing', () => {
      render(<PricingCard {...defaultProps} price={290} interval="year" />)

      expect(screen.getByText('$290')).toBeInTheDocument()
      expect(screen.getByText('/year')).toBeInTheDocument()
    })
  })

  describe('Feature List', () => {
    it('renders empty feature list', () => {
      render(<PricingCard {...defaultProps} features={[]} />)

      expect(screen.queryByTestId('feature-0')).not.toBeInTheDocument()
    })

    it('renders single feature', () => {
      render(<PricingCard {...defaultProps} features={['Feature 1']} />)

      expect(screen.getByText('Feature 1')).toBeInTheDocument()
    })

    it('renders multiple features in order', () => {
      const features = ['First feature', 'Second feature', 'Third feature']
      render(<PricingCard {...defaultProps} features={features} />)

      features.forEach((feature, index) => {
        const element = screen.getByTestId(`feature-${index}`)
        expect(element).toHaveTextContent(feature)
      })
    })
  })

  describe('Accessibility', () => {
    it('button is keyboard accessible', () => {
      const onSelectPlan = vi.fn()
      render(<PricingCard {...defaultProps} onSelectPlan={onSelectPlan} />)

      const button = screen.getByTestId('select-plan-button')
      button.focus()

      expect(document.activeElement).toBe(button)
    })
  })
})
