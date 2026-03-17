"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import jsQR from "jsqr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Camera, Mail, RotateCcw, ScanLine, ShieldCheck, ShieldX, X } from "lucide-react"

type VerificationStatus = "idle" | "pending" | "allowed" | "denied"
type AdminMode = "menu" | "qr" | "face" | "visitors" | "logs" | "duplicates"

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

type VerificationResult = {
  decision: "ALLOW" | "DENY"
  confidence_score: number
  message: string
  visitor_id?: number | null
  visitor_name?: string | null
}

const API_BASE_URL = "http://localhost:8000"
// Matches backend default for local development (see app/security.py).
const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "dev-admin-key"

function buildAdminHeaders(): Record<string, string> {
  if (!ADMIN_API_KEY) return {}
  return { Authorization: `Bearer ${ADMIN_API_KEY}` }
}

export function AdminPanel() {
  const [mode, setMode] = useState<AdminMode>("menu")
  const [status, setStatus] = useState<VerificationStatus>("idle")
  const [cameraActive, setCameraActive] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("")
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorRecord | null>(null)

  const [visitors, setVisitors] = useState<VisitorRecord[]>([])
  const [logs, setLogs] = useState<VisitLogRecord[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [resendingVisitorId, setResendingVisitorId] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanCanvasRef = useRef<HTMLCanvasElement>(null)
  const scanFrameRef = useRef<number | null>(null)
  const scanLockRef = useRef(false)

  const stopCamera = useCallback(() => {
    if (scanFrameRef.current !== null) {
      cancelAnimationFrame(scanFrameRef.current)
      scanFrameRef.current = null
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }

    setCameraActive(false)
    setVideoReady(false)
  }, [])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !cameraActive || !streamRef.current) {
      return
    }

    video.srcObject = streamRef.current
    void video.play().catch(() => {
      setStatusMessage("Camera stream is available but could not autoplay. Tap capture after the preview appears.")
    })
  }, [cameraActive, mode])

  const startCamera = useCallback(async (facingMode: "environment" | "user") => {
    stopCamera()
    setFacePhoto(null)
    setVideoReady(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      setCameraActive(true)
    } catch {
      setStatus("denied")
      setStatusMessage("Unable to access camera. Please allow camera permissions.")
    }
  }, [stopCamera])

  const fetchVisitor = useCallback(async (visitorId: number) => {
    const response = await fetch(`${API_BASE_URL}/visitors/${visitorId}`, {
      headers: {
        ...buildAdminHeaders(),
      },
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(data?.detail ?? "Unable to load visitor details.")
    }

    return data as VisitorRecord
  }, [])

  const fetchVisitors = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/admin/visitors`, {
        headers: {
          ...buildAdminHeaders(),
        },
      })
      setVisitors(await resp.json())
      setMode("visitors")
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/admin/logs`, {
        headers: {
          ...buildAdminHeaders(),
        },
      })
      setLogs(await resp.json())
      setMode("logs")
    } finally {
      setLoading(false)
    }
  }

  const fetchDuplicates = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/admin/duplicates`, {
        headers: {
          ...buildAdminHeaders(),
        },
      })
      setDuplicates(await resp.json())
      setMode("duplicates")
    } finally {
      setLoading(false)
    }
  }

  const handleResendQrEmail = async (visitorId: number) => {
    setResendingVisitorId(visitorId)
    try {
      const response = await fetch(`${API_BASE_URL}/admin/visitors/${visitorId}/email-qr`, {
        method: "POST",
        headers: {
          ...buildAdminHeaders(),
        },
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

  const handleQrDetected = useCallback(async (payload: string) => {
    setStatus("pending")
    setStatusMessage("QR detected. Validating token...")

    try {
      const response = await fetch(`${API_BASE_URL}/qr/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: payload }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.detail ?? "Unable to validate the scanned QR code.")
      }

      const visitor = data as VisitorRecord
      setSelectedVisitor(visitor)
      setResult(null)
      setStatus("idle")
      setStatusMessage(`QR matched ${visitor.name}. Capture a live face to complete check-in.`)
      setMode("face")
      await startCamera("user")
    } catch (error) {
      stopCamera()
      setStatus("denied")
      setStatusMessage(error instanceof Error ? error.message : "Unable to validate the scanned QR code.")
    } finally {
      scanLockRef.current = false
    }
  }, [startCamera, stopCamera])

  useEffect(() => {
    if (mode !== "qr" || !cameraActive || !videoReady) {
      return
    }

    const video = videoRef.current
    const canvas = scanCanvasRef.current
    const context = canvas?.getContext("2d", { willReadFrequently: true })
    if (!video || !canvas || !context) {
      return
    }

    let cancelled = false

    const scanFrame = () => {
      if (cancelled) {
        return
      }

      if (
        !scanLockRef.current &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const frame = context.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(frame.data, frame.width, frame.height)

        if (code?.data) {
          scanLockRef.current = true
          void handleQrDetected(code.data)
          return
        }
      }

      scanFrameRef.current = requestAnimationFrame(scanFrame)
    }

    scanFrameRef.current = requestAnimationFrame(scanFrame)

    return () => {
      cancelled = true
      if (scanFrameRef.current !== null) {
        cancelAnimationFrame(scanFrameRef.current)
        scanFrameRef.current = null
      }
    }
  }, [cameraActive, handleQrDetected, mode, videoReady])

  const handleQrScan = async () => {
    setMode("qr")
    setStatus("idle")
    setResult(null)
    setSelectedVisitor(null)
    setFacePhoto(null)
    setStatusMessage("Scanning for a QR code...")
    await startCamera("environment")
  }

  const handleFaceIdentify = async () => {
    setMode("face")
    setStatus("idle")
    setResult(null)
    setSelectedVisitor(null)
    setFacePhoto(null)
    setStatusMessage("Align the face in view, wait for the preview to be ready, then capture.")
    await startCamera("user")
  }

  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error("Camera preview is not ready yet. Wait for the live image, then try again.")
    }

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Unable to capture an image from the live preview.")
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.9)
  }, [])

  const captureForVerification = useCallback(async () => {
    try {
      const dataUrl = captureCurrentFrame()
      setFacePhoto(dataUrl)
      setResult(null)
      setStatus("pending")
      setStatusMessage(selectedVisitor ? `Verifying ${selectedVisitor.name} against the captured face...` : "Searching for the closest registered face match...")
      stopCamera()

      const imageResponse = await fetch(dataUrl)
      const blob = await imageResponse.blob()
      const formData = new FormData()
      formData.append("image", blob, "verify.jpg")

      const endpoint = selectedVisitor ? `${API_BASE_URL}/check-in` : `${API_BASE_URL}/identify`
      if (selectedVisitor) {
        formData.append("visitor_id", String(selectedVisitor.id))
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...buildAdminHeaders(),
        },
        body: formData,
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.detail ?? "Verification failed.")
      }

      const nextResult = data as VerificationResult
      setResult(nextResult)
      setStatus(nextResult.decision === "ALLOW" ? "allowed" : "denied")
      setStatusMessage(nextResult.message)

      if (!selectedVisitor && nextResult.visitor_id) {
        try {
          const visitor = await fetchVisitor(nextResult.visitor_id)
          setSelectedVisitor(visitor)
        } catch {
          setSelectedVisitor(null)
        }
      }
    } catch (error) {
      setResult(null)
      setStatus("denied")
      setStatusMessage(error instanceof Error ? error.message : "Verification failed.")
    }
  }, [captureCurrentFrame, fetchVisitor, selectedVisitor, stopCamera])

  const handleBack = () => {
    stopCamera()
    setMode("menu")
    setStatus("idle")
    setFacePhoto(null)
    setResult(null)
    setSelectedVisitor(null)
    setStatusMessage("")
  }

  const isBusy = loading || status === "pending"

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
                  : mode === "duplicates"
                    ? "Potential Duplicates"
                    : "Verification"}
          </CardTitle>
          {mode !== "menu" && (
            <Button variant="ghost" size="sm" onClick={handleBack}>Back</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        {mode === "menu" && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-24 flex-col gap-1.5" onClick={() => void handleQrScan()}>
              <ScanLine className="h-6 w-6" />
              <span className="text-xs">Scan QR</span>
            </Button>
            <Button variant="outline" className="h-24 flex-col gap-1.5" onClick={() => void handleFaceIdentify()}>
              <Camera className="h-6 w-6" />
              <span className="text-xs">Face ID</span>
            </Button>
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
                  <span className="font-bold">{log.visitor_name}</span>
                  <span className={log.decision === "ALLOW" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{log.decision}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</p>
                <p className="text-[10px]">Confidence: {(log.confidence_score * 100).toFixed(1)}%</p>
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
                  <div className="rounded bg-muted p-2">
                    <p className="font-bold">{duplicate.visitor1.name}</p>
                    <p>{duplicate.visitor1.phone ?? "No phone"}</p>
                    <p>{duplicate.visitor1.email ?? "No email"}</p>
                    <p>ID: {duplicate.visitor1.id}</p>
                  </div>
                  <div className="rounded bg-muted p-2">
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

        {(mode === "qr" || mode === "face") && (
          <div className="space-y-3">
            {selectedVisitor && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-semibold">{selectedVisitor.name}</p>
                <p className="text-xs text-muted-foreground">{selectedVisitor.phone ?? "No phone"}{selectedVisitor.email ? ` | ${selectedVisitor.email}` : ""}</p>
                <p className="mt-1 text-[10px]">Visitor ID: {selectedVisitor.id}</p>
              </div>
            )}

            {statusMessage && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{statusMessage}</p>
            )}

            {cameraActive && (
              <div className="relative overflow-hidden rounded-md bg-muted">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={() => setVideoReady(true)}
                  className={`w-full object-cover ${mode === "qr" ? "aspect-square" : "aspect-[3/4] scale-x-[-1]"}`}
                />
                {mode === "qr" && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-48 w-48 rounded-lg border-2 border-foreground/40" />
                    </div>
                    <p className="absolute bottom-3 left-0 right-0 mx-4 rounded bg-background/70 py-1 text-center text-xs text-muted-foreground">
                      Hold the visitor QR inside the frame
                    </p>
                  </>
                )}
                {mode === "face" && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                    <Button size="sm" variant="secondary" onClick={handleBack} className="h-10 w-10 rounded-full p-0" aria-label="Close camera">
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void captureForVerification()}
                      className="h-12 w-12 rounded-full p-0"
                      aria-label="Capture photo"
                      disabled={!videoReady || status === "pending"}
                    >
                      <Camera className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            <canvas ref={scanCanvasRef} className="hidden" />

            {facePhoto && !cameraActive && (
              <div className="overflow-hidden rounded-md">
                <img
                  src={facePhoto}
                  alt="Captured face for verification"
                  className="w-full aspect-[3/4] object-cover"
                />
              </div>
            )}

            {!cameraActive && status !== "idle" && (
              <ResponseDisplay
                status={status}
                result={result}
                selectedVisitor={selectedVisitor}
                onReset={handleBack}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ResponseDisplay({
  status,
  result,
  selectedVisitor,
  onReset,
}: {
  status: VerificationStatus
  result: VerificationResult | null
  selectedVisitor: VisitorRecord | null
  onReset: () => void
}) {
  return (
    <div className="space-y-3">
      {status === "pending" && (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">Verifying...</span>
        </div>
      )}

      {status === "allowed" && (
        <div className="flex flex-col items-center gap-2 py-6 text-emerald-600">
          <ShieldCheck className="h-12 w-12" />
          <span className="text-lg font-semibold">Access Allowed</span>
          {selectedVisitor && <span className="text-sm">{selectedVisitor.name}</span>}
          {result && <span className="text-xs text-center">Confidence: {(result.confidence_score * 100).toFixed(1)}%</span>}
        </div>
      )}

      {status === "denied" && (
        <div className="flex flex-col items-center gap-2 py-6 text-destructive">
          <ShieldX className="h-12 w-12" />
          <span className="text-lg font-semibold">Access Denied</span>
          {result && <span className="text-xs text-center">Confidence: {(result.confidence_score * 100).toFixed(1)}%</span>}
        </div>
      )}

      <Button variant="outline" className="w-full gap-1 bg-transparent" onClick={onReset}>
        <RotateCcw className="h-3 w-3" />
        Back to Menu
      </Button>
    </div>
  )
}

