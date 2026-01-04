'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'

interface TeamMember {
  userId: string
  email: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  joinedAt: string
}

interface TeamInvite {
  id: string
  email: string
  role: string
  expiresAt: string
}

interface Team {
  id: string
  name: string
  ownerId: string
  createdAt: string
}

interface TeamDetails {
  team: Team
  members: TeamMember[]
  invites: TeamInvite[]
  sites: string[]
  userRole: string
}

export default function TeamPage() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<TeamDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [creating, setCreating] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)

  const fetchTeams = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/teams`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to fetch teams')
        return
      }

      setTeams(data.teams || [])
    } catch {
      setError('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  const fetchTeamDetails = useCallback(async (teamId: string) => {
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/teams?teamId=${teamId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to fetch team details')
        return
      }

      setSelectedTeam(data)
    } catch {
      setError('Failed to load team details')
    }
  }, [getToken])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  const createTeam = async () => {
    if (!newTeamName.trim()) {
      alert('Please enter a team name')
      return
    }

    setCreating(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/teams`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newTeamName }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to create team')
        return
      }

      setTeams([data.team, ...teams])
      setNewTeamName('')
      setShowCreateModal(false)
      fetchTeamDetails(data.team.id)
    } catch {
      alert('Failed to create team')
    } finally {
      setCreating(false)
    }
  }

  const inviteMember = async () => {
    if (!inviteEmail.trim()) {
      alert('Please enter an email address')
      return
    }

    if (!selectedTeam) return

    setInviting(true)
    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/teams`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'invite',
          teamId: selectedTeam.team.id,
          email: inviteEmail,
          role: inviteRole,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to send invite')
        return
      }

      setInviteUrl(data.inviteUrl)
      setInviteEmail('')
      fetchTeamDetails(selectedTeam.team.id)
    } catch {
      alert('Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  const revokeInvite = async (inviteId: string) => {
    if (!selectedTeam) return
    if (!confirm('Are you sure you want to revoke this invite?')) return

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/teams?teamId=${selectedTeam.team.id}&inviteId=${inviteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        fetchTeamDetails(selectedTeam.team.id)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to revoke invite')
      }
    } catch {
      alert('Failed to revoke invite')
    }
  }

  const removeMember = async (memberId: string) => {
    if (!selectedTeam) return
    if (!confirm('Are you sure you want to remove this member?')) return

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/teams?teamId=${selectedTeam.team.id}&memberId=${memberId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        fetchTeamDetails(selectedTeam.team.id)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to remove member')
      }
    } catch {
      alert('Failed to remove member')
    }
  }

  const updateMemberRole = async (memberId: string, newRole: string) => {
    if (!selectedTeam) return

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/teams`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'updateRole',
          teamId: selectedTeam.team.id,
          memberId,
          role: newRole,
        }),
      })

      if (res.ok) {
        fetchTeamDetails(selectedTeam.team.id)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update role')
      }
    } catch {
      alert('Failed to update role')
    }
  }

  const leaveTeam = async () => {
    if (!selectedTeam) return
    if (!confirm('Are you sure you want to leave this team?')) return

    try {
      const token = await getToken()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      const res = await fetch(`${apiUrl}/api/teams?teamId=${selectedTeam.team.id}&action=leave`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        setSelectedTeam(null)
        fetchTeams()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to leave team')
      }
    } catch {
      alert('Failed to leave team')
    }
  }

  const copyInviteUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
      case 'admin': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
      case 'editor': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const canManageMembers = selectedTeam?.userRole === 'owner' || selectedTeam?.userRole === 'admin'
  const isOwner = selectedTeam?.userRole === 'owner'

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground">Collaborate with your team members</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
        >
          Create Team
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Teams List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold">Your Teams</h2>
            </div>
            {teams.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <p>No teams yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-2 text-primary hover:underline"
                >
                  Create your first team
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {teams.map((team) => (
                  <li key={team.id}>
                    <button
                      onClick={() => fetchTeamDetails(team.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition ${
                        selectedTeam?.team.id === team.id ? 'bg-primary/5 border-l-2 border-primary' : ''
                      }`}
                    >
                      <p className="font-medium">{team.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Created {new Date(team.createdAt).toLocaleDateString()}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Team Details */}
        <div className="lg:col-span-2">
          {selectedTeam ? (
            <div className="space-y-6">
              {/* Team Header */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold">{selectedTeam.team.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      Your role: <span className={`px-2 py-0.5 text-xs rounded ${getRoleBadgeColor(selectedTeam.userRole)}`}>
                        {selectedTeam.userRole}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {canManageMembers && (
                      <button
                        onClick={() => setShowInviteModal(true)}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
                      >
                        Invite Member
                      </button>
                    )}
                    {!isOwner && (
                      <button
                        onClick={leaveTeam}
                        className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        Leave Team
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Members */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-semibold">Members ({selectedTeam.members.length})</h3>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Joined</th>
                      {canManageMembers && (
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {selectedTeam.members.map((member) => (
                      <tr key={member.userId}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{member.email}</span>
                            {member.userId === user?.id && (
                              <span className="text-xs text-muted-foreground">(you)</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {canManageMembers && member.role !== 'owner' && member.userId !== user?.id ? (
                            <select
                              value={member.role}
                              onChange={(e) => updateMemberRole(member.userId, e.target.value)}
                              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700"
                            >
                              <option value="admin">Admin</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 text-xs rounded ${getRoleBadgeColor(member.role)}`}>
                              {member.role}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </td>
                        {canManageMembers && (
                          <td className="px-4 py-3 text-right">
                            {member.role !== 'owner' && member.userId !== user?.id && (
                              <button
                                onClick={() => removeMember(member.userId)}
                                className="text-red-600 dark:text-red-400 hover:text-red-800 text-sm"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pending Invites */}
              {canManageMembers && selectedTeam.invites.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold">Pending Invites ({selectedTeam.invites.length})</h3>
                  </div>
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expires</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {selectedTeam.invites.map((invite) => (
                        <tr key={invite.id}>
                          <td className="px-4 py-3 font-medium">{invite.email}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs rounded ${getRoleBadgeColor(invite.role)}`}>
                              {invite.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {new Date(invite.expiresAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => revokeInvite(invite.id)}
                              className="text-red-600 dark:text-red-400 hover:text-red-800 text-sm"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium">Select a team</h3>
              <p className="mt-2 text-muted-foreground">Choose a team from the list to view details and manage members.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Create Team</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Team Name</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="My Team"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); setNewTeamName('') }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={createTeam}
                disabled={creating || !newTeamName.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Invite Team Member</h2>

            {inviteUrl ? (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-sm text-green-700 dark:text-green-400 mb-2">Invite link created! Share it with the recipient:</p>
                  <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded border">
                    <code className="flex-1 text-sm font-mono break-all">{inviteUrl}</code>
                    <button
                      onClick={() => copyInviteUrl(inviteUrl)}
                      className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 flex-shrink-0"
                    >
                      {copiedInvite ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { setShowInviteModal(false); setInviteUrl(null) }}
                  className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@example.com"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'admin' | 'editor' | 'viewer')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    >
                      <option value="admin">Admin - Can manage team and members</option>
                      <option value="editor">Editor - Can edit sites and analytics</option>
                      <option value="viewer">Viewer - Read-only access</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => { setShowInviteModal(false); setInviteEmail('') }}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={inviteMember}
                    disabled={inviting || !inviteEmail.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {inviting ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
