/**
 * Storage Library Tests
 *
 * Comprehensive tests for netlify/functions/lib/storage.js
 * Testing Netlify Blobs-based storage operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ==========================================
// MOCK NETLIFY BLOBS STORE
// ==========================================

const createMockStore = () => ({
  get: vi.fn(),
  setJSON: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  list: vi.fn().mockResolvedValue({ blobs: [] }),
})

type MockStore = ReturnType<typeof createMockStore>
type StoreMap = Record<string, MockStore>

// ==========================================
// STORAGE CLASS IMPLEMENTATION (mirrors storage.js)
// ==========================================

const STORES = {
  USERS: 'users',
  SITES: 'sites',
  PAGEVIEWS: 'pageviews',
  PASSWORD_RESET_TOKENS: 'password_reset_tokens',
  PUBLIC_SHARES: 'public_shares',
  SESSIONS: 'sessions',
  API_KEYS: 'api_keys',
  ACTIVITY_LOG: 'activity_log',
  WEBHOOKS: 'webhooks',
  ALERTS: 'alerts',
  ANNOTATIONS: 'annotations',
  TEAMS: 'teams',
  GOALS: 'goals',
  FUNNELS: 'funnels',
  OAUTH_STATES: 'oauth_states',
}

const TeamRoles = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
}

class StorageService {
  private stores: StoreMap

  constructor(stores: StoreMap) {
    this.stores = stores
  }

  private store(name: string): MockStore {
    if (!this.stores[name]) {
      this.stores[name] = createMockStore()
    }
    return this.stores[name]
  }

  // === USER OPERATIONS ===

  async createUser(email: string, passwordHash: string, plan = 'pro') {
    const users = this.store(STORES.USERS)
    const userId = 'user_' + Date.now()
    const now = new Date()
    const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    const user = {
      id: userId,
      email,
      passwordHash,
      createdAt: now.toISOString(),
      plan,
      trialEndsAt: trialEndsAt.toISOString(),
      subscription: null,
    }
    await users.setJSON(email, user)
    return user
  }

  async getUser(email: string) {
    const users = this.store(STORES.USERS)
    return await users.get(email, { type: 'json' })
  }

  async getUserById(userId: string) {
    const users = this.store(STORES.USERS)
    const userIdMapKey = `user_id_map_${userId}`
    try {
      const email = await users.get(userIdMapKey, { type: 'text' })
      if (email) {
        return await this.getUser(email)
      }
    } catch {
      // Mapping doesn't exist
    }

    // Fallback: search through users
    try {
      const { blobs } = await users.list()
      for (const blob of blobs) {
        if (blob.key.startsWith('user_id_map_') || blob.key.startsWith('user_sites_')) {
          continue
        }
        const user = await users.get(blob.key, { type: 'json' })
        if (user?.id === userId) {
          await users.set(userIdMapKey, blob.key)
          return { ...user, email: blob.key }
        }
      }
      return null
    } catch {
      return null
    }
  }

  async updateUser(email: string, updates: Record<string, unknown>) {
    const users = this.store(STORES.USERS)
    const user = await this.getUser(email)
    if (!user) return null
    const updated = { ...user, ...updates }
    await users.setJSON(email, updated)
    return updated
  }

  async deleteUser(email: string) {
    const users = this.store(STORES.USERS)
    const user = await this.getUser(email)
    if (!user) return false
    await users.delete(email)
    return true
  }

  async createOAuthUser(email: string, provider: string, providerId: string, name: string | null = null, plan = 'pro') {
    const users = this.store(STORES.USERS)
    const userId = 'user_' + Date.now()
    const now = new Date()
    const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    const user = {
      id: userId,
      email,
      passwordHash: null,
      oauthProvider: provider,
      oauthProviderId: providerId,
      name,
      createdAt: now.toISOString(),
      plan,
      trialEndsAt: trialEndsAt.toISOString(),
      subscription: null,
    }
    await users.setJSON(email, user)
    return user
  }

  async getUserByCustomerId(customerId: string) {
    const users = this.store(STORES.USERS)
    try {
      const { blobs } = await users.list()
      for (const blob of blobs) {
        const user = await users.get(blob.key, { type: 'json' })
        if (user?.subscription?.customerId === customerId) {
          return { email: blob.key, ...user }
        }
      }
      return null
    } catch {
      return null
    }
  }

  getUserStatus(user: { subscription?: { status: string }; plan?: string; trialEndsAt?: string } | null) {
    if (!user) {
      return { status: 'none', canAccess: false }
    }

    if (user.subscription && user.subscription.status === 'active') {
      return {
        status: 'active',
        plan: user.plan || 'pro',
        canAccess: true,
        subscription: user.subscription,
      }
    }

    const now = new Date()
    const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null

    if (trialEndsAt && now < trialEndsAt) {
      const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return {
        status: 'trial',
        plan: user.plan || 'pro',
        canAccess: true,
        trialEndsAt: user.trialEndsAt,
        daysLeft,
      }
    }

    return {
      status: 'expired',
      plan: user.plan || 'pro',
      canAccess: false,
      trialEndsAt: user.trialEndsAt,
    }
  }

  // === PASSWORD RESET TOKEN OPERATIONS ===

  async createPasswordResetToken(email: string, token: string) {
    const tokens = this.store(STORES.PASSWORD_RESET_TOKENS)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000)

    const tokenData = {
      email,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    await tokens.setJSON(token, tokenData)
    return tokenData
  }

  async getPasswordResetToken(token: string) {
    const tokens = this.store(STORES.PASSWORD_RESET_TOKENS)
    try {
      const tokenData = await tokens.get(token, { type: 'json' })
      if (!tokenData) return null

      if (new Date(tokenData.expiresAt) < new Date()) {
        await this.deletePasswordResetToken(token)
        return null
      }

      return tokenData
    } catch {
      return null
    }
  }

  async deletePasswordResetToken(token: string) {
    const tokens = this.store(STORES.PASSWORD_RESET_TOKENS)
    await tokens.delete(token)
    return true
  }

  // === SITE OPERATIONS ===

  async createSite(userId: string, siteId: string, domain: string) {
    const sites = this.store(STORES.SITES)
    const site = {
      id: siteId,
      userId,
      domain,
      createdAt: new Date().toISOString(),
    }

    await sites.setJSON(siteId, site)

    const userSitesKey = `user_sites_${userId}`
    let userSites: string[] = []
    try {
      userSites = (await sites.get(userSitesKey, { type: 'json' })) || []
    } catch {
      userSites = []
    }

    userSites.push(siteId)
    await sites.setJSON(userSitesKey, userSites)

    return site
  }

  async getSite(siteId: string) {
    const sites = this.store(STORES.SITES)
    return await sites.get(siteId, { type: 'json' })
  }

  async updateSite(siteId: string, updates: Record<string, unknown>) {
    const sites = this.store(STORES.SITES)
    const site = await this.getSite(siteId)
    if (!site) return null
    const updated = { ...site, ...updates }
    await sites.setJSON(siteId, updated)
    return updated
  }

  async deleteSite(siteId: string, userId: string) {
    const sites = this.store(STORES.SITES)
    await sites.delete(siteId)

    const userSitesKey = `user_sites_${userId}`
    let userSites: string[] = []
    try {
      userSites = (await sites.get(userSitesKey, { type: 'json' })) || []
    } catch {
      userSites = []
    }
    userSites = userSites.filter((id: string) => id !== siteId)
    await sites.setJSON(userSitesKey, userSites)

    return true
  }

  async getUserSites(userId: string) {
    const sites = this.store(STORES.SITES)
    const userSitesKey = `user_sites_${userId}`
    try {
      const list = await sites.get(userSitesKey, { type: 'json' })
      return list || []
    } catch {
      return []
    }
  }

  // === SESSION OPERATIONS ===

  async createSession(userId: string, sessionInfo: Record<string, unknown> = {}) {
    const sessions = this.store(STORES.SESSIONS)
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const session = {
      id: sessionId,
      userId,
      createdAt: now.toISOString(),
      lastActivity: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ...sessionInfo,
    }

    await sessions.setJSON(sessionId, session)

    const userSessionsKey = `user_sessions_${userId}`
    let userSessions: string[] = []
    try {
      userSessions = (await sessions.get(userSessionsKey, { type: 'json' })) || []
    } catch {
      userSessions = []
    }
    userSessions.push(sessionId)
    await sessions.setJSON(userSessionsKey, userSessions)

    return session
  }

  async getSession(sessionId: string) {
    const sessions = this.store(STORES.SESSIONS)
    return await sessions.get(sessionId, { type: 'json' })
  }

  async revokeSession(sessionId: string, userId: string) {
    const sessions = this.store(STORES.SESSIONS)
    await sessions.delete(sessionId)

    const userSessionsKey = `user_sessions_${userId}`
    let userSessions: string[] = []
    try {
      userSessions = (await sessions.get(userSessionsKey, { type: 'json' })) || []
    } catch {
      userSessions = []
    }
    userSessions = userSessions.filter((id: string) => id !== sessionId)
    await sessions.setJSON(userSessionsKey, userSessions)

    return true
  }

  // === API KEY OPERATIONS ===

  async createApiKey(userId: string, name: string, permissions: string[] = ['read']) {
    const apiKeys = this.store(STORES.API_KEYS)
    const keyId = 'key_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    const secretKey = 'zta_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    const now = new Date()

    const apiKey = {
      id: keyId,
      userId,
      name,
      secretKey,
      permissions,
      createdAt: now.toISOString(),
      lastUsed: null,
      usageCount: 0,
    }

    await apiKeys.setJSON(keyId, apiKey)

    const userKeysKey = `user_keys_${userId}`
    let userKeys: string[] = []
    try {
      userKeys = (await apiKeys.get(userKeysKey, { type: 'json' })) || []
    } catch {
      userKeys = []
    }
    userKeys.push(keyId)
    await apiKeys.setJSON(userKeysKey, userKeys)

    return apiKey
  }

  async getApiKey(keyId: string) {
    const apiKeys = this.store(STORES.API_KEYS)
    return await apiKeys.get(keyId, { type: 'json' })
  }

  async validateApiKey(secretKey: string) {
    const apiKeys = this.store(STORES.API_KEYS)
    try {
      const { blobs } = await apiKeys.list()
      for (const blob of blobs) {
        if (blob.key.startsWith('user_keys_')) continue
        const key = await apiKeys.get(blob.key, { type: 'json' })
        if (key?.secretKey === secretKey) {
          key.lastUsed = new Date().toISOString()
          key.usageCount = (key.usageCount || 0) + 1
          await apiKeys.setJSON(blob.key, key)
          return key
        }
      }
      return null
    } catch {
      return null
    }
  }

  async revokeApiKey(keyId: string, userId: string) {
    const apiKeys = this.store(STORES.API_KEYS)
    await apiKeys.delete(keyId)

    const userKeysKey = `user_keys_${userId}`
    let userKeys: string[] = []
    try {
      userKeys = (await apiKeys.get(userKeysKey, { type: 'json' })) || []
    } catch {
      userKeys = []
    }
    userKeys = userKeys.filter((id: string) => id !== keyId)
    await apiKeys.setJSON(userKeysKey, userKeys)

    return true
  }

  // === ACTIVITY LOG OPERATIONS ===

  async logActivity(userId: string, type: string, details: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
    const activityLog = this.store(STORES.ACTIVITY_LOG)
    const activityId = 'activity_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    const now = new Date()

    const activity = {
      id: activityId,
      userId,
      type,
      details,
      meta,
      timestamp: now.toISOString(),
    }

    await activityLog.setJSON(activityId, activity)

    const userLogKey = `user_log_${userId}`
    let userLog: string[] = []
    try {
      userLog = (await activityLog.get(userLogKey, { type: 'json' })) || []
    } catch {
      userLog = []
    }
    userLog.unshift(activityId)
    if (userLog.length > 1000) {
      userLog = userLog.slice(0, 1000)
    }
    await activityLog.setJSON(userLogKey, userLog)

    return activity
  }

  formatActivityMessage(activity: { type: string; details?: Record<string, unknown> }) {
    const messages: Record<string, string> = {
      login: 'Logged in',
      logout: 'Logged out',
      site_created: `Created site: ${activity.details?.domain || 'Unknown'}`,
      site_deleted: `Deleted site: ${activity.details?.domain || 'Unknown'}`,
      api_key_created: `Created API key: ${activity.details?.name || 'Unknown'}`,
      api_key_revoked: `Revoked API key: ${activity.details?.name || 'Unknown'}`,
      password_changed: 'Changed password',
      two_factor_enabled: 'Enabled two-factor authentication',
      two_factor_disabled: 'Disabled two-factor authentication',
    }
    return messages[activity.type] || `Unknown activity: ${activity.type}`
  }

  // === PUBLIC SHARE OPERATIONS ===

  async createPublicShare(siteId: string, userId: string, options: Record<string, unknown> = {}) {
    const shares = this.store(STORES.PUBLIC_SHARES)
    const shareToken = 'share_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    const now = new Date()

    const share = {
      token: shareToken,
      siteId,
      userId,
      createdAt: now.toISOString(),
      expiresAt: options.expiresAt || null,
      password: options.password || null,
      allowedStats: options.allowedStats || ['pageviews', 'visitors', 'pages', 'referrers'],
    }

    await shares.setJSON(shareToken, share)
    return share
  }

  async getPublicShare(shareToken: string) {
    const shares = this.store(STORES.PUBLIC_SHARES)
    try {
      const share = await shares.get(shareToken, { type: 'json' })
      if (!share) return null

      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        await shares.delete(shareToken)
        return null
      }

      return share
    } catch {
      return null
    }
  }

  async deletePublicShare(shareToken: string, userId: string) {
    const shares = this.store(STORES.PUBLIC_SHARES)
    const share = await this.getPublicShare(shareToken)
    if (!share || share.userId !== userId) return false
    await shares.delete(shareToken)
    return true
  }

  // === TEAM OPERATIONS ===

  async createTeam(ownerId: string, ownerEmail: string, name: string) {
    const teams = this.store(STORES.TEAMS)
    const teamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    const now = new Date()

    const team = {
      id: teamId,
      name,
      ownerId,
      ownerEmail,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      members: [
        {
          userId: ownerId,
          email: ownerEmail,
          role: TeamRoles.OWNER,
          joinedAt: now.toISOString(),
        },
      ],
      sites: [],
      invites: [],
    }

    await teams.setJSON(teamId, team)

    const userTeamsKey = `user_teams_${ownerId}`
    let userTeams: string[] = []
    try {
      userTeams = (await teams.get(userTeamsKey, { type: 'json' })) || []
    } catch {
      userTeams = []
    }
    userTeams.push(teamId)
    await teams.setJSON(userTeamsKey, userTeams)

    return team
  }

  async getTeam(teamId: string) {
    const teams = this.store(STORES.TEAMS)
    return await teams.get(teamId, { type: 'json' })
  }

  async getUserTeams(userId: string) {
    const teams = this.store(STORES.TEAMS)
    const userTeamsKey = `user_teams_${userId}`
    try {
      const teamIds = (await teams.get(userTeamsKey, { type: 'json' })) || []
      const userTeams = []
      for (const teamId of teamIds) {
        const team = await this.getTeam(teamId)
        if (team) userTeams.push(team)
      }
      return userTeams
    } catch {
      return []
    }
  }

  async getTeamMemberRole(teamId: string, userId: string) {
    const team = await this.getTeam(teamId)
    if (!team) return null
    const member = team.members?.find((m: { userId: string }) => m.userId === userId)
    return member?.role || null
  }

  async getTeamMembers(teamId: string) {
    const team = await this.getTeam(teamId)
    return team?.members || []
  }

  // === GOAL OPERATIONS ===

  async createGoal(siteId: string, userId: string, config: Record<string, unknown>) {
    const goals = this.store(STORES.GOALS)
    const goalId = 'goal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    const now = new Date()

    const goal = {
      id: goalId,
      siteId,
      userId,
      name: config.name,
      metric: config.metric,
      target: config.target,
      period: config.period || 'monthly',
      currentValue: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    await goals.setJSON(goalId, goal)
    return goal
  }

  async getGoal(goalId: string) {
    const goals = this.store(STORES.GOALS)
    return await goals.get(goalId, { type: 'json' })
  }

  async updateGoal(goalId: string, userId: string, updates: Record<string, unknown>) {
    const goals = this.store(STORES.GOALS)
    const goal = await this.getGoal(goalId)
    if (!goal || goal.userId !== userId) return null
    const updated = { ...goal, ...updates, updatedAt: new Date().toISOString() }
    await goals.setJSON(goalId, updated)
    return updated
  }

  async deleteGoal(goalId: string, userId: string) {
    const goals = this.store(STORES.GOALS)
    const goal = await this.getGoal(goalId)
    if (!goal || goal.userId !== userId) return false
    await goals.delete(goalId)
    return true
  }

  // === FUNNEL OPERATIONS ===

  async createFunnel(siteId: string, userId: string, config: Record<string, unknown>) {
    const funnels = this.store(STORES.FUNNELS)
    const funnelId = 'funnel_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    const now = new Date()

    const funnel = {
      id: funnelId,
      siteId,
      userId,
      name: config.name,
      steps: config.steps || [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    await funnels.setJSON(funnelId, funnel)
    return funnel
  }

  async getFunnel(funnelId: string) {
    const funnels = this.store(STORES.FUNNELS)
    return await funnels.get(funnelId, { type: 'json' })
  }

  async updateFunnel(funnelId: string, userId: string, updates: Record<string, unknown>) {
    const funnels = this.store(STORES.FUNNELS)
    const funnel = await this.getFunnel(funnelId)
    if (!funnel || funnel.userId !== userId) return null
    const updated = { ...funnel, ...updates, updatedAt: new Date().toISOString() }
    await funnels.setJSON(funnelId, updated)
    return updated
  }

  async deleteFunnel(funnelId: string, userId: string) {
    const funnels = this.store(STORES.FUNNELS)
    const funnel = await this.getFunnel(funnelId)
    if (!funnel || funnel.userId !== userId) return false
    await funnels.delete(funnelId)
    return true
  }

  // === WEBHOOK OPERATIONS ===

  async createWebhook(siteId: string, userId: string, config: Record<string, unknown>) {
    const webhooks = this.store(STORES.WEBHOOKS)
    const webhookId = 'webhook_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    const secretKey = 'whsec_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
    const now = new Date()

    const webhook = {
      id: webhookId,
      siteId,
      userId,
      url: config.url,
      events: config.events || ['pageview'],
      secretKey,
      active: true,
      createdAt: now.toISOString(),
      deliveryCount: 0,
      failureCount: 0,
    }

    await webhooks.setJSON(webhookId, webhook)
    return webhook
  }

  async getWebhook(webhookId: string) {
    const webhooks = this.store(STORES.WEBHOOKS)
    return await webhooks.get(webhookId, { type: 'json' })
  }

  async updateWebhook(webhookId: string, userId: string, updates: Record<string, unknown>) {
    const webhooks = this.store(STORES.WEBHOOKS)
    const webhook = await this.getWebhook(webhookId)
    if (!webhook || webhook.userId !== userId) return null
    const updated = { ...webhook, ...updates }
    await webhooks.setJSON(webhookId, updated)
    return updated
  }

  async deleteWebhook(webhookId: string, userId: string) {
    const webhooks = this.store(STORES.WEBHOOKS)
    const webhook = await this.getWebhook(webhookId)
    if (!webhook || webhook.userId !== userId) return false
    await webhooks.delete(webhookId)
    return true
  }

  // === ALERT OPERATIONS ===

  async createAlert(siteId: string, userId: string, config: Record<string, unknown>) {
    const alerts = this.store(STORES.ALERTS)
    const alertId = 'alert_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    const now = new Date()

    const alert = {
      id: alertId,
      siteId,
      userId,
      name: config.name,
      type: config.type,
      threshold: config.threshold,
      comparison: config.comparison || 'above',
      notifyEmail: config.notifyEmail,
      active: true,
      createdAt: now.toISOString(),
      lastTriggered: null,
    }

    await alerts.setJSON(alertId, alert)
    return alert
  }

  async getAlert(alertId: string) {
    const alerts = this.store(STORES.ALERTS)
    return await alerts.get(alertId, { type: 'json' })
  }

  async updateAlert(alertId: string, userId: string, updates: Record<string, unknown>) {
    const alerts = this.store(STORES.ALERTS)
    const alert = await this.getAlert(alertId)
    if (!alert || alert.userId !== userId) return null
    const updated = { ...alert, ...updates }
    await alerts.setJSON(alertId, updated)
    return updated
  }

  async deleteAlert(alertId: string, userId: string) {
    const alerts = this.store(STORES.ALERTS)
    const alert = await this.getAlert(alertId)
    if (!alert || alert.userId !== userId) return false
    await alerts.delete(alertId)
    return true
  }

  shouldAlertFire(alert: { lastTriggered?: string; threshold: number }, currentValue: number) {
    if (alert.lastTriggered) {
      const lastTriggered = new Date(alert.lastTriggered)
      const hoursSince = (Date.now() - lastTriggered.getTime()) / (1000 * 60 * 60)
      if (hoursSince < 1) return false
    }
    return currentValue >= alert.threshold
  }

  // === ANNOTATION OPERATIONS ===

  async createAnnotation(siteId: string, userId: string, config: Record<string, unknown>) {
    const annotations = this.store(STORES.ANNOTATIONS)
    const annotationId = 'annotation_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    const now = new Date()

    const annotation = {
      id: annotationId,
      siteId,
      userId,
      date: config.date,
      title: config.title,
      description: config.description || '',
      category: config.category || 'general',
      createdAt: now.toISOString(),
    }

    await annotations.setJSON(annotationId, annotation)
    return annotation
  }

  async getAnnotation(annotationId: string) {
    const annotations = this.store(STORES.ANNOTATIONS)
    return await annotations.get(annotationId, { type: 'json' })
  }

  async updateAnnotation(annotationId: string, userId: string, updates: Record<string, unknown>) {
    const annotations = this.store(STORES.ANNOTATIONS)
    const annotation = await this.getAnnotation(annotationId)
    if (!annotation || annotation.userId !== userId) return null
    const updated = { ...annotation, ...updates }
    await annotations.setJSON(annotationId, updated)
    return updated
  }

  async deleteAnnotation(annotationId: string, userId: string) {
    const annotations = this.store(STORES.ANNOTATIONS)
    const annotation = await this.getAnnotation(annotationId)
    if (!annotation || annotation.userId !== userId) return false
    await annotations.delete(annotationId)
    return true
  }

  // === OAUTH STATE OPERATIONS ===

  async storeOAuthState(stateId: string, data: Record<string, unknown>) {
    const oauthStates = this.store(STORES.OAUTH_STATES)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000)

    const state = {
      ...data,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    await oauthStates.setJSON(stateId, state)
    return state
  }

  async validateOAuthState(stateId: string) {
    const oauthStates = this.store(STORES.OAUTH_STATES)
    try {
      const state = await oauthStates.get(stateId, { type: 'json' })
      if (!state) return null

      if (new Date(state.expiresAt) < new Date()) {
        await oauthStates.delete(stateId)
        return null
      }

      return state
    } catch {
      return null
    }
  }

  async deleteOAuthState(stateId: string) {
    const oauthStates = this.store(STORES.OAUTH_STATES)
    await oauthStates.delete(stateId)
    return true
  }
}

// ==========================================
// TEST SETUP
// ==========================================

describe('Storage Functions', () => {
  let stores: StoreMap
  let storage: StorageService

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-09T12:00:00.000Z'))

    stores = {
      [STORES.USERS]: createMockStore(),
      [STORES.SITES]: createMockStore(),
      [STORES.PASSWORD_RESET_TOKENS]: createMockStore(),
      [STORES.PUBLIC_SHARES]: createMockStore(),
      [STORES.SESSIONS]: createMockStore(),
      [STORES.API_KEYS]: createMockStore(),
      [STORES.ACTIVITY_LOG]: createMockStore(),
      [STORES.WEBHOOKS]: createMockStore(),
      [STORES.ALERTS]: createMockStore(),
      [STORES.ANNOTATIONS]: createMockStore(),
      [STORES.TEAMS]: createMockStore(),
      [STORES.GOALS]: createMockStore(),
      [STORES.FUNNELS]: createMockStore(),
      [STORES.OAUTH_STATES]: createMockStore(),
    }
    storage = new StorageService(stores)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ==========================================
  // USER OPERATIONS TESTS
  // ==========================================
  describe('User Operations', () => {
    describe('createUser', () => {
      it('creates user with email and password hash', async () => {
        const result = await storage.createUser('test@example.com', 'hashed_password')

        expect(result.id).toMatch(/^user_/)
        expect(result.email).toBe('test@example.com')
        expect(result.passwordHash).toBe('hashed_password')
        expect(result.plan).toBe('pro')
        expect(result.subscription).toBeNull()
      })

      it('sets 14-day trial period', async () => {
        const result = await storage.createUser('test@example.com', 'hashed')

        const trialEnds = new Date(result.trialEndsAt)
        const created = new Date(result.createdAt)
        const daysDiff = (trialEnds.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)

        expect(daysDiff).toBe(14)
      })

      it('allows custom plan', async () => {
        const result = await storage.createUser('test@example.com', 'hashed', 'enterprise')

        expect(result.plan).toBe('enterprise')
      })

      it('stores user in blob store', async () => {
        await storage.createUser('test@example.com', 'hashed')

        expect(stores[STORES.USERS].setJSON).toHaveBeenCalledWith(
          'test@example.com',
          expect.objectContaining({ email: 'test@example.com' })
        )
      })
    })

    describe('getUser', () => {
      it('returns user by email', async () => {
        const mockUser = { id: 'user_123', email: 'test@example.com' }
        stores[STORES.USERS].get.mockResolvedValue(mockUser)

        const result = await storage.getUser('test@example.com')

        expect(result).toEqual(mockUser)
        expect(stores[STORES.USERS].get).toHaveBeenCalledWith('test@example.com', { type: 'json' })
      })

      it('returns null for non-existent user', async () => {
        stores[STORES.USERS].get.mockResolvedValue(null)

        const result = await storage.getUser('nonexistent@example.com')

        expect(result).toBeNull()
      })
    })

    describe('getUserById', () => {
      it('uses ID mapping for efficient lookup', async () => {
        stores[STORES.USERS].get.mockImplementation(async (key, opts) => {
          if (key === 'user_id_map_user_123') return 'test@example.com'
          if (key === 'test@example.com') return { id: 'user_123', email: 'test@example.com' }
          return null
        })

        const result = await storage.getUserById('user_123')

        expect(result).toEqual({ id: 'user_123', email: 'test@example.com' })
      })

      it('falls back to search when mapping missing', async () => {
        stores[STORES.USERS].get.mockImplementation(async (key, opts) => {
          if (key === 'user_id_map_user_123') throw new Error('Not found')
          if (key === 'test@example.com') return { id: 'user_123' }
          return null
        })
        stores[STORES.USERS].list.mockResolvedValue({
          blobs: [{ key: 'test@example.com' }],
        })

        const result = await storage.getUserById('user_123')

        expect(result).toEqual({ id: 'user_123', email: 'test@example.com' })
      })

      it('creates mapping after fallback search', async () => {
        stores[STORES.USERS].get.mockImplementation(async (key) => {
          if (key === 'user_id_map_user_123') throw new Error('Not found')
          if (key === 'test@example.com') return { id: 'user_123' }
          return null
        })
        stores[STORES.USERS].list.mockResolvedValue({
          blobs: [{ key: 'test@example.com' }],
        })

        await storage.getUserById('user_123')

        expect(stores[STORES.USERS].set).toHaveBeenCalledWith('user_id_map_user_123', 'test@example.com')
      })

      it('returns null when user not found', async () => {
        stores[STORES.USERS].get.mockImplementation(async () => null)
        stores[STORES.USERS].list.mockResolvedValue({ blobs: [] })

        const result = await storage.getUserById('nonexistent')

        expect(result).toBeNull()
      })
    })

    describe('updateUser', () => {
      it('merges updates with existing user', async () => {
        stores[STORES.USERS].get.mockResolvedValue({
          id: 'user_123',
          email: 'test@example.com',
          plan: 'free',
        })

        const result = await storage.updateUser('test@example.com', { plan: 'pro' })

        expect(result?.plan).toBe('pro')
        expect(result?.id).toBe('user_123')
      })

      it('returns null for non-existent user', async () => {
        stores[STORES.USERS].get.mockResolvedValue(null)

        const result = await storage.updateUser('nonexistent@example.com', { plan: 'pro' })

        expect(result).toBeNull()
      })
    })

    describe('deleteUser', () => {
      it('deletes existing user', async () => {
        stores[STORES.USERS].get.mockResolvedValue({ id: 'user_123' })

        const result = await storage.deleteUser('test@example.com')

        expect(result).toBe(true)
        expect(stores[STORES.USERS].delete).toHaveBeenCalledWith('test@example.com')
      })

      it('returns false for non-existent user', async () => {
        stores[STORES.USERS].get.mockResolvedValue(null)

        const result = await storage.deleteUser('nonexistent@example.com')

        expect(result).toBe(false)
      })
    })

    describe('createOAuthUser', () => {
      it('creates user without password hash', async () => {
        const result = await storage.createOAuthUser('test@example.com', 'google', 'google_123', 'Test User')

        expect(result.passwordHash).toBeNull()
        expect(result.oauthProvider).toBe('google')
        expect(result.oauthProviderId).toBe('google_123')
        expect(result.name).toBe('Test User')
      })
    })

    describe('getUserByCustomerId', () => {
      it('finds user by Stripe customer ID', async () => {
        stores[STORES.USERS].list.mockResolvedValue({
          blobs: [{ key: 'test@example.com' }],
        })
        stores[STORES.USERS].get.mockResolvedValue({
          id: 'user_123',
          subscription: { customerId: 'cus_123' },
        })

        const result = await storage.getUserByCustomerId('cus_123')

        expect(result).toEqual({
          email: 'test@example.com',
          id: 'user_123',
          subscription: { customerId: 'cus_123' },
        })
      })

      it('returns null when customer ID not found', async () => {
        stores[STORES.USERS].list.mockResolvedValue({ blobs: [] })

        const result = await storage.getUserByCustomerId('nonexistent')

        expect(result).toBeNull()
      })
    })

    describe('getUserStatus', () => {
      it('returns none status for null user', () => {
        const result = storage.getUserStatus(null)

        expect(result.status).toBe('none')
        expect(result.canAccess).toBe(false)
      })

      it('returns active status for active subscription', () => {
        const user = {
          plan: 'pro',
          subscription: { status: 'active' },
        }

        const result = storage.getUserStatus(user)

        expect(result.status).toBe('active')
        expect(result.canAccess).toBe(true)
        expect(result.plan).toBe('pro')
      })

      it('returns trial status within trial period', () => {
        const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        const user = {
          plan: 'pro',
          trialEndsAt: futureDate,
        }

        const result = storage.getUserStatus(user)

        expect(result.status).toBe('trial')
        expect(result.canAccess).toBe(true)
        expect(result.daysLeft).toBe(7)
      })

      it('returns expired status after trial ends', () => {
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const user = {
          plan: 'pro',
          trialEndsAt: pastDate,
        }

        const result = storage.getUserStatus(user)

        expect(result.status).toBe('expired')
        expect(result.canAccess).toBe(false)
      })
    })
  })

  // ==========================================
  // PASSWORD RESET TOKEN TESTS
  // ==========================================
  describe('Password Reset Token Operations', () => {
    describe('createPasswordResetToken', () => {
      it('creates token with 1-hour expiry', async () => {
        const result = await storage.createPasswordResetToken('test@example.com', 'reset_token_123')

        expect(result.email).toBe('test@example.com')
        const expiry = new Date(result.expiresAt)
        const created = new Date(result.createdAt)
        expect(expiry.getTime() - created.getTime()).toBe(60 * 60 * 1000)
      })

      it('stores token in blob store', async () => {
        await storage.createPasswordResetToken('test@example.com', 'reset_token_123')

        expect(stores[STORES.PASSWORD_RESET_TOKENS].setJSON).toHaveBeenCalledWith(
          'reset_token_123',
          expect.objectContaining({ email: 'test@example.com' })
        )
      })
    })

    describe('getPasswordResetToken', () => {
      it('returns valid token', async () => {
        const futureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString()
        stores[STORES.PASSWORD_RESET_TOKENS].get.mockResolvedValue({
          email: 'test@example.com',
          expiresAt: futureExpiry,
        })

        const result = await storage.getPasswordResetToken('valid_token')

        expect(result?.email).toBe('test@example.com')
      })

      it('returns null and deletes expired token', async () => {
        const pastExpiry = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        stores[STORES.PASSWORD_RESET_TOKENS].get.mockResolvedValue({
          email: 'test@example.com',
          expiresAt: pastExpiry,
        })

        const result = await storage.getPasswordResetToken('expired_token')

        expect(result).toBeNull()
        expect(stores[STORES.PASSWORD_RESET_TOKENS].delete).toHaveBeenCalledWith('expired_token')
      })

      it('returns null for non-existent token', async () => {
        stores[STORES.PASSWORD_RESET_TOKENS].get.mockResolvedValue(null)

        const result = await storage.getPasswordResetToken('nonexistent')

        expect(result).toBeNull()
      })
    })

    describe('deletePasswordResetToken', () => {
      it('deletes token from store', async () => {
        const result = await storage.deletePasswordResetToken('token_123')

        expect(result).toBe(true)
        expect(stores[STORES.PASSWORD_RESET_TOKENS].delete).toHaveBeenCalledWith('token_123')
      })
    })
  })

  // ==========================================
  // SITE OPERATIONS TESTS
  // ==========================================
  describe('Site Operations', () => {
    describe('createSite', () => {
      it('creates site with user ID and domain', async () => {
        stores[STORES.SITES].get.mockResolvedValue(null)

        const result = await storage.createSite('user_123', 'site_456', 'example.com')

        expect(result.id).toBe('site_456')
        expect(result.userId).toBe('user_123')
        expect(result.domain).toBe('example.com')
        expect(result.createdAt).toBeDefined()
      })

      it('adds site to user site list', async () => {
        stores[STORES.SITES].get.mockResolvedValue(['existing_site'])

        await storage.createSite('user_123', 'site_456', 'example.com')

        expect(stores[STORES.SITES].setJSON).toHaveBeenCalledWith(
          'user_sites_user_123',
          expect.arrayContaining(['site_456'])
        )
      })
    })

    describe('getSite', () => {
      it('returns site by ID', async () => {
        const mockSite = { id: 'site_123', domain: 'example.com' }
        stores[STORES.SITES].get.mockResolvedValue(mockSite)

        const result = await storage.getSite('site_123')

        expect(result).toEqual(mockSite)
      })
    })

    describe('updateSite', () => {
      it('updates site properties', async () => {
        stores[STORES.SITES].get.mockResolvedValue({
          id: 'site_123',
          domain: 'old.com',
        })

        const result = await storage.updateSite('site_123', { domain: 'new.com' })

        expect(result?.domain).toBe('new.com')
      })

      it('returns null for non-existent site', async () => {
        stores[STORES.SITES].get.mockResolvedValue(null)

        const result = await storage.updateSite('nonexistent', { domain: 'new.com' })

        expect(result).toBeNull()
      })
    })

    describe('deleteSite', () => {
      it('deletes site and removes from user list', async () => {
        stores[STORES.SITES].get.mockResolvedValue(['site_123', 'site_456'])

        await storage.deleteSite('site_123', 'user_123')

        expect(stores[STORES.SITES].delete).toHaveBeenCalledWith('site_123')
        expect(stores[STORES.SITES].setJSON).toHaveBeenCalledWith(
          'user_sites_user_123',
          expect.not.arrayContaining(['site_123'])
        )
      })
    })

    describe('getUserSites', () => {
      it('returns user site list', async () => {
        stores[STORES.SITES].get.mockResolvedValue(['site_1', 'site_2'])

        const result = await storage.getUserSites('user_123')

        expect(result).toEqual(['site_1', 'site_2'])
      })

      it('returns empty array when no sites', async () => {
        stores[STORES.SITES].get.mockResolvedValue(null)

        const result = await storage.getUserSites('user_123')

        expect(result).toEqual([])
      })
    })
  })

  // ==========================================
  // SESSION OPERATIONS TESTS
  // ==========================================
  describe('Session Operations', () => {
    describe('createSession', () => {
      it('creates session with 30-day expiry', async () => {
        stores[STORES.SESSIONS].get.mockResolvedValue(null)

        const result = await storage.createSession('user_123', { ip: '192.168.1.1' })

        expect(result.id).toMatch(/^sess_/)
        expect(result.userId).toBe('user_123')
        expect(result.ip).toBe('192.168.1.1')

        const expiry = new Date(result.expiresAt)
        const created = new Date(result.createdAt)
        const daysDiff = (expiry.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
        expect(daysDiff).toBe(30)
      })

      it('adds session to user session list', async () => {
        stores[STORES.SESSIONS].get.mockResolvedValue([])

        const result = await storage.createSession('user_123')

        expect(stores[STORES.SESSIONS].setJSON).toHaveBeenCalledWith(
          'user_sessions_user_123',
          expect.arrayContaining([result.id])
        )
      })
    })

    describe('getSession', () => {
      it('returns session by ID', async () => {
        const mockSession = { id: 'sess_123', userId: 'user_123' }
        stores[STORES.SESSIONS].get.mockResolvedValue(mockSession)

        const result = await storage.getSession('sess_123')

        expect(result).toEqual(mockSession)
      })
    })

    describe('revokeSession', () => {
      it('deletes session and removes from user list', async () => {
        stores[STORES.SESSIONS].get.mockResolvedValue(['sess_123', 'sess_456'])

        await storage.revokeSession('sess_123', 'user_123')

        expect(stores[STORES.SESSIONS].delete).toHaveBeenCalledWith('sess_123')
      })
    })
  })

  // ==========================================
  // API KEY OPERATIONS TESTS
  // ==========================================
  describe('API Key Operations', () => {
    describe('createApiKey', () => {
      it('creates API key with secret', async () => {
        stores[STORES.API_KEYS].get.mockResolvedValue([])

        const result = await storage.createApiKey('user_123', 'My Key', ['read', 'write'])

        expect(result.id).toMatch(/^key_/)
        expect(result.secretKey).toMatch(/^zta_/)
        expect(result.name).toBe('My Key')
        expect(result.permissions).toEqual(['read', 'write'])
        expect(result.usageCount).toBe(0)
      })
    })

    describe('validateApiKey', () => {
      it('validates and updates usage for valid key', async () => {
        stores[STORES.API_KEYS].list.mockResolvedValue({
          blobs: [{ key: 'key_123' }],
        })
        stores[STORES.API_KEYS].get.mockResolvedValue({
          id: 'key_123',
          secretKey: 'zta_valid_secret',
          usageCount: 5,
        })

        const result = await storage.validateApiKey('zta_valid_secret')

        expect(result?.id).toBe('key_123')
        expect(result?.usageCount).toBe(6)
      })

      it('returns null for invalid key', async () => {
        stores[STORES.API_KEYS].list.mockResolvedValue({ blobs: [] })

        const result = await storage.validateApiKey('invalid_secret')

        expect(result).toBeNull()
      })
    })

    describe('revokeApiKey', () => {
      it('revokes API key', async () => {
        stores[STORES.API_KEYS].get.mockResolvedValue(['key_123'])

        await storage.revokeApiKey('key_123', 'user_123')

        expect(stores[STORES.API_KEYS].delete).toHaveBeenCalledWith('key_123')
      })
    })
  })

  // ==========================================
  // ACTIVITY LOG TESTS
  // ==========================================
  describe('Activity Log Operations', () => {
    describe('logActivity', () => {
      it('creates activity log entry', async () => {
        stores[STORES.ACTIVITY_LOG].get.mockResolvedValue([])

        const result = await storage.logActivity('user_123', 'login', { ip: '192.168.1.1' })

        expect(result.id).toMatch(/^activity_/)
        expect(result.type).toBe('login')
        expect(result.details).toEqual({ ip: '192.168.1.1' })
      })

      it('prepends to user activity list', async () => {
        stores[STORES.ACTIVITY_LOG].get.mockResolvedValue(['old_activity'])

        const result = await storage.logActivity('user_123', 'login')

        expect(stores[STORES.ACTIVITY_LOG].setJSON).toHaveBeenCalledWith(
          'user_log_user_123',
          expect.arrayContaining([result.id, 'old_activity'])
        )
      })
    })

    describe('formatActivityMessage', () => {
      it('formats login activity', () => {
        const result = storage.formatActivityMessage({ type: 'login' })
        expect(result).toBe('Logged in')
      })

      it('formats site_created with domain', () => {
        const result = storage.formatActivityMessage({
          type: 'site_created',
          details: { domain: 'example.com' },
        })
        expect(result).toBe('Created site: example.com')
      })

      it('handles unknown activity type', () => {
        const result = storage.formatActivityMessage({ type: 'unknown_type' })
        expect(result).toBe('Unknown activity: unknown_type')
      })
    })
  })

  // ==========================================
  // PUBLIC SHARE TESTS
  // ==========================================
  describe('Public Share Operations', () => {
    describe('createPublicShare', () => {
      it('creates share with default options', async () => {
        const result = await storage.createPublicShare('site_123', 'user_123')

        expect(result.token).toMatch(/^share_/)
        expect(result.siteId).toBe('site_123')
        expect(result.allowedStats).toEqual(['pageviews', 'visitors', 'pages', 'referrers'])
      })

      it('creates share with custom options', async () => {
        const expiresAt = new Date(Date.now() + 86400000).toISOString()
        const result = await storage.createPublicShare('site_123', 'user_123', {
          expiresAt,
          password: 'secret',
        })

        expect(result.expiresAt).toBe(expiresAt)
        expect(result.password).toBe('secret')
      })
    })

    describe('getPublicShare', () => {
      it('returns valid share', async () => {
        stores[STORES.PUBLIC_SHARES].get.mockResolvedValue({
          token: 'share_123',
          siteId: 'site_123',
        })

        const result = await storage.getPublicShare('share_123')

        expect(result?.siteId).toBe('site_123')
      })

      it('returns null and deletes expired share', async () => {
        const pastExpiry = new Date(Date.now() - 86400000).toISOString()
        stores[STORES.PUBLIC_SHARES].get.mockResolvedValue({
          token: 'share_123',
          expiresAt: pastExpiry,
        })

        const result = await storage.getPublicShare('share_123')

        expect(result).toBeNull()
        expect(stores[STORES.PUBLIC_SHARES].delete).toHaveBeenCalledWith('share_123')
      })
    })

    describe('deletePublicShare', () => {
      it('deletes share owned by user', async () => {
        stores[STORES.PUBLIC_SHARES].get.mockResolvedValue({
          token: 'share_123',
          userId: 'user_123',
        })

        const result = await storage.deletePublicShare('share_123', 'user_123')

        expect(result).toBe(true)
        expect(stores[STORES.PUBLIC_SHARES].delete).toHaveBeenCalledWith('share_123')
      })

      it('returns false for share not owned by user', async () => {
        stores[STORES.PUBLIC_SHARES].get.mockResolvedValue({
          token: 'share_123',
          userId: 'other_user',
        })

        const result = await storage.deletePublicShare('share_123', 'user_123')

        expect(result).toBe(false)
      })
    })
  })

  // ==========================================
  // TEAM OPERATIONS TESTS
  // ==========================================
  describe('Team Operations', () => {
    describe('createTeam', () => {
      it('creates team with owner as member', async () => {
        stores[STORES.TEAMS].get.mockResolvedValue([])

        const result = await storage.createTeam('user_123', 'owner@example.com', 'My Team')

        expect(result.id).toMatch(/^team_/)
        expect(result.name).toBe('My Team')
        expect(result.ownerId).toBe('user_123')
        expect(result.members).toHaveLength(1)
        expect(result.members[0].role).toBe('owner')
      })
    })

    describe('getTeam', () => {
      it('returns team by ID', async () => {
        const mockTeam = { id: 'team_123', name: 'Test Team' }
        stores[STORES.TEAMS].get.mockResolvedValue(mockTeam)

        const result = await storage.getTeam('team_123')

        expect(result).toEqual(mockTeam)
      })
    })

    describe('getUserTeams', () => {
      it('returns all teams for user', async () => {
        stores[STORES.TEAMS].get.mockImplementation(async (key) => {
          if (key === 'user_teams_user_123') return ['team_1', 'team_2']
          if (key === 'team_1') return { id: 'team_1', name: 'Team 1' }
          if (key === 'team_2') return { id: 'team_2', name: 'Team 2' }
          return null
        })

        const result = await storage.getUserTeams('user_123')

        expect(result).toHaveLength(2)
        expect(result[0].name).toBe('Team 1')
      })
    })

    describe('getTeamMemberRole', () => {
      it('returns member role', async () => {
        stores[STORES.TEAMS].get.mockResolvedValue({
          id: 'team_123',
          members: [{ userId: 'user_123', role: 'admin' }],
        })

        const result = await storage.getTeamMemberRole('team_123', 'user_123')

        expect(result).toBe('admin')
      })

      it('returns null for non-member', async () => {
        stores[STORES.TEAMS].get.mockResolvedValue({
          id: 'team_123',
          members: [],
        })

        const result = await storage.getTeamMemberRole('team_123', 'nonmember')

        expect(result).toBeNull()
      })
    })

    describe('getTeamMembers', () => {
      it('returns all team members', async () => {
        const members = [
          { userId: 'user_1', role: 'owner' },
          { userId: 'user_2', role: 'member' },
        ]
        stores[STORES.TEAMS].get.mockResolvedValue({ members })

        const result = await storage.getTeamMembers('team_123')

        expect(result).toEqual(members)
      })
    })
  })

  // ==========================================
  // GOAL OPERATIONS TESTS
  // ==========================================
  describe('Goal Operations', () => {
    describe('createGoal', () => {
      it('creates goal with config', async () => {
        const result = await storage.createGoal('site_123', 'user_123', {
          name: 'Monthly Visitors',
          metric: 'visitors',
          target: 1000,
          period: 'monthly',
        })

        expect(result.id).toMatch(/^goal_/)
        expect(result.name).toBe('Monthly Visitors')
        expect(result.target).toBe(1000)
        expect(result.currentValue).toBe(0)
      })
    })

    describe('getGoal', () => {
      it('returns goal by ID', async () => {
        stores[STORES.GOALS].get.mockResolvedValue({
          id: 'goal_123',
          name: 'Test Goal',
        })

        const result = await storage.getGoal('goal_123')

        expect(result?.name).toBe('Test Goal')
      })
    })

    describe('updateGoal', () => {
      it('updates goal owned by user', async () => {
        stores[STORES.GOALS].get.mockResolvedValue({
          id: 'goal_123',
          userId: 'user_123',
          target: 100,
        })

        const result = await storage.updateGoal('goal_123', 'user_123', { target: 200 })

        expect(result?.target).toBe(200)
      })

      it('returns null for goal not owned by user', async () => {
        stores[STORES.GOALS].get.mockResolvedValue({
          id: 'goal_123',
          userId: 'other_user',
        })

        const result = await storage.updateGoal('goal_123', 'user_123', { target: 200 })

        expect(result).toBeNull()
      })
    })

    describe('deleteGoal', () => {
      it('deletes goal owned by user', async () => {
        stores[STORES.GOALS].get.mockResolvedValue({
          id: 'goal_123',
          userId: 'user_123',
        })

        const result = await storage.deleteGoal('goal_123', 'user_123')

        expect(result).toBe(true)
      })
    })
  })

  // ==========================================
  // FUNNEL OPERATIONS TESTS
  // ==========================================
  describe('Funnel Operations', () => {
    describe('createFunnel', () => {
      it('creates funnel with steps', async () => {
        const result = await storage.createFunnel('site_123', 'user_123', {
          name: 'Checkout Funnel',
          steps: [
            { path: '/cart', name: 'Cart' },
            { path: '/checkout', name: 'Checkout' },
            { path: '/thank-you', name: 'Complete' },
          ],
        })

        expect(result.id).toMatch(/^funnel_/)
        expect(result.name).toBe('Checkout Funnel')
        expect(result.steps).toHaveLength(3)
      })
    })

    describe('getFunnel', () => {
      it('returns funnel by ID', async () => {
        stores[STORES.FUNNELS].get.mockResolvedValue({
          id: 'funnel_123',
          name: 'Test Funnel',
        })

        const result = await storage.getFunnel('funnel_123')

        expect(result?.name).toBe('Test Funnel')
      })
    })

    describe('updateFunnel', () => {
      it('updates funnel owned by user', async () => {
        stores[STORES.FUNNELS].get.mockResolvedValue({
          id: 'funnel_123',
          userId: 'user_123',
          name: 'Old Name',
        })

        const result = await storage.updateFunnel('funnel_123', 'user_123', { name: 'New Name' })

        expect(result?.name).toBe('New Name')
      })
    })

    describe('deleteFunnel', () => {
      it('deletes funnel owned by user', async () => {
        stores[STORES.FUNNELS].get.mockResolvedValue({
          id: 'funnel_123',
          userId: 'user_123',
        })

        const result = await storage.deleteFunnel('funnel_123', 'user_123')

        expect(result).toBe(true)
      })
    })
  })

  // ==========================================
  // WEBHOOK OPERATIONS TESTS
  // ==========================================
  describe('Webhook Operations', () => {
    describe('createWebhook', () => {
      it('creates webhook with secret key', async () => {
        const result = await storage.createWebhook('site_123', 'user_123', {
          url: 'https://example.com/webhook',
          events: ['pageview', 'event'],
        })

        expect(result.id).toMatch(/^webhook_/)
        expect(result.secretKey).toMatch(/^whsec_/)
        expect(result.url).toBe('https://example.com/webhook')
        expect(result.active).toBe(true)
      })
    })

    describe('getWebhook', () => {
      it('returns webhook by ID', async () => {
        stores[STORES.WEBHOOKS].get.mockResolvedValue({
          id: 'webhook_123',
          url: 'https://example.com/webhook',
        })

        const result = await storage.getWebhook('webhook_123')

        expect(result?.url).toBe('https://example.com/webhook')
      })
    })

    describe('updateWebhook', () => {
      it('updates webhook owned by user', async () => {
        stores[STORES.WEBHOOKS].get.mockResolvedValue({
          id: 'webhook_123',
          userId: 'user_123',
          active: true,
        })

        const result = await storage.updateWebhook('webhook_123', 'user_123', { active: false })

        expect(result?.active).toBe(false)
      })
    })

    describe('deleteWebhook', () => {
      it('deletes webhook owned by user', async () => {
        stores[STORES.WEBHOOKS].get.mockResolvedValue({
          id: 'webhook_123',
          userId: 'user_123',
        })

        const result = await storage.deleteWebhook('webhook_123', 'user_123')

        expect(result).toBe(true)
      })
    })
  })

  // ==========================================
  // ALERT OPERATIONS TESTS
  // ==========================================
  describe('Alert Operations', () => {
    describe('createAlert', () => {
      it('creates alert with config', async () => {
        const result = await storage.createAlert('site_123', 'user_123', {
          name: 'Traffic Spike',
          type: 'traffic',
          threshold: 1000,
          comparison: 'above',
          notifyEmail: 'alerts@example.com',
        })

        expect(result.id).toMatch(/^alert_/)
        expect(result.name).toBe('Traffic Spike')
        expect(result.threshold).toBe(1000)
        expect(result.active).toBe(true)
      })
    })

    describe('shouldAlertFire', () => {
      it('returns true when threshold exceeded', () => {
        const alert = { threshold: 100 }
        const result = storage.shouldAlertFire(alert, 150)
        expect(result).toBe(true)
      })

      it('returns false when below threshold', () => {
        const alert = { threshold: 100 }
        const result = storage.shouldAlertFire(alert, 50)
        expect(result).toBe(false)
      })

      it('returns false when recently triggered', () => {
        const recentTrigger = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        const alert = { threshold: 100, lastTriggered: recentTrigger }
        const result = storage.shouldAlertFire(alert, 150)
        expect(result).toBe(false)
      })
    })
  })

  // ==========================================
  // ANNOTATION OPERATIONS TESTS
  // ==========================================
  describe('Annotation Operations', () => {
    describe('createAnnotation', () => {
      it('creates annotation with config', async () => {
        const result = await storage.createAnnotation('site_123', 'user_123', {
          date: '2026-01-09',
          title: 'Site Redesign',
          description: 'Launched new homepage design',
          category: 'release',
        })

        expect(result.id).toMatch(/^annotation_/)
        expect(result.title).toBe('Site Redesign')
        expect(result.category).toBe('release')
      })
    })

    describe('getAnnotation', () => {
      it('returns annotation by ID', async () => {
        stores[STORES.ANNOTATIONS].get.mockResolvedValue({
          id: 'annotation_123',
          title: 'Test Annotation',
        })

        const result = await storage.getAnnotation('annotation_123')

        expect(result?.title).toBe('Test Annotation')
      })
    })

    describe('updateAnnotation', () => {
      it('updates annotation owned by user', async () => {
        stores[STORES.ANNOTATIONS].get.mockResolvedValue({
          id: 'annotation_123',
          userId: 'user_123',
          title: 'Old Title',
        })

        const result = await storage.updateAnnotation('annotation_123', 'user_123', { title: 'New Title' })

        expect(result?.title).toBe('New Title')
      })
    })

    describe('deleteAnnotation', () => {
      it('deletes annotation owned by user', async () => {
        stores[STORES.ANNOTATIONS].get.mockResolvedValue({
          id: 'annotation_123',
          userId: 'user_123',
        })

        const result = await storage.deleteAnnotation('annotation_123', 'user_123')

        expect(result).toBe(true)
      })
    })
  })

  // ==========================================
  // OAUTH STATE OPERATIONS TESTS
  // ==========================================
  describe('OAuth State Operations', () => {
    describe('storeOAuthState', () => {
      it('stores state with 10-minute expiry', async () => {
        const result = await storage.storeOAuthState('state_123', {
          provider: 'google',
          returnUrl: '/dashboard',
        })

        expect(result.provider).toBe('google')
        const expiry = new Date(result.expiresAt)
        const created = new Date(result.createdAt)
        expect(expiry.getTime() - created.getTime()).toBe(10 * 60 * 1000)
      })
    })

    describe('validateOAuthState', () => {
      it('returns valid state', async () => {
        const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString()
        stores[STORES.OAUTH_STATES].get.mockResolvedValue({
          provider: 'google',
          expiresAt: futureExpiry,
        })

        const result = await storage.validateOAuthState('state_123')

        expect(result?.provider).toBe('google')
      })

      it('returns null and deletes expired state', async () => {
        const pastExpiry = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        stores[STORES.OAUTH_STATES].get.mockResolvedValue({
          provider: 'google',
          expiresAt: pastExpiry,
        })

        const result = await storage.validateOAuthState('state_123')

        expect(result).toBeNull()
        expect(stores[STORES.OAUTH_STATES].delete).toHaveBeenCalledWith('state_123')
      })
    })

    describe('deleteOAuthState', () => {
      it('deletes OAuth state', async () => {
        const result = await storage.deleteOAuthState('state_123')

        expect(result).toBe(true)
        expect(stores[STORES.OAUTH_STATES].delete).toHaveBeenCalledWith('state_123')
      })
    })
  })
})
