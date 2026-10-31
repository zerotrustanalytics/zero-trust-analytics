import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@/test/utils/test-utils'
import userEvent from '@testing-library/user-event'
import { AddSiteModal } from '@/components/dashboard/AddSiteModal'

// The modal creates the site itself (POST /api/sites/create with the gatekeep
// token from the mocked useAuth in vitest.setup.tsx) and reports it via onSuccess.

const mockFetch = vi.fn()
const site = { id: 'site_abc123', domain: 'example.com', name: 'example.com' }
const created = () => ({ ok: true, json: async () => ({ site }) })

describe('AddSiteModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const open = () => render(<AddSiteModal isOpen onClose={onClose} onSuccess={onSuccess} />)
  const domainField = () => screen.getByLabelText('Domain')
  const nameField = () => screen.getByLabelText('Site Name (optional)')
  const submit = () => screen.getByRole('button', { name: 'Add Site' })

  describe('rendering', () => {
    it('renders a labelled dialog with both fields and both buttons', () => {
      open()
      expect(screen.getByRole('dialog', { name: 'Add New Site' })).toBeInTheDocument()
      expect(domainField()).toBeInTheDocument()
      expect(nameField()).toBeInTheDocument()
      expect(submit()).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('renders nothing when closed', () => {
      render(<AddSiteModal isOpen={false} onClose={onClose} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('requires a domain', async () => {
      const user = userEvent.setup()
      open()
      await user.click(submit())
      expect(screen.getByRole('alert')).toHaveTextContent('Domain is required')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects something that is not a domain', async () => {
      const user = userEvent.setup()
      open()
      await user.type(domainField(), 'not a domain')
      await user.click(submit())
      expect(screen.getByRole('alert')).toHaveTextContent('valid domain')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('submitting', () => {
    it('creates the site with the bearer token, cleaned domain and default name', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce(created())
      open()
      await user.type(domainField(), 'https://example.com/pricing')
      await user.click(submit())

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toMatch(/\/api\/sites\/create$/)
      expect(init.method).toBe('POST')
      expect(init.headers.Authorization).toBe('Bearer test-token')
      expect(JSON.parse(init.body)).toEqual({ domain: 'example.com', name: 'example.com' })
    })

    it('sends the name when one is given', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce(created())
      open()
      await user.type(domainField(), 'example.com')
      await user.type(nameField(), 'Marketing site')
      await user.click(submit())
      await waitFor(() => expect(mockFetch).toHaveBeenCalled())
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).name).toBe('Marketing site')
    })

    it('reports the new site and closes on success', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce(created())
      open()
      await user.type(domainField(), 'example.com')
      await user.click(submit())
      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(site))
      expect(onClose).toHaveBeenCalled()
    })

    it('shows the server error and stays open', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Site already exists' }) })
      open()
      await user.type(domainField(), 'example.com')
      await user.click(submit())
      expect(await screen.findByRole('alert')).toHaveTextContent('Site already exists')
      expect(onSuccess).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('disables the form while the request is in flight', async () => {
      const user = userEvent.setup()
      let finish: (v: unknown) => void = () => {}
      mockFetch.mockReturnValueOnce(new Promise((r) => { finish = r }))
      open()
      await user.type(domainField(), 'example.com')
      await user.click(submit())
      await waitFor(() => expect(submit()).toBeDisabled())
      expect(domainField()).toBeDisabled()
      finish(created())
      await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    })
  })

  describe('closing', () => {
    it('closes from Cancel, Escape and the backdrop', async () => {
      const user = userEvent.setup()
      open()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      await user.keyboard('{Escape}')
      await user.click(screen.getByTestId('modal-overlay'))
      expect(onClose).toHaveBeenCalledTimes(3)
    })

    it('clears what was typed when closed', async () => {
      const user = userEvent.setup()
      const { rerender } = open()
      await user.type(domainField(), 'example.com')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      rerender(<AddSiteModal isOpen onClose={onClose} onSuccess={onSuccess} />)
      expect(domainField()).toHaveValue('')
    })
  })
})
