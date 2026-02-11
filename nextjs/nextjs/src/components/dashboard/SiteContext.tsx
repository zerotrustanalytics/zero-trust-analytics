'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface ActiveSite {
  id: string
  name?: string
  domain: string
}

interface SiteContextType {
  activeSite: ActiveSite | null
  setActiveSite: (site: ActiveSite | null) => void
  onShareClick: (() => void) | null
  setOnShareClick: (cb: (() => void) | null) => void
  onExportClick: (() => void) | null
  setOnExportClick: (cb: (() => void) | null) => void
}

const SiteContext = createContext<SiteContextType | undefined>(undefined)

export function SiteProvider({ children }: { children: ReactNode }) {
  const [activeSite, setActiveSite] = useState<ActiveSite | null>(null)
  const [onShareClick, setOnShareClickRaw] = useState<(() => void) | null>(null)
  const [onExportClick, setOnExportClickRaw] = useState<(() => void) | null>(null)

  // Wrap setters to accept function values without React treating them as updater functions
  const setOnShareClick = useCallback((cb: (() => void) | null) => {
    setOnShareClickRaw(() => cb)
  }, [])

  const setOnExportClick = useCallback((cb: (() => void) | null) => {
    setOnExportClickRaw(() => cb)
  }, [])

  return (
    <SiteContext.Provider value={{ activeSite, setActiveSite, onShareClick, setOnShareClick, onExportClick, setOnExportClick }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSiteContext() {
  const context = useContext(SiteContext)
  if (context === undefined) {
    throw new Error('useSiteContext must be used within a SiteProvider')
  }
  return context
}
