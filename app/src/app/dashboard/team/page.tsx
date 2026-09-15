'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Button, Card, Input } from '@/components/ui'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

interface TeamMember {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  status: 'active' | 'pending'
  joinedAt?: string
  imageUrl?: string
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

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

const roleColors: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  editor: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
}

export default function TeamPage() {
  const { getToken } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [userRole, setUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [showDeleteTeamModal, setShowDeleteTeamModal] = useState(false)
  const [showTeamSettingsModal, setShowTeamSettingsModal] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const [newTeamName, setNewTeamName] = useState('')
  const [editTeamName, setEditTeamName] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

  // Fetch teams on load
  useEffect(() => {
    fetchTeams()
  }, [])

  // Fetch team details when selected team changes
  useEffect(() => {
    if (selectedTeam) {
      fetchTeamDetails(selectedTeam.id)
    }
  }, [selectedTeam])

  async function fetchTeams() {
    try {
      setLoading(true)
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/teams`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json()
        setTeams(data.teams || [])
        if (data.teams?.length > 0) {
          setSelectedTeam(data.teams[0])
        }
      } else {
        setError('Failed to load teams')
      }
    } catch (err) {
      console.error('Teams fetch error:', err)
      setError('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }

  async function fetchTeamDetails(teamId: string) {
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/teams?teamId=${teamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json()
        setMembers(data.members || [])
        setInvites(data.invites || [])
        setUserRole(data.userRole || 'viewer')
        if (data.team?.name) {
          setEditTeamName(data.team.name)
        }
      }
    } catch (err) {
      console.error('Team details fetch error:', err)
    }
  }

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTeamName.trim()) return

    setActionLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newTeamName }),
      })

      if (res.ok) {
        const data = await res.json()
        setTeams([...teams, data.team])
        setSelectedTeam(data.team)
        setShowCreateTeamModal(false)
        setNewTeamName('')
      }
    } catch (err) {
      console.error('Create team error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTeam || !inviteEmail.trim()) return

    setActionLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'invite',
          teamId: selectedTeam.id,
          email: inviteEmail,
          role: inviteRole,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setInvites([...invites, data.invite])
        setShowInviteModal(false)
        setInviteEmail('')
        setInviteRole('viewer')
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to send invite')
      }
    } catch (err) {
      console.error('Invite error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!selectedTeam || !memberToRemove) return

    setActionLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${apiUrl}/api/teams?teamId=${selectedTeam.id}&memberId=${memberToRemove.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (res.ok) {
        setMembers(members.filter((m) => m.id !== memberToRemove.id))
        setShowRemoveModal(false)
        setMemberToRemove(null)
      }
    } catch (err) {
      console.error('Remove member error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    if (!selectedTeam) return

    try {
      const token = await getToken()
      const res = await fetch(
        `${apiUrl}/api/teams?teamId=${selectedTeam.id}&inviteId=${inviteId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (res.ok) {
        setInvites(invites.filter((i) => i.id !== inviteId))
      }
    } catch (err) {
      console.error('Revoke invite error:', err)
    }
  }

  const handleRenameTeam = async () => {
    if (!selectedTeam || !editTeamName.trim() || editTeamName === selectedTeam.name) return

    setActionLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(`${apiUrl}/api/teams`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          name: editTeamName,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setTeams(teams.map((t) => (t.id === selectedTeam.id ? { ...t, name: editTeamName } : t)))
        setSelectedTeam({ ...selectedTeam, name: editTeamName })
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to rename team')
      }
    } catch (err) {
      console.error('Rename team error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return

    setActionLoading(true)
    try {
      const token = await getToken()
      const res = await fetch(
        `${apiUrl}/api/teams?teamId=${selectedTeam.id}&action=deleteTeam`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (res.ok) {
        const updatedTeams = teams.filter((t) => t.id !== selectedTeam.id)
        setTeams(updatedTeams)
        setSelectedTeam(updatedTeams.length > 0 ? updatedTeams[0] : null)
        setShowDeleteTeamModal(false)
        setMembers([])
        setInvites([])
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete team')
      }
    } catch (err) {
      console.error('Delete team error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const canManageMembers = userRole === 'owner' || userRole === 'admin'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        <Button onClick={fetchTeams} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground">Manage your team members and permissions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreateTeamModal(true)}>
            New Team
          </Button>
          {canManageMembers && selectedTeam && (
            <Button onClick={() => setShowInviteModal(true)}>
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Invite Member
            </Button>
          )}
        </div>
      </div>

      {/* Team Selector */}
      {teams.length > 0 && (
        <Card className="p-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Select Team:</label>
            <select
              value={selectedTeam?.id || ''}
              onChange={(e) => {
                const team = teams.find((t) => t.id === e.target.value)
                setSelectedTeam(team || null)
                setEditTeamName(team?.name || '')
              }}
              className="px-3 py-2 border border-input rounded-md bg-background"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            {userRole === 'owner' && selectedTeam && (
              <button
                onClick={() => setShowTeamSettingsModal(true)}
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Team Settings"
              >
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
            {userRole && (
              <span className="text-sm text-muted-foreground">
                Your role: <span className={`px-2 py-0.5 rounded-full text-xs ${roleColors[userRole] || ''}`}>{roleLabels[userRole] || userRole}</span>
              </span>
            )}
          </div>
        </Card>
      )}

      {/* No Teams State */}
      {teams.length === 0 && (
        <Card className="p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-muted-foreground mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="text-lg font-semibold mb-2">No Teams Yet</h3>
          <p className="text-muted-foreground mb-4">Create a team to collaborate with others on your analytics.</p>
          <Button onClick={() => setShowCreateTeamModal(true)}>Create Your First Team</Button>
        </Card>
      )}

      {/* Team Members Table */}
      {selectedTeam && members.length > 0 && (
        <Card className="overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold">Team Members</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Member
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Joined
                  </th>
                  {canManageMembers && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {member.imageUrl ? (
                          <img
                            src={member.imageUrl}
                            alt={member.name || 'Member'}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                            {(member.name || member.email || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="ml-4">
                          <div className="font-medium">{member.name || (member.email ? member.email.split('@')[0] : 'Unknown')}</div>
                          <div className="text-sm text-muted-foreground">{member.email || 'No email'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${roleColors[member.role] || 'bg-gray-100 text-gray-800'}`}>
                        {roleLabels[member.role] || member.role || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          member.status === 'active'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                        }`}
                      >
                        {member.status === 'active' ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '-'}
                    </td>
                    {canManageMembers && (
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {member.role !== 'owner' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMemberToRemove(member)
                              setShowRemoveModal(true)
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pending Invites */}
      {selectedTeam && invites.length > 0 && canManageMembers && (
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold">Pending Invites</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td className="px-6 py-4 whitespace-nowrap">{invite.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${roleColors[invite.role] || 'bg-gray-100 text-gray-800'}`}>
                        {roleLabels[invite.role] || invite.role || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeInvite(invite.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Team Modal */}
      <Modal
        isOpen={showCreateTeamModal}
        onClose={() => setShowCreateTeamModal(false)}
        title="Create New Team"
        description="Create a team to collaborate with others"
      >
        <form onSubmit={handleCreateTeam}>
          <div className="space-y-4">
            <div>
              <label htmlFor="teamName" className="block text-sm font-medium mb-1">
                Team Name
              </label>
              <Input
                id="teamName"
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="My Team"
                required
              />
            </div>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateTeamModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={actionLoading}>
              {actionLoading ? 'Creating...' : 'Create Team'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Invite Modal */}
      <Modal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite Team Member"
        description="Send an invitation to join your team"
      >
        <form onSubmit={handleInvite}>
          <div className="space-y-4">
            <div>
              <label htmlFor="inviteEmail" className="block text-sm font-medium mb-1">
                Email Address
              </label>
              <Input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
              />
            </div>
            <div>
              <label htmlFor="inviteRole" className="block text-sm font-medium mb-1">
                Role
              </label>
              <select
                id="inviteRole"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'editor' | 'viewer')}
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
              >
                <option value="admin">Admin - Full access, can manage members</option>
                <option value="editor">Editor - Can view and edit sites</option>
                <option value="viewer">Viewer - Read-only access</option>
              </select>
            </div>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={actionLoading}>
              {actionLoading ? 'Sending...' : 'Send Invitation'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Remove Member Confirmation */}
      <ConfirmModal
        isOpen={showRemoveModal}
        onClose={() => {
          setShowRemoveModal(false)
          setMemberToRemove(null)
        }}
        onConfirm={handleRemoveMember}
        title="Remove Team Member"
        message={`Are you sure you want to remove ${memberToRemove?.email} from the team? They will lose access to all team sites.`}
        confirmText="Remove"
        variant="danger"
        loading={actionLoading}
      />

      {/* Delete Team Confirmation */}
      <ConfirmModal
        isOpen={showDeleteTeamModal}
        onClose={() => setShowDeleteTeamModal(false)}
        onConfirm={handleDeleteTeam}
        title="Delete Team"
        message={`Are you sure you want to delete "${selectedTeam?.name}"? This action cannot be undone. All team members will lose access to shared sites.`}
        confirmText="Delete Team"
        variant="danger"
        loading={actionLoading}
      />

      {/* Team Settings Modal */}
      <Modal
        isOpen={showTeamSettingsModal}
        onClose={() => setShowTeamSettingsModal(false)}
        title="Team Settings"
        description="Manage your team settings"
      >
        <div className="space-y-6">
          {/* Rename Team */}
          <div>
            <label htmlFor="editTeamNameModal" className="block text-sm font-medium mb-2">
              Team Name
            </label>
            <div className="flex gap-2">
              <Input
                id="editTeamNameModal"
                type="text"
                value={editTeamName}
                onChange={(e) => setEditTeamName(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={async () => {
                  await handleRenameTeam()
                  if (editTeamName !== selectedTeam?.name) {
                    // Keep modal open if rename failed
                  }
                }}
                disabled={actionLoading || !editTeamName.trim() || editTeamName === selectedTeam?.name}
              >
                {actionLoading ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Once you delete a team, there is no going back. All team members will lose access.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setShowTeamSettingsModal(false)
                setShowDeleteTeamModal(true)
              }}
              className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Delete Team
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
