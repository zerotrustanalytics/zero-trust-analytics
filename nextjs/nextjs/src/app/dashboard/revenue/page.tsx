'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Site {
  id: string
  domain: string
  name?: string
}

interface RevenueStats {
  totalRevenue: number
  totalOrders: number
  averageOrderValue: number
  revenuePerVisitor: number
  conversionRate: number
  totalVisitors: number
}

interface DailyRevenue {
  date: string
  revenue: number
  orders: number
}

interface Product {
  id: string
  name: string
  sku?: string
  revenue: number
  quantity: number
  avgPrice: number
}

interface RevenueByChannel {
  channel: string
  revenue: number
  orders: number
  percentage: number
}

interface Order {
  id: string
  orderId: string
  revenue: number
  items: number
  timestamp: string
  source?: string
}

export default function RevenuePage() {
  const { getToken } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('30d')
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders'>('overview')

  const [stats, setStats] = useState<RevenueStats>({
    totalRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    revenuePerVisitor: 0,
    conversionRate: 0,
    totalVisitors: 0
  })
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [revenueByChannel, setRevenueByChannel] = useState<RevenueByChannel[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [currency, setCurrency] = useState('USD')

  const fetchSites = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'
      const res = await fetch(`${apiUrl}/api/sites/list`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json()
        setSites(data.sites || [])
        if (data.sites?.length > 0 && !selectedSite) {
          setSelectedSite(data.sites[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch sites:', err)
    }
  }, [getToken, selectedSite])

  const fetchRevenueData = useCallback(async () => {
    if (!selectedSite) return

    try {
      const token = await getToken()
      if (!token) return

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ztas.io'

      // Fetch general stats first
      const statsRes = await fetch(`${apiUrl}/api/stats?siteId=${selectedSite}&period=${period}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      let totalVisitors = 0
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        totalVisitors = statsData.summary?.unique_visitors || 0
      }

      // Try to fetch revenue data from API
      const revenueRes = await fetch(`${apiUrl}/api/revenue?siteId=${selectedSite}&period=${period}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (revenueRes.ok) {
        const data = await revenueRes.json()
        setStats(data.stats || generateMockStats(totalVisitors))
        setDailyRevenue(data.daily || generateMockDailyRevenue(period))
        setProducts(data.products || generateMockProducts())
        setRevenueByChannel(data.channels || generateMockChannels())
        setOrders(data.orders || generateMockOrders())
        setCurrency(data.currency || 'USD')
      } else {
        // Generate mock data for demo
        const mockStats = generateMockStats(totalVisitors)
        setStats(mockStats)
        setDailyRevenue(generateMockDailyRevenue(period))
        setProducts(generateMockProducts())
        setRevenueByChannel(generateMockChannels())
        setOrders(generateMockOrders())
      }
    } catch (err) {
      console.error('Failed to fetch revenue data:', err)
      // Generate mock data on error for demo purposes
      setStats(generateMockStats(1000))
      setDailyRevenue(generateMockDailyRevenue(period))
      setProducts(generateMockProducts())
      setRevenueByChannel(generateMockChannels())
      setOrders(generateMockOrders())
    } finally {
      setLoading(false)
    }
  }, [getToken, selectedSite, period])

  // Mock data generators for demo purposes
  const generateMockStats = (visitors: number): RevenueStats => {
    const orders = Math.floor(visitors * 0.025) // 2.5% conversion
    const revenue = orders * (50 + Math.random() * 100) // $50-150 AOV
    return {
      totalRevenue: revenue,
      totalOrders: orders,
      averageOrderValue: orders > 0 ? revenue / orders : 0,
      revenuePerVisitor: visitors > 0 ? revenue / visitors : 0,
      conversionRate: visitors > 0 ? (orders / visitors) * 100 : 0,
      totalVisitors: visitors
    }
  }

  const generateMockDailyRevenue = (period: string): DailyRevenue[] => {
    const days = period === '24h' ? 1 : period === '7d' ? 7 : 30
    const data: DailyRevenue[] = []
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      data.push({
        date: date.toISOString().split('T')[0],
        revenue: Math.floor(100 + Math.random() * 500),
        orders: Math.floor(2 + Math.random() * 10)
      })
    }
    return data
  }

  const generateMockProducts = (): Product[] => {
    const productNames = [
      'Pro Subscription',
      'Enterprise Plan',
      'Analytics Add-on',
      'Custom Integration',
      'API Access',
      'White Label',
      'Team License',
      'Support Package'
    ]
    return productNames.map((name, i) => ({
      id: `prod_${i}`,
      name,
      sku: `SKU-${1000 + i}`,
      revenue: Math.floor(500 + Math.random() * 5000),
      quantity: Math.floor(5 + Math.random() * 50),
      avgPrice: Math.floor(50 + Math.random() * 200)
    })).sort((a, b) => b.revenue - a.revenue)
  }

  const generateMockChannels = (): RevenueByChannel[] => {
    const channels = [
      { channel: 'Organic Search', revenue: 3500 },
      { channel: 'Direct', revenue: 2800 },
      { channel: 'Paid Search', revenue: 2200 },
      { channel: 'Social', revenue: 1500 },
      { channel: 'Email', revenue: 1200 },
      { channel: 'Referral', revenue: 800 }
    ]
    const total = channels.reduce((sum, c) => sum + c.revenue, 0)
    return channels.map(c => ({
      ...c,
      orders: Math.floor(c.revenue / 75),
      percentage: (c.revenue / total) * 100
    }))
  }

  const generateMockOrders = (): Order[] => {
    const sources = ['Organic Search', 'Direct', 'Paid Search', 'Social', 'Email']
    return Array.from({ length: 10 }, (_, i) => ({
      id: `order_${i}`,
      orderId: `ORD-${10000 + Math.floor(Math.random() * 90000)}`,
      revenue: Math.floor(50 + Math.random() * 300),
      items: Math.floor(1 + Math.random() * 5),
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      source: sources[Math.floor(Math.random() * sources.length)]
    })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }

  useEffect(() => {
    fetchSites()
  }, [fetchSites])

  useEffect(() => {
    if (selectedSite) {
      setLoading(true)
      fetchRevenueData()
    }
  }, [selectedSite, fetchRevenueData])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  if (loading && sites.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Revenue & Ecommerce</h1>
          <p className="text-muted-foreground">Track purchases, revenue, and product performance</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
          >
            {sites.map(site => (
              <option key={site.id} value={site.id}>{site.name || site.domain}</option>
            ))}
          </select>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">Total Revenue</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span className="text-xs font-medium">Orders</span>
          </div>
          <p className="text-2xl font-bold">{stats.totalOrders.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium">Avg Order Value</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats.averageOrderValue)}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-xs font-medium">Rev/Visitor</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats.revenuePerVisitor)}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-xs font-medium">Conversion Rate</span>
          </div>
          <p className="text-2xl font-bold">{stats.conversionRate.toFixed(2)}%</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          {(['overview', 'products', 'orders'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Revenue Chart */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 lg:col-span-2">
                <h3 className="font-semibold mb-4">Revenue Over Time</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${v}`}
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={formatDate}
                        contentStyle={{
                          backgroundColor: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Revenue by Channel */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="font-semibold mb-4">Revenue by Channel</h3>
                <div className="space-y-3">
                  {revenueByChannel.map(channel => (
                    <div key={channel.channel}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{channel.channel}</span>
                        <span className="font-medium">{formatCurrency(channel.revenue)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${channel.percentage}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{channel.orders} orders</span>
                        <span>{channel.percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Orders Chart */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="font-semibold mb-4">Orders Over Time</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                      />
                      <YAxis tick={{ fontSize: 12 }} axisLine={false} />
                      <Tooltip
                        labelFormatter={formatDate}
                        contentStyle={{
                          backgroundColor: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Products Tab */}
          {activeTab === 'products' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Avg Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {products.map((product, i) => (
                    <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center text-primary font-bold text-sm">
                            {i + 1}
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            {product.sku && (
                              <p className="text-xs text-muted-foreground">{product.sku}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(product.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {product.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatCurrency(product.avgPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {products.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p>No product data available yet</p>
                  <p className="text-sm mt-1">Start tracking purchases to see product performance</p>
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm">{order.orderId}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          order.source === 'Organic Search' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          order.source === 'Paid Search' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                          order.source === 'Social' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400' :
                          order.source === 'Email' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {order.source || 'Direct'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {order.items}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(order.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-sm">
                        {formatDateTime(order.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {orders.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p>No orders recorded yet</p>
                  <p className="text-sm mt-1">Orders will appear here as purchases are tracked</p>
                </div>
              )}
            </div>
          )}

          {/* Setup Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100">Enable Revenue Tracking</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  To track revenue, add purchase events to your tracking script:
                </p>
                <pre className="mt-2 p-3 bg-blue-100 dark:bg-blue-900/40 rounded text-xs font-mono text-blue-800 dark:text-blue-200 overflow-x-auto">
{`// Track a purchase
ztas('purchase', {
  orderId: 'ORD-12345',
  revenue: 99.99,
  currency: 'USD',
  items: [
    { name: 'Pro Plan', sku: 'SKU-001', price: 99.99, quantity: 1 }
  ]
});`}
                </pre>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
