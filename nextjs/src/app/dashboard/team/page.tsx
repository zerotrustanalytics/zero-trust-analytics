'use client'

import { useState } from 'react'
import { Button, Card, Input } from '@/components/ui'
import { Modal, ModalFooter } from '@/components/ui/Modal'

interface TeamMember {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: 'active' | 'pending'
  joinedAt: string
}

const mockMembers: TeamMember[] = [
  {
    id: '1',
    email: 'jasonsutter87@gmail.com',
    name: 'Jason Sutter',
    role: 'owner',
    status: 'active',
    joinedAt: '2024-01-15',
  },
]

const roleLabels = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}

const roleColors = {
  owner: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
  admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  member: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  viewer: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>(mockMembers)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [loading, setLoading] = useState(false)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/teams/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })

      if (res.ok) {
        setMembers([
          ...members,
          {
            id: Date.now().toString(),
            email: inviteEmail,
            name: inviteEmail.split('@')[0],
            role: inviteRole,
            status: 'pending',
            joinedAt: new Date().toISOString(),
          },
        ])
        setShowInviteModal(false)
        setInviteEmail('')
        setInviteRole('member')
      }
    } catch (error) {
      console.error('Invite error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) return

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      await fetch(`${apiUrl}/api/teams/members/${memberId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      setMembers(members.filter((m) => m.id !== memberId))
    } catch (error) {
      console.error('Remove error:', error)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground">Manage your team members and permissions</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Invite Member
        </Button>
      </div>

      {/* Team Members Table */}
      <Card className="overflow-hidden">
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
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="font-medium">{member.name}</div>
                        <div className="text-sm text-muted-foreground">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${roleColors[member.role]}`}>
                      {roleLabels[member.role]}
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
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {member.role !== 'owner' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
              >
                <option value="admin">Admin - Full access</option>
                <option value="member">Member - Can view and edit</option>
                <option value="viewer">Viewer - Read-only access</option>
              </select>
            </div>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send Invitation'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  )
}
