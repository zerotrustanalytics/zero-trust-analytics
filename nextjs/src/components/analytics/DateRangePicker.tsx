'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui'
import { clsx } from 'clsx'

export type DateRange = '24h' | '7d' | '30d' | '90d' | '365d' | 'custom'

interface DateRangePickerProps {
  value: DateRange
  onChange: (value: DateRange, customDates?: { start: Date; end: Date }) => void
  allowedRanges?: DateRange[]
}

const rangeLabels: Record<DateRange, string> = {
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  '365d': 'Last Year',
  custom: 'Custom Range',
}

const rangeShortLabels: Record<DateRange, string> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '365d': '1y',
  custom: 'Custom',
}

export function DateRangePicker({
  value,
  onChange,
  allowedRanges = ['24h', '7d', '30d', '90d', '365d'],
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRangeSelect = (range: DateRange) => {
    if (range === 'custom') {
      setIsOpen(true)
      return
    }
    onChange(range)
    setIsOpen(false)
  }

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onChange('custom', {
        start: new Date(customStart),
        end: new Date(customEnd),
      })
      setIsOpen(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Quick select buttons for common ranges */}
      <div className="hidden md:flex items-center gap-1 p-1 bg-secondary rounded-lg">
        {allowedRanges.slice(0, 5).map((range) => (
          <button
            key={range}
            onClick={() => handleRangeSelect(range)}
            className={clsx(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              value === range
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {rangeShortLabels[range]}
          </button>
        ))}
        {allowedRanges.includes('custom') && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={clsx(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              value === 'custom'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Mobile dropdown */}
      <div className="md:hidden">
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2"
        >
          {rangeLabels[value]}
          <svg
            className={clsx('w-4 h-4 transition-transform', isOpen && 'rotate-180')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-background border border-border rounded-lg shadow-lg z-10">
          <div className="p-2">
            <div className="md:hidden space-y-1">
              {allowedRanges
                .filter((r) => r !== 'custom')
                .map((range) => (
                  <button
                    key={range}
                    onClick={() => handleRangeSelect(range)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                      value === range
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-secondary'
                    )}
                  >
                    {rangeLabels[range]}
                  </button>
                ))}
              <div className="border-t border-border my-2" />
            </div>

            <p className="px-3 py-2 text-sm font-medium text-foreground">Custom Range</p>
            <div className="space-y-2 px-3 py-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Start Date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-input rounded-md bg-background"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-input rounded-md bg-background"
                />
              </div>
              <Button
                size="sm"
                fullWidth
                onClick={handleCustomApply}
                disabled={!customStart || !customEnd}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
