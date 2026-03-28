"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Users,
  ClipboardList,
  GitMerge,
  AlertTriangle,
  Inbox,
  Mail,
  Search,
  CalendarDays,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts"

// ─── Types ────────────────────────────────────────────────────────────────────

type VisitorRecord = {
  id: number
  name: string
  phone: string | null
  email: string | null
  created_at: string
}

type VisitLogRecord = {
  id: number
  visitor_id: number
  visitor_name: string
  timestamp: string
  decision: "ALLOW" | "DENY"
  confidence_score: number
}

type DuplicateRecord = {
  visitor1: VisitorRecord
  visitor2: VisitorRecord
  reasons: string[]
  scores: {
    name_score: number
    phone_score: number
    face_score?: number | null
    combined_score: number
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE_URL = "http://localhost:8002"
const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY

function buildAdminHeaders(): Record<string, string> {
  if (!ADMIN_API_KEY) return {}
  return { Authorization: `Bearer ${ADMIN_API_KEY}` }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const AVATAR_GRADIENTS = [
  "from-blue-500 to-violet-600",
  "from-orange-400 to-pink-500",
  "from-violet-500 to-indigo-600",
  "from-emerald-400 to-teal-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-500",
]

function getAvatarGradient(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_GRADIENTS.length
  return AVATAR_GRADIENTS[idx]
}

// ─── Chart data ───────────────────────────────────────────────────────────────

const sparkData = [
  { v: 820 }, { v: 932 }, { v: 901 }, { v: 934 }, { v: 1290 }, { v: 1330 }, { v: 1450 },
]
const activeData = [
  { v: 20 }, { v: 28 }, { v: 24 }, { v: 32 }, { v: 29 }, { v: 36 }, { v: 34 },
]
const barData = [
  { v: 60 }, { v: 80 }, { v: 55 }, { v: 90 }, { v: 75 }, { v: 100 }, { v: 85 }, { v: 110 }, { v: 95 }, { v: 120 },
]

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  badge,
  children,
}: {
  title: string
  value: string | number
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative flex flex-col">
      <div className="px-5 pt-5 pb-2 relative">
        {badge && <div className="absolute top-5 right-4">{badge}</div>}
        <p className="text-xs text-gray-500 font-medium mb-1">{title}</p>
        <p className="text-4xl font-bold text-gray-900">{value}</p>
      </div>
      <div className="h-24 w-full mt-2">{children}</div>
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3 py-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-4">
          <Skeleton className="h-12 w-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 mb-3">
        <Icon className="h-6 w-6 text-gray-500" />
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdminPanel() {
  const [visitors, setVisitors] = useState<VisitorRecord[]>([])
  const [logs, setLogs] = useState<VisitLogRecord[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [resendingVisitorId, setResendingVisitorId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState("visitors")
  const [hasFetched, setHasFetched] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "ALLOW" | "DENY">("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [showDatePicker, setShowDatePicker] = useState(false)

  // ── API calls ──────────────────────────────────────────────────────────────

  const fetchVisitors = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/admin/visitors`, {
        headers: buildAdminHeaders(),
      })
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => null)
        throw new Error(errorData?.detail ?? "Failed to authenticate request. Are your .env API keys set?")
      }
      setVisitors(await resp.json())
      setHasFetched((prev) => ({ ...prev, visitors: true }))
    } catch (e: any) {
      toast.error(e?.message || "Error fetching visitors")
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/admin/logs`, {
        headers: buildAdminHeaders(),
      })
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => null)
        throw new Error(errorData?.detail ?? "Failed to authenticate request")
      }
      setLogs(await resp.json())
      setHasFetched((prev) => ({ ...prev, logs: true }))
    } catch (e: any) {
      toast.error(e?.message || "Error fetching logs")
    } finally {
      setLoading(false)
    }
  }

  const fetchDuplicates = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/admin/duplicates`, {
        headers: buildAdminHeaders(),
      })
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => null)
        throw new Error(errorData?.detail ?? "Failed to authenticate request")
      }
      setDuplicates(await resp.json())
      setHasFetched((prev) => ({ ...prev, duplicates: true }))
    } catch (e: any) {
      toast.error(e?.message || "Error fetching duplicates")
    } finally {
      setLoading(false)
    }
  }

  const handleResendQrEmail = async (visitorId: number) => {
    setResendingVisitorId(visitorId)
    try {
      const response = await fetch(`${API_BASE_URL}/admin/visitors/${visitorId}/email-qr`, {
        method: "POST",
        headers: buildAdminHeaders(),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.detail ?? "Failed to send QR email.")
      }
      toast.success("QR email sent successfully.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send QR email.")
    } finally {
      setResendingVisitorId(null)
    }
  }

  const handleMerge = async (v1Id: number, v2Id: number) => {
    if (!confirm(`Merge profile ${v2Id} into ${v1Id}?`)) return
    try {
      const response = await fetch(`${API_BASE_URL}/admin/merge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAdminHeaders(),
        },
        body: JSON.stringify({ primary_visitor_id: v1Id, secondary_visitor_id: v2Id }),
      })
      if (!response.ok) throw new Error("Merge failed")
      toast.success("Merged successfully")
      fetchDuplicates()
    } catch {
      toast.error("Merge failed")
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    setSearchQuery("")
    setStatusFilter("all")
    setDateFrom("")
    setDateTo("")
    setShowDatePicker(false)
    if (value === "visitors") fetchVisitors()
    if (value === "logs") fetchLogs()
    if (value === "duplicates") fetchDuplicates()
  }

  useEffect(() => {
    // Fetch both on mount so stat cards are accurate immediately
    void fetchVisitors()
    void fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived stats ──────────────────────────────────────────────────────────

  const activeNow = logs.filter((l) => l.decision === "ALLOW").length
  const expectedToday = logs.filter((l) => {
    const d = new Date(l.timestamp)
    return d.toDateString() === new Date().toDateString()
  }).length

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredVisitors = visitors.filter((v) => {
    const matchesSearch = !searchQuery ||
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.email?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesDate = (!dateFrom || new Date(v.created_at) >= new Date(dateFrom)) &&
      (!dateTo || new Date(v.created_at) <= new Date(dateTo + "T23:59:59"))
    return matchesSearch && matchesDate
  })

  const filteredLogs = logs.filter((l) => {
    const matchesSearch = !searchQuery ||
      l.visitor_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || l.decision === statusFilter
    const matchesDate = (!dateFrom || new Date(l.timestamp) >= new Date(dateFrom)) &&
      (!dateTo || new Date(l.timestamp) <= new Date(dateTo + "T23:59:59"))
    return matchesSearch && matchesStatus && matchesDate
  })

  const cycleStatus = () => {
    setStatusFilter(s => s === "all" ? "ALLOW" : s === "ALLOW" ? "DENY" : "all")
  }
  const statusLabel = statusFilter === "all" ? "Status (All)" : statusFilter === "ALLOW" ? "Status: Checked-in" : "Status: Denied"
  const hasActiveFilters = statusFilter !== "all" || dateFrom || dateTo

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Total Visitors */}
        <StatCard
          title="Total Visitors"
          value={visitors.length || 0}
          badge={
            <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
              +12% this week
            </span>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1e3a8a" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="none"
                fill="url(#sparkFill)"
                fillOpacity={0.9}
                dot={false}
                isAnimationActive={false}
                baseLine={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </StatCard>

        {/* Active Now */}
        <StatCard
          title="Active Now"
          value={activeNow}
          badge={
            <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
              Live
            </span>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={activeData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="activeFill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1e3a8a" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="none"
                fill="url(#activeFill)"
                fillOpacity={0.9}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </StatCard>

        {/* Expected Today */}
        <StatCard title="Expected Today" value={expectedToday}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barSize={12}>
              <defs>
                <linearGradient id="barFill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1e3a8a" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              <Bar
                dataKey="v"
                fill="url(#barFill)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </StatCard>
      </div>

      {/* ── Search Bar ── */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          className="w-full pl-10 pr-4 h-11 rounded-xl border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300"
          placeholder="Search visitors, hosts, or companies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* ── Filter Buttons ── */}
      <div className="flex flex-wrap gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5 rounded-xl text-xs h-9", showDatePicker && "border-violet-400 bg-violet-50 text-violet-700")}
          onClick={() => setShowDatePicker(p => !p)}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Date Range
        </Button>
        {activeTab === "logs" && (
          <Button
            variant="outline"
            size="sm"
            className={cn("rounded-xl text-xs h-9", statusFilter !== "all" && "border-violet-400 bg-violet-50 text-violet-700 font-medium")}
            onClick={cycleStatus}
          >
            {statusLabel}
          </Button>
        )}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl text-xs h-9 text-gray-400 hover:text-gray-600"
            onClick={() => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); setShowDatePicker(false) }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* ── Date Range Inputs ── */}
      {showDatePicker && (
        <div className="flex gap-3 mb-3 p-3 bg-white rounded-xl border border-gray-200 shadow-sm animate-fade-in-up">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-medium text-gray-500 uppercase">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-medium text-gray-500 uppercase">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="visitors" className="gap-1.5">
            <Users className="h-4 w-4" />
            Visitors
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="duplicates" className="gap-1.5">
            <GitMerge className="h-4 w-4" />
            Duplicates
          </TabsTrigger>
        </TabsList>

        {/* ── Visitors Tab ── */}
        <TabsContent value="visitors" className="mt-0">
          {loading && activeTab === "visitors" ? (
            <LoadingSkeleton />
          ) : !hasFetched.visitors ? (
            <LoadingSkeleton />
          ) : filteredVisitors.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <EmptyState
                icon={Inbox}
                title={searchQuery ? "No results found" : "No visitors found"}
                subtitle={
                  searchQuery
                    ? "Try a different search term."
                    : "Visitors will appear here once they register."
                }
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 mb-3">
                <p className="text-xs font-medium text-gray-500">
                  All Visitors
                </p>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                  {filteredVisitors.length}
                </span>
              </div>
              {filteredVisitors.map((visitor, i) => (
                <div
                  key={visitor.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 animate-fade-in-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {/* Gradient avatar */}
                  <div
                    className={cn(
                      "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm flex-shrink-0",
                      getAvatarGradient(visitor.name)
                    )}
                  >
                    {getInitials(visitor.name)}
                  </div>

                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {visitor.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {visitor.email ?? "No email"}
                    </p>
                  </div>

                  {/* Status badge */}
                  <Badge className="bg-green-100 text-green-700 border-0 text-xs font-medium hover:bg-green-100">
                    Registered
                  </Badge>

                  {/* Joined date */}
                  <div className="hidden md:block text-right min-w-[100px]">
                    <p className="text-[10px] text-gray-500 font-medium">Joined</p>
                    <p className="text-xs font-medium text-gray-700">
                      {new Date(visitor.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-gray-700"
                          onClick={() => void handleResendQrEmail(visitor.id)}
                          disabled={
                            resendingVisitorId === visitor.id || !visitor.email
                          }
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {visitor.email ? "Resend QR Email" : "No email on file"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Logs Tab ── */}
        <TabsContent value="logs" className="mt-0">
          {loading && activeTab === "logs" ? (
            <LoadingSkeleton />
          ) : !hasFetched.logs ? (
            <LoadingSkeleton />
          ) : filteredLogs.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <EmptyState
                icon={Inbox}
                title={searchQuery ? "No results found" : "No logs found"}
                subtitle={
                  searchQuery
                    ? "Try a different search term."
                    : "Visit logs will appear here as visitors check in."
                }
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 mb-3">
                <p className="text-xs font-medium text-gray-500">Visit Logs</p>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                  {filteredLogs.length}
                </span>
              </div>
              {filteredLogs.map((log, i) => (
                <div
                  key={log.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 animate-fade-in-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {/* Gradient avatar */}
                  <div
                    className={cn(
                      "h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                      getAvatarGradient(log.visitor_name)
                    )}
                  >
                    <span className="text-white font-bold text-sm">
                      {getInitials(log.visitor_name)}
                    </span>
                  </div>

                  {/* Name + time */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {log.visitor_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>

                  {/* Decision badge */}
                  <Badge
                    className={cn(
                      "border-0 text-xs font-medium",
                      log.decision === "ALLOW"
                        ? "bg-green-100 text-green-700 hover:bg-green-100"
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                    )}
                  >
                    {log.decision === "ALLOW" ? "Checked-in" : "Denied"}
                  </Badge>

                  {/* Confidence */}
                  <div className="hidden md:block text-right min-w-[80px]">
                    <p className="text-[10px] text-gray-500 font-medium">Confidence</p>
                    <p className="text-xs font-medium text-gray-700">
                      {(log.confidence_score * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Duplicates Tab ── */}
        <TabsContent value="duplicates" className="mt-0">
          {loading && activeTab === "duplicates" ? (
            <LoadingSkeleton />
          ) : !hasFetched.duplicates ? (
            <LoadingSkeleton />
          ) : duplicates.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <EmptyState
                icon={Inbox}
                title="No duplicates found"
                subtitle="Potential duplicate profiles will be flagged here."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {duplicates.map((duplicate, index) => (
                <div
                  key={index}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in-up"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {/* Warning Header */}
                  <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="text-xs font-medium text-amber-700 truncate">
                        {duplicate.reasons.join(" / ")}
                      </span>
                    </div>
                    <Badge className="text-xs shrink-0 bg-amber-100 text-amber-700 border-0 hover:bg-amber-100">
                      {(duplicate.scores.combined_score * 100).toFixed(0)}% match
                    </Badge>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Side-by-side profiles */}
                    <div className="grid grid-cols-2 gap-3">
                      {[duplicate.visitor1, duplicate.visitor2].map((visitor) => (
                        <div
                          key={visitor.id}
                          className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className={cn(
                                "h-8 w-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-bold text-xs flex-shrink-0",
                                getAvatarGradient(visitor.name)
                              )}
                            >
                              {getInitials(visitor.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">
                                {visitor.name}
                              </p>
                              <p className="text-[10px] text-gray-500">
                                ID: {visitor.id}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-0.5 text-[11px] text-gray-600">
                            <p className="truncate">{visitor.phone ?? "No phone"}</p>
                            <p className="truncate">{visitor.email ?? "No email"}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Score Breakdown */}
                    <div>
                      <Separator className="mb-3" />
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">
                            Name
                          </p>
                          <p className="text-sm font-semibold text-gray-900">
                            {(duplicate.scores.name_score * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">
                            Phone
                          </p>
                          <p className="text-sm font-semibold text-gray-900">
                            {(duplicate.scores.phone_score * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">
                            Face
                          </p>
                          <p className="text-sm font-semibold text-gray-900">
                            {duplicate.scores.face_score == null
                              ? "N/A"
                              : `${(duplicate.scores.face_score * 100).toFixed(1)}%`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Merge Button */}
                    <Button
                      size="sm"
                      className="w-full gap-1.5 rounded-xl"
                      onClick={() =>
                        void handleMerge(
                          duplicate.visitor1.id,
                          duplicate.visitor2.id
                        )
                      }
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      Merge {duplicate.visitor2.id} into {duplicate.visitor1.id}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  )
}
