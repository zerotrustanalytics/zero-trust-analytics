import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Plan Limits Checker
 *
 * Manages feature limits and usage enforcement for different subscription tiers.
 * Ensures users cannot exceed their plan's allocated resources.
 */

type PlanTier = 'free' | 'starter' | 'professional' | 'enterprise'

interface PlanLimits {
  tier: PlanTier
  maxProjects: number
  maxEventsPerMonth: number
  maxTeamMembers: number
  maxDataRetentionDays: number
  customDomain: boolean
  apiAccess: boolean
  advancedAnalytics: boolean
  prioritySupport: boolean
  whiteLabel: boolean
}

interface UsageData {
  projectCount: number
  eventsThisMonth: number
  teamMemberCount: number
}

class PlanLimitsChecker {
  private plans: Record<PlanTier, PlanLimits> = {
    free: {
      tier: 'free',
      maxProjects: 1,
      maxEventsPerMonth: 10000,
      maxTeamMembers: 1,
      maxDataRetentionDays: 30,
      customDomain: false,
      apiAccess: false,
      advancedAnalytics: false,
      prioritySupport: false,
      whiteLabel: false,
    },
    starter: {
      tier: 'starter',
      maxProjects: 5,
      maxEventsPerMonth: 100000,
      maxTeamMembers: 3,
      maxDataRetentionDays: 90,
      customDomain: false,
      apiAccess: true,
      advancedAnalytics: false,
      prioritySupport: false,
      whiteLabel: false,
    },
    professional: {
      tier: 'professional',
      maxProjects: 20,
      maxEventsPerMonth: 1000000,
      maxTeamMembers: 10,
      maxDataRetentionDays: 365,
      customDomain: true,
      apiAccess: true,
      advancedAnalytics: true,
      prioritySupport: true,
      whiteLabel: false,
    },
    enterprise: {
      tier: 'enterprise',
      maxProjects: -1, // unlimited
      maxEventsPerMonth: -1, // unlimited
      maxTeamMembers: -1, // unlimited
      maxDataRetentionDays: -1, // unlimited
      customDomain: true,
      apiAccess: true,
      advancedAnalytics: true,
      prioritySupport: true,
      whiteLabel: true,
    },
  }

  getPlanLimits(tier: PlanTier): PlanLimits {
    return this.plans[tier]
  }

  canCreateProject(tier: PlanTier, currentProjectCount: number): boolean {
    const limits = this.getPlanLimits(tier)
    if (limits.maxProjects === -1) return true
    return currentProjectCount < limits.maxProjects
  }

  canAddTeamMember(tier: PlanTier, currentTeamMemberCount: number): boolean {
    const limits = this.getPlanLimits(tier)
    if (limits.maxTeamMembers === -1) return true
    return currentTeamMemberCount < limits.maxTeamMembers
  }

  canTrackEvents(tier: PlanTier, currentEventsThisMonth: number, additionalEvents: number = 1): boolean {
    const limits = this.getPlanLimits(tier)
    if (limits.maxEventsPerMonth === -1) return true
    return currentEventsThisMonth + additionalEvents <= limits.maxEventsPerMonth
  }

  hasFeature(tier: PlanTier, feature: keyof Omit<PlanLimits, 'tier' | 'maxProjects' | 'maxEventsPerMonth' | 'maxTeamMembers' | 'maxDataRetentionDays'>): boolean {
    const limits = this.getPlanLimits(tier)
    return limits[feature]
  }

  getRemainingProjects(tier: PlanTier, currentProjectCount: number): number {
    const limits = this.getPlanLimits(tier)
    if (limits.maxProjects === -1) return Infinity
    return Math.max(0, limits.maxProjects - currentProjectCount)
  }

  getRemainingEvents(tier: PlanTier, currentEventsThisMonth: number): number {
    const limits = this.getPlanLimits(tier)
    if (limits.maxEventsPerMonth === -1) return Infinity
    return Math.max(0, limits.maxEventsPerMonth - currentEventsThisMonth)
  }

  getRemainingTeamMembers(tier: PlanTier, currentTeamMemberCount: number): number {
    const limits = this.getPlanLimits(tier)
    if (limits.maxTeamMembers === -1) return Infinity
    return Math.max(0, limits.maxTeamMembers - currentTeamMemberCount)
  }

  getUsagePercentage(tier: PlanTier, usage: UsageData): {
    projects: number
    events: number
    teamMembers: number
  } {
    const limits = this.getPlanLimits(tier)

    return {
      projects: limits.maxProjects === -1 ? 0 : (usage.projectCount / limits.maxProjects) * 100,
      events: limits.maxEventsPerMonth === -1 ? 0 : (usage.eventsThisMonth / limits.maxEventsPerMonth) * 100,
      teamMembers: limits.maxTeamMembers === -1 ? 0 : (usage.teamMemberCount / limits.maxTeamMembers) * 100,
    }
  }

  isApproachingLimit(tier: PlanTier, usage: UsageData, threshold: number = 80): boolean {
    const percentages = this.getUsagePercentage(tier, usage)
    return Object.values(percentages).some(percentage => percentage >= threshold)
  }

  getRequiredPlanForUsage(usage: UsageData): PlanTier {
    const tiers: PlanTier[] = ['free', 'starter', 'professional', 'enterprise']

    for (const tier of tiers) {
      const limits = this.getPlanLimits(tier)
      const canSupport =
        (limits.maxProjects === -1 || usage.projectCount <= limits.maxProjects) &&
        (limits.maxEventsPerMonth === -1 || usage.eventsThisMonth <= limits.maxEventsPerMonth) &&
        (limits.maxTeamMembers === -1 || usage.teamMemberCount <= limits.maxTeamMembers)

      if (canSupport) {
        return tier
      }
    }

    return 'enterprise'
  }

  validateUsageAgainstPlan(tier: PlanTier, usage: UsageData): {
    valid: boolean
    violations: string[]
  } {
    const limits = this.getPlanLimits(tier)
    const violations: string[] = []

    if (limits.maxProjects !== -1 && usage.projectCount > limits.maxProjects) {
      violations.push(`Project count (${usage.projectCount}) exceeds limit (${limits.maxProjects})`)
    }

    if (limits.maxEventsPerMonth !== -1 && usage.eventsThisMonth > limits.maxEventsPerMonth) {
      violations.push(`Event count (${usage.eventsThisMonth}) exceeds monthly limit (${limits.maxEventsPerMonth})`)
    }

    if (limits.maxTeamMembers !== -1 && usage.teamMemberCount > limits.maxTeamMembers) {
      violations.push(`Team member count (${usage.teamMemberCount}) exceeds limit (${limits.maxTeamMembers})`)
    }

    return {
      valid: violations.length === 0,
      violations,
    }
  }
}

describe('PlanLimitsChecker', () => {
  let checker: PlanLimitsChecker

  beforeEach(() => {
    checker = new PlanLimitsChecker()
  })

  describe('getPlanLimits', () => {
    it('returns correct limits for free plan', () => {
      const limits = checker.getPlanLimits('free')
      expect(limits.maxProjects).toBe(1)
      expect(limits.maxEventsPerMonth).toBe(10000)
      expect(limits.maxTeamMembers).toBe(1)
      expect(limits.customDomain).toBe(false)
    })

    it('returns correct limits for starter plan', () => {
      const limits = checker.getPlanLimits('starter')
      expect(limits.maxProjects).toBe(5)
      expect(limits.maxEventsPerMonth).toBe(100000)
      expect(limits.maxTeamMembers).toBe(3)
      expect(limits.apiAccess).toBe(true)
    })

    it('returns correct limits for professional plan', () => {
      const limits = checker.getPlanLimits('professional')
      expect(limits.maxProjects).toBe(20)
      expect(limits.maxEventsPerMonth).toBe(1000000)
      expect(limits.maxTeamMembers).toBe(10)
      expect(limits.advancedAnalytics).toBe(true)
    })

    it('returns unlimited limits for enterprise plan', () => {
      const limits = checker.getPlanLimits('enterprise')
      expect(limits.maxProjects).toBe(-1)
      expect(limits.maxEventsPerMonth).toBe(-1)
      expect(limits.maxTeamMembers).toBe(-1)
      expect(limits.whiteLabel).toBe(true)
    })
  })

  describe('canCreateProject', () => {
    it('allows project creation when under limit', () => {
      expect(checker.canCreateProject('free', 0)).toBe(true)
      expect(checker.canCreateProject('starter', 4)).toBe(true)
      expect(checker.canCreateProject('professional', 19)).toBe(true)
    })

    it('blocks project creation when at limit', () => {
      expect(checker.canCreateProject('free', 1)).toBe(false)
      expect(checker.canCreateProject('starter', 5)).toBe(false)
      expect(checker.canCreateProject('professional', 20)).toBe(false)
    })

    it('always allows project creation for enterprise', () => {
      expect(checker.canCreateProject('enterprise', 100)).toBe(true)
      expect(checker.canCreateProject('enterprise', 1000000)).toBe(true)
    })
  })

  describe('canAddTeamMember', () => {
    it('allows adding team member when under limit', () => {
      expect(checker.canAddTeamMember('free', 0)).toBe(true)
      expect(checker.canAddTeamMember('starter', 2)).toBe(true)
      expect(checker.canAddTeamMember('professional', 9)).toBe(true)
    })

    it('blocks adding team member when at limit', () => {
      expect(checker.canAddTeamMember('free', 1)).toBe(false)
      expect(checker.canAddTeamMember('starter', 3)).toBe(false)
      expect(checker.canAddTeamMember('professional', 10)).toBe(false)
    })

    it('always allows adding team members for enterprise', () => {
      expect(checker.canAddTeamMember('enterprise', 50)).toBe(true)
      expect(checker.canAddTeamMember('enterprise', 1000)).toBe(true)
    })
  })

  describe('canTrackEvents', () => {
    it('allows tracking events when under limit', () => {
      expect(checker.canTrackEvents('free', 9999)).toBe(true)
      expect(checker.canTrackEvents('starter', 99999)).toBe(true)
      expect(checker.canTrackEvents('professional', 999999)).toBe(true)
    })

    it('blocks tracking events when at limit', () => {
      expect(checker.canTrackEvents('free', 10000)).toBe(false)
      expect(checker.canTrackEvents('starter', 100000)).toBe(false)
      expect(checker.canTrackEvents('professional', 1000000)).toBe(false)
    })

    it('allows tracking multiple events at once', () => {
      expect(checker.canTrackEvents('free', 9990, 10)).toBe(true)
      expect(checker.canTrackEvents('free', 9990, 11)).toBe(false)
    })

    it('always allows tracking events for enterprise', () => {
      expect(checker.canTrackEvents('enterprise', 10000000)).toBe(true)
    })
  })

  describe('hasFeature', () => {
    it('checks custom domain feature', () => {
      expect(checker.hasFeature('free', 'customDomain')).toBe(false)
      expect(checker.hasFeature('starter', 'customDomain')).toBe(false)
      expect(checker.hasFeature('professional', 'customDomain')).toBe(true)
      expect(checker.hasFeature('enterprise', 'customDomain')).toBe(true)
    })

    it('checks API access feature', () => {
      expect(checker.hasFeature('free', 'apiAccess')).toBe(false)
      expect(checker.hasFeature('starter', 'apiAccess')).toBe(true)
      expect(checker.hasFeature('professional', 'apiAccess')).toBe(true)
      expect(checker.hasFeature('enterprise', 'apiAccess')).toBe(true)
    })

    it('checks advanced analytics feature', () => {
      expect(checker.hasFeature('free', 'advancedAnalytics')).toBe(false)
      expect(checker.hasFeature('starter', 'advancedAnalytics')).toBe(false)
      expect(checker.hasFeature('professional', 'advancedAnalytics')).toBe(true)
      expect(checker.hasFeature('enterprise', 'advancedAnalytics')).toBe(true)
    })

    it('checks white label feature', () => {
      expect(checker.hasFeature('free', 'whiteLabel')).toBe(false)
      expect(checker.hasFeature('starter', 'whiteLabel')).toBe(false)
      expect(checker.hasFeature('professional', 'whiteLabel')).toBe(false)
      expect(checker.hasFeature('enterprise', 'whiteLabel')).toBe(true)
    })
  })

  describe('getRemainingProjects', () => {
    it('calculates remaining projects correctly', () => {
      expect(checker.getRemainingProjects('free', 0)).toBe(1)
      expect(checker.getRemainingProjects('free', 1)).toBe(0)
      expect(checker.getRemainingProjects('starter', 3)).toBe(2)
      expect(checker.getRemainingProjects('professional', 15)).toBe(5)
    })

    it('returns Infinity for enterprise', () => {
      expect(checker.getRemainingProjects('enterprise', 100)).toBe(Infinity)
    })

    it('returns 0 when over limit', () => {
      expect(checker.getRemainingProjects('free', 5)).toBe(0)
    })
  })

  describe('getRemainingEvents', () => {
    it('calculates remaining events correctly', () => {
      expect(checker.getRemainingEvents('free', 5000)).toBe(5000)
      expect(checker.getRemainingEvents('starter', 50000)).toBe(50000)
      expect(checker.getRemainingEvents('professional', 500000)).toBe(500000)
    })

    it('returns Infinity for enterprise', () => {
      expect(checker.getRemainingEvents('enterprise', 1000000)).toBe(Infinity)
    })

    it('returns 0 when at or over limit', () => {
      expect(checker.getRemainingEvents('free', 10000)).toBe(0)
      expect(checker.getRemainingEvents('free', 15000)).toBe(0)
    })
  })

  describe('getRemainingTeamMembers', () => {
    it('calculates remaining team members correctly', () => {
      expect(checker.getRemainingTeamMembers('free', 0)).toBe(1)
      expect(checker.getRemainingTeamMembers('starter', 1)).toBe(2)
      expect(checker.getRemainingTeamMembers('professional', 5)).toBe(5)
    })

    it('returns Infinity for enterprise', () => {
      expect(checker.getRemainingTeamMembers('enterprise', 50)).toBe(Infinity)
    })
  })

  describe('getUsagePercentage', () => {
    it('calculates usage percentages correctly', () => {
      const usage = {
        projectCount: 1,
        eventsThisMonth: 5000,
        teamMemberCount: 1,
      }
      const percentages = checker.getUsagePercentage('free', usage)
      expect(percentages.projects).toBe(100)
      expect(percentages.events).toBe(50)
      expect(percentages.teamMembers).toBe(100)
    })

    it('returns 0 for enterprise unlimited resources', () => {
      const usage = {
        projectCount: 100,
        eventsThisMonth: 1000000,
        teamMemberCount: 50,
      }
      const percentages = checker.getUsagePercentage('enterprise', usage)
      expect(percentages.projects).toBe(0)
      expect(percentages.events).toBe(0)
      expect(percentages.teamMembers).toBe(0)
    })

    it('handles zero usage', () => {
      const usage = {
        projectCount: 0,
        eventsThisMonth: 0,
        teamMemberCount: 0,
      }
      const percentages = checker.getUsagePercentage('starter', usage)
      expect(percentages.projects).toBe(0)
      expect(percentages.events).toBe(0)
      expect(percentages.teamMembers).toBe(0)
    })
  })

  describe('isApproachingLimit', () => {
    it('detects when approaching default 80% threshold', () => {
      const usage = {
        projectCount: 4,
        eventsThisMonth: 85000,
        teamMemberCount: 2,
      }
      expect(checker.isApproachingLimit('starter', usage)).toBe(true)
    })

    it('returns false when well under limit', () => {
      const usage = {
        projectCount: 1,
        eventsThisMonth: 10000,
        teamMemberCount: 1,
      }
      expect(checker.isApproachingLimit('starter', usage)).toBe(false)
    })

    it('accepts custom threshold', () => {
      const usage = {
        projectCount: 3,
        eventsThisMonth: 60000,
        teamMemberCount: 2,
      }
      expect(checker.isApproachingLimit('starter', usage, 50)).toBe(true)
      expect(checker.isApproachingLimit('starter', usage, 90)).toBe(false)
    })
  })

  describe('getRequiredPlanForUsage', () => {
    it('returns free for minimal usage', () => {
      const usage = {
        projectCount: 1,
        eventsThisMonth: 5000,
        teamMemberCount: 1,
      }
      expect(checker.getRequiredPlanForUsage(usage)).toBe('free')
    })

    it('returns starter for moderate usage', () => {
      const usage = {
        projectCount: 3,
        eventsThisMonth: 50000,
        teamMemberCount: 2,
      }
      expect(checker.getRequiredPlanForUsage(usage)).toBe('starter')
    })

    it('returns professional for high usage', () => {
      const usage = {
        projectCount: 10,
        eventsThisMonth: 500000,
        teamMemberCount: 5,
      }
      expect(checker.getRequiredPlanForUsage(usage)).toBe('professional')
    })

    it('returns enterprise for very high usage', () => {
      const usage = {
        projectCount: 50,
        eventsThisMonth: 5000000,
        teamMemberCount: 20,
      }
      expect(checker.getRequiredPlanForUsage(usage)).toBe('enterprise')
    })
  })

  describe('validateUsageAgainstPlan', () => {
    it('validates usage within limits', () => {
      const usage = {
        projectCount: 3,
        eventsThisMonth: 50000,
        teamMemberCount: 2,
      }
      const result = checker.validateUsageAgainstPlan('starter', usage)
      expect(result.valid).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('detects project count violation', () => {
      const usage = {
        projectCount: 6,
        eventsThisMonth: 50000,
        teamMemberCount: 2,
      }
      const result = checker.validateUsageAgainstPlan('starter', usage)
      expect(result.valid).toBe(false)
      expect(result.violations).toContain('Project count (6) exceeds limit (5)')
    })

    it('detects event count violation', () => {
      const usage = {
        projectCount: 3,
        eventsThisMonth: 150000,
        teamMemberCount: 2,
      }
      const result = checker.validateUsageAgainstPlan('starter', usage)
      expect(result.valid).toBe(false)
      expect(result.violations).toContain('Event count (150000) exceeds monthly limit (100000)')
    })

    it('detects team member violation', () => {
      const usage = {
        projectCount: 3,
        eventsThisMonth: 50000,
        teamMemberCount: 5,
      }
      const result = checker.validateUsageAgainstPlan('starter', usage)
      expect(result.valid).toBe(false)
      expect(result.violations).toContain('Team member count (5) exceeds limit (3)')
    })

    it('detects multiple violations', () => {
      const usage = {
        projectCount: 10,
        eventsThisMonth: 150000,
        teamMemberCount: 5,
      }
      const result = checker.validateUsageAgainstPlan('starter', usage)
      expect(result.valid).toBe(false)
      expect(result.violations).toHaveLength(3)
    })

    it('validates enterprise plan with any usage', () => {
      const usage = {
        projectCount: 1000,
        eventsThisMonth: 10000000,
        teamMemberCount: 100,
      }
      const result = checker.validateUsageAgainstPlan('enterprise', usage)
      expect(result.valid).toBe(true)
      expect(result.violations).toHaveLength(0)
    })
  })
})
