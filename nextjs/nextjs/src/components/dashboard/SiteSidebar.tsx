'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { clsx } from 'clsx'
import { useSidebar } from './SidebarContext'
import { useSiteContext } from './SiteContext'

interface NavLinkItem {
  kind: 'link'
  label: string
  href: string
  icon: React.ReactNode
}

interface NavActionItem {
  kind: 'action'
  label: string
  onClick: () => void
  icon: React.ReactNode
}

type NavItem = NavLinkItem | NavActionItem

interface NavSection {
  title: string
  items: NavItem[]
}

export function SiteSidebar() {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebar()
  const { activeSite, onShareClick, onExportClick } = useSiteContext()

  if (!activeSite) return null

  const siteBase = `/dashboard/sites/${activeSite.id}`

  const navigation: NavSection[] = [
    {
      title: 'Analytics',
      items: [
        {
          kind: 'link',
          label: 'Overview',
          href: siteBase,
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Tools',
      items: [
        {
          kind: 'action',
          label: 'Share',
          onClick: () => onShareClick?.(),
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          ),
        },
        {
          kind: 'action',
          label: 'Export',
          onClick: () => onExportClick?.(),
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Configure',
      items: [
        {
          kind: 'link',
          label: 'Conversion Rules',
          href: `${siteBase}/conversion-rules`,
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
        },
        {
          kind: 'link',
          label: 'Page Values',
          href: `${siteBase}/page-values`,
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        },
        {
          kind: 'link',
          label: 'Settings',
          href: `${siteBase}/settings`,
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          ),
        },
      ],
    },
  ]

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 z-40 h-screen border-r bg-white dark:bg-gray-800 dark:border-gray-700 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
      role="complementary"
      aria-label="Site navigation sidebar"
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <Link
            href="/dashboard/sites"
            className={clsx(
              'flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded',
              collapsed && 'justify-center'
            )}
            title={collapsed ? 'Back to Sites' : undefined}
            aria-label="Back to Sites"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {!collapsed && <span>Back to Sites</span>}
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <svg
              className={clsx('w-5 h-5 transition-transform', collapsed && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        </header>

        {/* Site name */}
        {!collapsed && (
          <div className="px-4 py-3 border-b dark:border-gray-700">
            <p className="font-semibold text-sm truncate">{activeSite.name || activeSite.domain}</p>
            {activeSite.name && (
              <p className="text-xs text-muted-foreground truncate">{activeSite.domain}</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className={clsx('flex-1 space-y-6 overflow-y-auto', collapsed ? 'p-2' : 'p-4')} aria-label="Site navigation">
          {navigation.map((section) => (
            <div key={section.title} role="group" aria-labelledby={`site-nav-${section.title.toLowerCase()}`}>
              {!collapsed && (
                <h2
                  id={`site-nav-${section.title.toLowerCase()}`}
                  className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
                >
                  {section.title}
                </h2>
              )}
              {collapsed && (
                <span id={`site-nav-${section.title.toLowerCase()}`} className="sr-only">
                  {section.title}
                </span>
              )}
              <ul className="space-y-1" role="list">
                {section.items.map((item) => {
                  if (item.kind === 'link') {
                    const isActive = pathname === item.href
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={clsx(
                            'flex items-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                            collapsed ? 'justify-center p-2' : 'gap-3 px-4 py-2',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-foreground'
                          )}
                          title={collapsed ? item.label : undefined}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={collapsed ? item.label : undefined}
                        >
                          <span className="flex-shrink-0">{item.icon}</span>
                          {!collapsed && <span className="flex-1">{item.label}</span>}
                        </Link>
                      </li>
                    )
                  }

                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={item.onClick}
                        className={clsx(
                          'w-full flex items-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-foreground',
                          collapsed ? 'justify-center p-2' : 'gap-3 px-4 py-2'
                        )}
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                      >
                        <span className="flex-shrink-0">{item.icon}</span>
                        {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer with Clerk UserButton */}
        <footer className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className={clsx('flex items-center', collapsed ? 'justify-center' : 'gap-3 px-4')}>
            <UserButton
              afterSignOutUrl="https://ztas.io"
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8"
                }
              }}
            />
            {!collapsed && (
              <span className="text-sm text-muted-foreground">Account</span>
            )}
          </div>
        </footer>
      </div>
    </aside>
  )
}
