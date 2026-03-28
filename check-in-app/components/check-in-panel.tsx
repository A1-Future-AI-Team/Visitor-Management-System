"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import jsQR from "jsqr"
import { toast } from "sonner"
import { ArrowLeft, Camera, QrCode, RotateCcw, ScanLine, ShieldCheck, ShieldX, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

type VerificationStatus = "idle" | "pending" | "allowed" | "denied"
type CheckInMode = "menu" | "qr" | "face"

type VisitorRecord = {
  id: number
  name: string
  phone: string | null
  email: string | null
  created_at: string
}

type VerificationResult = {
  decision: "ALLOW" | "DENY"
  confidence_score: number
  message: string
  visitor_id?: number | null
  visitor_name?: string | null
}

const API_BASE_URL = "http://localhost:8001"
const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY

function buildAdminHeaders(): Record<string, string> {
  if (!ADMIN_API_KEY) return {}
  return { Authorization: `Bearer ${ADMIN_API_KEY}` }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function CheckInPanel() {
  const [mode, setMode] = useState<CheckInMode>("menu")
  const [status, setStatus] = useState<VerificationStatus>("idle")
  const [cameraActive, setCameraActive] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>("")
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorRecord | null>(null)

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
    return () => stopCamera()
  }, [stopCamera])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !cameraActive || !streamRef.current) return

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
      toast.error("Unable to access camera. Please allow camera permissions.")
    }
  }, [stopCamera])

  const fetchVisitor = useCallback(async (visitorId: number) => {
    const response = await fetch(`${API_BASE_URL}/visitors/${visitorId}`, {
      headers: buildAdminHeaders(),
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(data?.detail ?? "Unable to load visitor details.")
    }

    return data as VisitorRecord
  }, [])

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
      toast.success(`QR matched: ${visitor.name}`)
      await startCamera("user")
    } catch (error) {
      stopCamera()
      setStatus("denied")
      const msg = error instanceof Error ? error.message : "Unable to validate the scanned QR code."
      setStatusMessage(msg)
      toast.error(msg)
    } finally {
      scanLockRef.current = false
    }
  }, [startCamera, stopCamera])

  useEffect(() => {
    if (mode !== "qr" || !cameraActive || !videoReady) return

    const video = videoRef.current
    const canvas = scanCanvasRef.current
    const context = canvas?.getContext("2d", { willReadFrequently: true })
    if (!video || !canvas || !context) return

    let cancelled = false

    const scanFrame = () => {
      if (cancelled) return

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
    if (!context) throw new Error("Unable to capture an image from the live preview.")

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
        headers: buildAdminHeaders(),
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

      if (nextResult.decision === "ALLOW") {
        toast.success("Access granted")
      } else {
        toast.error("Access denied")
      }

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
      const msg = error instanceof Error ? error.message : "Verification failed."
      setStatusMessage(msg)
      toast.error(msg)
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

  return (
    <div className="space-y-5">
      {/* Header bar with back button */}
      {mode !== "menu" && (
        <div className="flex items-center gap-3 animate-fade-in-up">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="h-9 gap-1.5 rounded-lg px-3 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm font-medium text-foreground">
            {mode === "qr" ? "QR Scan" : "Face Verification"}
          </span>
        </div>
      )}

      {/* Mode selector menu */}
      {mode === "menu" && (
        <div className="grid grid-cols-2 gap-5 animate-fade-in-up">
          {/* QR Card */}
          <div
            className="p-[1.5px] rounded-3xl bg-gradient-to-br from-violet-400/80 via-indigo-300/60 to-purple-400/80 cursor-pointer"
            onClick={() => void handleQrScan()}
          >
            <div className="rounded-3xl bg-white/80 backdrop-blur-xl p-8 flex flex-col items-center text-center h-full min-h-[260px] justify-center gap-4 hover:bg-white/90 transition-colors">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-xl">
                <QrCode className="h-10 w-10 text-gray-800" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Scan QR Code</h3>
                <p className="text-sm text-gray-500 mt-1">Scan visitor&apos;s gate pass</p>
              </div>
            </div>
          </div>

          {/* Face Card */}
          <div
            className="p-[1.5px] rounded-3xl bg-gradient-to-br from-violet-400/80 via-indigo-300/60 to-purple-400/80 cursor-pointer"
            onClick={() => void handleFaceIdentify()}
          >
            <div className="rounded-3xl bg-white/80 backdrop-blur-xl p-8 flex flex-col items-center text-center h-full min-h-[260px] justify-center gap-4 hover:bg-white/90 transition-colors">
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Corner brackets */}
                <path d="M8,20 L8,8 L20,8" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M60,8 L72,8 L72,20" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8,60 L8,72 L20,72" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M60,72 L72,72 L72,60" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                {/* Face outline */}
                <ellipse cx="40" cy="35" rx="18" ry="22" stroke="#1e1b4b" strokeWidth="1.8"/>
                {/* Eyes */}
                <circle cx="33" cy="30" r="2.5" fill="#1e1b4b"/>
                <circle cx="47" cy="30" r="2.5" fill="#1e1b4b"/>
                {/* Nose */}
                <path d="M40,35 L38,42 L42,42" stroke="#1e1b4b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                {/* Scan line */}
                <line x1="4" y1="40" x2="76" y2="40" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Identify by Face</h3>
                <p className="text-sm text-gray-500 mt-1">Camera-based recognition</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active mode content */}
      {(mode === "qr" || mode === "face") && (
        <div className="space-y-4">
          {/* Visitor info card */}
          {selectedVisitor && (
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 shadow-sm animate-slide-in-right">
              <Avatar className="h-10 w-10 border border-border/50">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {getInitials(selectedVisitor.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{selectedVisitor.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedVisitor.email ?? selectedVisitor.phone ?? "No contact info"}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0 text-[10px] font-medium">
                ID {selectedVisitor.id}
              </Badge>
            </div>
          )}

          {/* Status message bar */}
          {statusMessage && (
            <div className="rounded-lg bg-white/70 border border-gray-200 px-4 py-2.5 animate-fade-in-up">
              <p className="text-xs text-gray-700 leading-relaxed">{statusMessage}</p>
            </div>
          )}

          {/* Camera viewport */}
          {cameraActive && (
            <div className={cn(mode === "qr" ? "max-w-xs mx-auto" : "max-w-md mx-auto")}>
            <div className={cn(
              "relative overflow-hidden rounded-xl bg-black shadow-lg animate-scale-in",
              mode === "qr" ? "aspect-square" : "aspect-[3/4]"
            )}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => setVideoReady(true)}
                className={cn(
                  "h-full w-full object-cover",
                  mode === "face" && "scale-x-[-1]"
                )}
              />

              {/* QR mode overlay: corner brackets */}
              {mode === "qr" && (
                <>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative h-44 w-44">
                      {/* Top-left corner */}
                      <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-white/80 rounded-tl" />
                      {/* Top-right corner */}
                      <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-white/80 rounded-tr" />
                      {/* Bottom-left corner */}
                      <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-white/80 rounded-bl" />
                      {/* Bottom-right corner */}
                      <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-white/80 rounded-br" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-4 pt-10">
                    <p className="text-center text-xs font-medium text-white">
                      Hold the visitor QR inside the frame
                    </p>
                  </div>
                </>
              )}

              {/* Face mode overlay: oval guide + controls */}
              {mode === "face" && (
                <>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="h-48 w-36 rounded-full border-2 border-white/30" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-5 pt-12">
                    <div className="flex items-center justify-center gap-5">
                      <button
                        onClick={handleBack}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                        aria-label="Close camera"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void captureForVerification()}
                        className={cn(
                          "flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg transition-all hover:scale-105 active:scale-95",
                          (!videoReady || status === "pending") && "opacity-40 pointer-events-none"
                        )}
                        aria-label="Capture photo"
                        disabled={!videoReady || status === "pending"}
                      >
                        <Camera className="h-6 w-6" />
                      </button>
                      <div className="h-10 w-10" /> {/* Spacer for centering */}
                    </div>
                  </div>
                </>
              )}
            </div>
            </div>
          )}

          <canvas ref={scanCanvasRef} className="hidden" />

          {/* Captured face photo */}
          {facePhoto && !cameraActive && (
            <div className="overflow-hidden rounded-xl shadow-sm animate-scale-in">
              <img
                src={facePhoto}
                alt="Captured face for verification"
                className="w-full aspect-[3/4] object-cover"
              />
            </div>
          )}

          {/* Result display */}
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
    </div>
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
    <div className="space-y-4 animate-fade-in-up">
      {/* Pending state */}
      {status === "pending" && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border/50 bg-card p-8 shadow-sm">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-muted-foreground">Verifying identity...</p>
        </div>
      )}

      {/* Access Granted */}
      {status === "allowed" && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <ShieldCheck className="h-9 w-9 text-success animate-check-bounce" />
          </div>
          <h3 className="text-lg font-bold text-success">Access Granted</h3>
          {selectedVisitor && (
            <p className="mt-1 text-sm text-foreground">{selectedVisitor.name}</p>
          )}
          {result && (
            <Badge variant="secondary" className="mt-3 text-xs">
              Confidence: {(result.confidence_score * 100).toFixed(1)}%
            </Badge>
          )}
        </div>
      )}

      {/* Access Denied */}
      {status === "denied" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-9 w-9 text-destructive" />
          </div>
          <h3 className="text-lg font-bold text-destructive">Access Denied</h3>
          {result && (
            <Badge variant="secondary" className="mt-3 text-xs">
              Confidence: {(result.confidence_score * 100).toFixed(1)}%
            </Badge>
          )}
        </div>
      )}

      {/* Reset button */}
      <Button
        variant="outline"
        className="w-full gap-2 rounded-xl border-border/50 bg-card shadow-sm hover:shadow-md transition-all duration-200"
        onClick={onReset}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Back to Menu
      </Button>
    </div>
  )
}
