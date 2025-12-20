import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

/**
 * SubscriptionStatus Component Tests
 *
 * Tests for the subscription status display component that shows
 * current plan, usage, and subscription details.
 */

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'
type PlanTier = 'free' | 'starter' | 'professional' | 'enterprise'

interface SubscriptionStatusProps {
  status: SubscriptionStatus
  planTier: PlanTier
  currentPeriodEnd: Date
  cancelAtPeriodEnd?: boolean
  trialEnd?: Date
  onManageSubscription?: () => void
  onUpgrade?: () => void
  usage?: {
    projects: number
    events: number
    teamMembers: number
  }
  limits?: {
    projects: number
    events: number
    teamMembers: number
  }
}

// Mock SubscriptionStatus component for testing
const SubscriptionStatus: React.FC<SubscriptionStatusProps> = ({
  status,
  planTier,
  currentPeriodEnd,
  cancelAtPeriodEnd = false,
  trialEnd,
  onManageSubscription,
  onUpgrade,
  usage,
  limits,
}) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStatusColor = () => {
    switch (status) {
      case 'active':
        return 'green'
      case 'trialing':
        return 'blue'
      case 'past_due':
        return 'red'
      case 'canceled':
        return 'gray'
      default:
        return 'yellow'
    }
  }

  const getStatusText = () => {
    if (status === 'trialing' && trialEnd) {
      return `Trial ends ${formatDate(trialEnd)}`
    }
    if (cancelAtPeriodEnd) {
      return `Cancels ${formatDate(currentPeriodEnd)}`
    }
    if (status === 'past_due') {
      return 'Payment failed'
    }
    if (status === 'canceled') {
      return 'Subscription canceled'
    }
    return `Renews ${formatDate(currentPeriodEnd)}`
  }

  const getUsagePercentage = (current: number, limit: number) => {
    if (limit === -1) return 0
    return Math.round((current / limit) * 100)
  }

  return (
    <div data-testid="subscription-status" className="subscription-status">
      <div className="status-header">
        <div>
          <h2 data-testid="plan-name">{planTier.charAt(0).toUpperCase() + planTier.slice(1)} Plan</h2>
          <p data-testid="status-badge" className={`status-${getStatusColor()}`}>
            {status}
          </p>
        </div>
        {onManageSubscription && (
          <button onClick={onManageSubscription} data-testid="manage-subscription-button">
            Manage Subscription
          </button>
        )}
      </div>

      <div className="status-info">
        <p data-testid="status-text">{getStatusText()}</p>
        {cancelAtPeriodEnd && (
          <p data-testid="cancellation-notice" className="warning">
            Your subscription will be canceled at the end of the billing period
          </p>
        )}
      </div>

      {usage && limits && (
        <div className="usage-section" data-testid="usage-section">
          <h3>Usage</h3>
          <div className="usage-item" data-testid="usage-projects">
            <span>Projects</span>
            <span data-testid="projects-usage">
              {usage.projects} / {limits.projects === -1 ? '∞' : limits.projects}
            </span>
            {limits.projects !== -1 && (
              <div className="usage-bar">
                <div
                  className="usage-fill"
                  style={{ width: `${getUsagePercentage(usage.projects, limits.projects)}%` }}
                />
              </div>
            )}
          </div>
          <div className="usage-item" data-testid="usage-events">
            <span>Events</span>
            <span data-testid="events-usage">
              {usage.events.toLocaleString()} / {limits.events === -1 ? '∞' : limits.events.toLocaleString()}
            </span>
            {limits.events !== -1 && (
              <div className="usage-bar">
                <div
                  className="usage-fill"
                  style={{ width: `${getUsagePercentage(usage.events, limits.events)}%` }}
                />
              </div>
            )}
          </div>
          <div className="usage-item" data-testid="usage-team-members">
            <span>Team Members</span>
            <span data-testid="team-members-usage">
              {usage.teamMembers} / {limits.teamMembers === -1 ? '∞' : limits.teamMembers}
            </span>
            {limits.teamMembers !== -1 && (
              <div className="usage-bar">
                <div
                  className="usage-fill"
                  style={{ width: `${getUsagePercentage(usage.teamMembers, limits.teamMembers)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {onUpgrade && planTier !== 'enterprise' && (
        <button onClick={onUpgrade} data-testid="upgrade-button" className="upgrade-button">
          Upgrade Plan
        </button>
      )}
    </div>
  )
}

describe('SubscriptionStatus Component', () => {
  const defaultProps: SubscriptionStatusProps = {
    status: 'active',
    planTier: 'professional',
    currentPeriodEnd: new Date('2024-12-31'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders plan name correctly', () => {
      render(<SubscriptionStatus {...defaultProps} />)

      expect(screen.getByTestId('plan-name')).toHaveTextContent('Professional Plan')
    })

    it('displays subscription status', () => {
      render(<SubscriptionStatus {...defaultProps} />)

      expect(screen.getByTestId('status-badge')).toHaveTextContent('active')
    })

    it('shows renewal date for active subscription', () => {
      render(<SubscriptionStatus {...defaultProps} />)

      const statusText = screen.getByTestId('status-text')
      expect(statusText.textContent).toContain('Renews')
      expect(statusText.textContent).toContain('Dec 31, 2024')
    })

    it('renders manage subscription button', () => {
      const onManage = vi.fn()
      render(<SubscriptionStatus {...defaultProps} onManageSubscription={onManage} />)

      expect(screen.getByTestId('manage-subscription-button')).toBeInTheDocument()
    })

    it('does not render manage button when callback not provided', () => {
      render(<SubscriptionStatus {...defaultProps} />)

      expect(screen.queryByTestId('manage-subscription-button')).not.toBeInTheDocument()
    })
  })

  describe('Status Display', () => {
    it('shows trial status and end date', () => {
      const trialEnd = new Date('2024-01-15')
      render(
        <SubscriptionStatus
          {...defaultProps}
          status="trialing"
          trialEnd={trialEnd}
        />
      )

      expect(screen.getByTestId('status-badge')).toHaveTextContent('trialing')
      const statusText = screen.getByTestId('status-text')
      expect(statusText.textContent).toContain('Trial ends')
      expect(statusText.textContent).toContain('Jan 15, 2024')
    })

    it('shows cancellation status', () => {
      render(
        <SubscriptionStatus
          {...defaultProps}
          status="active"
          cancelAtPeriodEnd={true}
        />
      )

      expect(screen.getByTestId('status-text').textContent).toContain('Cancels')
      expect(screen.getByTestId('cancellation-notice')).toBeInTheDocument()
    })

    it('shows past due status', () => {
      render(<SubscriptionStatus {...defaultProps} status="past_due" />)

      expect(screen.getByTestId('status-text')).toHaveTextContent('Payment failed')
    })

    it('shows canceled status', () => {
      render(<SubscriptionStatus {...defaultProps} status="canceled" />)

      expect(screen.getByTestId('status-text')).toHaveTextContent('Subscription canceled')
    })
  })

  describe('Usage Display', () => {
    const usageProps = {
      ...defaultProps,
      usage: {
        projects: 5,
        events: 50000,
        teamMembers: 3,
      },
      limits: {
        projects: 20,
        events: 1000000,
        teamMembers: 10,
      },
    }

    it('renders usage section when usage data provided', () => {
      render(<SubscriptionStatus {...usageProps} />)

      expect(screen.getByTestId('usage-section')).toBeInTheDocument()
    })

    it('displays projects usage', () => {
      render(<SubscriptionStatus {...usageProps} />)

      expect(screen.getByTestId('projects-usage')).toHaveTextContent('5 / 20')
    })

    it('displays events usage with number formatting', () => {
      render(<SubscriptionStatus {...usageProps} />)

      expect(screen.getByTestId('events-usage')).toHaveTextContent('50,000 / 1,000,000')
    })

    it('displays team members usage', () => {
      render(<SubscriptionStatus {...usageProps} />)

      expect(screen.getByTestId('team-members-usage')).toHaveTextContent('3 / 10')
    })

    it('shows unlimited symbol for enterprise limits', () => {
      const enterpriseProps = {
        ...defaultProps,
        planTier: 'enterprise' as PlanTier,
        usage: {
          projects: 100,
          events: 5000000,
          teamMembers: 50,
        },
        limits: {
          projects: -1,
          events: -1,
          teamMembers: -1,
        },
      }

      render(<SubscriptionStatus {...enterpriseProps} />)

      expect(screen.getByTestId('projects-usage')).toHaveTextContent('100 / ∞')
      expect(screen.getByTestId('events-usage')).toHaveTextContent('5,000,000 / ∞')
      expect(screen.getByTestId('team-members-usage')).toHaveTextContent('50 / ∞')
    })

    it('does not render usage section when usage not provided', () => {
      render(<SubscriptionStatus {...defaultProps} />)

      expect(screen.queryByTestId('usage-section')).not.toBeInTheDocument()
    })
  })

  describe('Upgrade Button', () => {
    it('shows upgrade button for non-enterprise plans', () => {
      const onUpgrade = vi.fn()
      render(<SubscriptionStatus {...defaultProps} planTier="starter" onUpgrade={onUpgrade} />)

      expect(screen.getByTestId('upgrade-button')).toBeInTheDocument()
    })

    it('does not show upgrade button for enterprise plan', () => {
      const onUpgrade = vi.fn()
      render(<SubscriptionStatus {...defaultProps} planTier="enterprise" onUpgrade={onUpgrade} />)

      expect(screen.queryByTestId('upgrade-button')).not.toBeInTheDocument()
    })

    it('calls onUpgrade when upgrade button clicked', () => {
      const onUpgrade = vi.fn()
      render(<SubscriptionStatus {...defaultProps} onUpgrade={onUpgrade} />)

      fireEvent.click(screen.getByTestId('upgrade-button'))

      expect(onUpgrade).toHaveBeenCalledTimes(1)
    })
  })

  describe('Interactions', () => {
    it('calls onManageSubscription when manage button clicked', () => {
      const onManage = vi.fn()
      render(<SubscriptionStatus {...defaultProps} onManageSubscription={onManage} />)

      fireEvent.click(screen.getByTestId('manage-subscription-button'))

      expect(onManage).toHaveBeenCalledTimes(1)
    })
  })

  describe('Different Plan Tiers', () => {
    it('renders free plan', () => {
      render(<SubscriptionStatus {...defaultProps} planTier="free" />)

      expect(screen.getByTestId('plan-name')).toHaveTextContent('Free Plan')
    })

    it('renders starter plan', () => {
      render(<SubscriptionStatus {...defaultProps} planTier="starter" />)

      expect(screen.getByTestId('plan-name')).toHaveTextContent('Starter Plan')
    })

    it('renders enterprise plan', () => {
      render(<SubscriptionStatus {...defaultProps} planTier="enterprise" />)

      expect(screen.getByTestId('plan-name')).toHaveTextContent('Enterprise Plan')
    })
  })
})
