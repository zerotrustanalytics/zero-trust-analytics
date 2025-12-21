'use client'

import { Sidebar } from '@/components/dashboard'
import { useSessionTimeout } from '@/hooks'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

function SessionTimeoutWarning({
  showWarning,
  remainingSeconds,
  onExtend,
  onLogout,
}: {
  showWarning: boolean
  remainingSeconds: number
  onExtend: () => void
  onLogout: () => void
}) {
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60

  return (
    <Modal
      isOpen={showWarning}
      onClose={onExtend}
      title="Session Expiring Soon"
      description="Your session will expire due to inactivity."
      size="sm"
    >
      <div className="text-center py-4">
        <div className="text-4xl font-mono font-bold text-destructive mb-4">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        <p className="text-muted-foreground">
          Click &quot;Stay Logged In&quot; to extend your session.
        </p>
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onLogout}>
          Log Out
        </Button>
        <Button onClick={onExtend}>Stay Logged In</Button>
      </ModalFooter>
    </Modal>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { showWarning, remainingSeconds, resetTimer, forceLogout } =
    useSessionTimeout({
      timeout: 30 * 60 * 1000, // 30 minutes
      warningTime: 5 * 60 * 1000, // 5 minutes warning
    })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />

      {/* Main content - offset for sidebar */}
      <main className="md:ml-64 p-4 md:p-8 transition-all" role="main">
        {children}
      </main>

      {/* Session timeout warning modal */}
      <SessionTimeoutWarning
        showWarning={showWarning}
        remainingSeconds={remainingSeconds}
        onExtend={resetTimer}
        onLogout={forceLogout}
      />
    </div>
  )
}
