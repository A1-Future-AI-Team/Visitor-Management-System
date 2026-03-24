"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, RotateCcw, ShieldCheck } from "lucide-react"

type AdminMode = "menu" | "visitors" | "logs" | "duplicates"

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

const API_BASE_URL = "http://localhost:8002"
// Set NEXT_PUBLIC_ADMIN_API_KEY in .env.local to match the backend ADMIN_API_KEY.
const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY

function buildAdminHeaders(): Record<string, string> {
  if (!ADMIN_API_KEY) return {}
  return { Authorization: `Bearer ${ADMIN_API_KEY}` }
}

export function AdminPanel() {
  const [mode, setMode] = useState<AdminMode>("menu")
  
  const [visitors, setVisitors] = useState<VisitorRecord[]>([])
  const [logs, setLogs] = useState<VisitLogRecord[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [resendingVisitorId, setResendingVisitorId] = useState<number | null>(null)

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
      setMode("visitors")
    } catch (e: any) {
      alert(e?.message || "Error fetching visitors")
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
      setMode("logs")
    } catch (e: any) {
      alert(e?.message || "Error fetching logs")
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
      setMode("duplicates")
    } catch (e: any) {
      alert(e?.message || "Error fetching duplicates")
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
      alert("QR email sent successfully.")
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to send QR email.")
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

      if (!response.ok) {
        throw new Error("Merge failed")
      }

      alert("Merged successfully")
      fetchDuplicates()
    } catch {
      alert("Merge failed")
    }
  }

  const handleBack = () => setMode("menu")

  const isBusy = loading

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">
            {mode === "menu"
              ? "Admin Panel"
              : mode === "visitors"
                ? "Visitor List"
                : mode === "logs"
                  ? "Visit Logs"
                  : "Potential Duplicates"}
          </CardTitle>
          {mode !== "menu" && (
            <Button variant="ghost" size="sm" onClick={handleBack}>Back</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        {mode === "menu" && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-24 flex-col gap-1.5" onClick={fetchVisitors} disabled={isBusy}>
              <RotateCcw className="h-6 w-6" />
              <span className="text-xs">Visitors</span>
            </Button>
            <Button variant="outline" className="h-24 flex-col gap-1.5" onClick={fetchLogs} disabled={isBusy}>
              <RotateCcw className="h-6 w-6" />
              <span className="text-xs">Logs</span>
            </Button>
            <Button variant="outline" className="col-span-2 h-24 flex-col gap-1.5" onClick={fetchDuplicates} disabled={isBusy}>
              <ShieldCheck className="h-6 w-6" />
              <span className="text-xs">Merge Duplicates</span>
            </Button>
          </div>
        )}

        {mode === "visitors" && (
          <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
            {visitors.map((visitor) => (
              <div key={visitor.id} className="rounded-md border p-2 text-sm">
                <p className="font-bold">{visitor.name}</p>
                <p className="text-xs text-muted-foreground">{visitor.phone ?? "No phone"} | {visitor.email ?? "No email"}</p>
                <p className="mt-1 text-[10px]">ID: {visitor.id} | Joined: {new Date(visitor.created_at).toLocaleDateString()}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 gap-1 bg-transparent"
                  onClick={() => void handleResendQrEmail(visitor.id)}
                  disabled={resendingVisitorId === visitor.id || !visitor.email}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Resend QR Email
                </Button>
              </div>
            ))}
          </div>
        )}

        {mode === "logs" && (
          <div className="max-h-96 space-y-2 overflow-y-auto pr-2">
            {logs.map((log) => (
              <div key={log.id} className={`rounded-md border p-2 text-sm ${log.decision === "ALLOW" ? "bg-emerald-50" : "bg-red-50"}`}>
                <div className="flex justify-between">
                  <span className="font-bold text-black">{log.visitor_name}</span>
                  <span className={log.decision === "ALLOW" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{log.decision}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</p>
                <p className="text-[10px] text-black">Confidence: {(log.confidence_score * 100).toFixed(1)}%</p>
              </div>
            ))}
          </div>
        )}

        {mode === "duplicates" && (
          <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
            {duplicates.length === 0 && <p className="py-4 text-center text-sm">No duplicate suggestions found.</p>}
            {duplicates.map((duplicate, index) => (
              <div key={index} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-700">
                  <span>{duplicate.reasons.join(" | ")}</span>
                  <span>Combined score: {(duplicate.scores.combined_score * 100).toFixed(1)}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-muted p-2 text-black">
                    <p className="font-bold">{duplicate.visitor1.name}</p>
                    <p>{duplicate.visitor1.phone ?? "No phone"}</p>
                    <p>{duplicate.visitor1.email ?? "No email"}</p>
                    <p>ID: {duplicate.visitor1.id}</p>
                  </div>
                  <div className="rounded bg-muted p-2 text-black">
                    <p className="font-bold">{duplicate.visitor2.name}</p>
                    <p>{duplicate.visitor2.phone ?? "No phone"}</p>
                    <p>{duplicate.visitor2.email ?? "No email"}</p>
                    <p>ID: {duplicate.visitor2.id}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                  <p>Name: {(duplicate.scores.name_score * 100).toFixed(1)}%</p>
                  <p>Phone: {(duplicate.scores.phone_score * 100).toFixed(1)}%</p>
                  <p>Face: {duplicate.scores.face_score == null ? "N/A" : `${(duplicate.scores.face_score * 100).toFixed(1)}%`}</p>
                </div>
                <Button size="sm" className="w-full" onClick={() => void handleMerge(duplicate.visitor1.id, duplicate.visitor2.id)}>
                  Merge {duplicate.visitor2.id} into {duplicate.visitor1.id}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
