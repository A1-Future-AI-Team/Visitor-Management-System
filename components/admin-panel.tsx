"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScanLine, Camera, X, RotateCcw, ShieldCheck, ShieldX } from "lucide-react"

type VerificationStatus = "idle" | "pending" | "allowed" | "denied"

export function AdminPanel() {
  const [mode, setMode] = useState<"menu" | "qr" | "face">("menu")
  const [status, setStatus] = useState<VerificationStatus>("idle")
  const [cameraActive, setCameraActive] = useState(false)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startCamera = useCallback(async (facingMode: "environment" | "user") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)
    } catch {
      alert("Unable to access camera. Please allow camera permissions.")
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setCameraActive(false)
  }, [])

  const handleQrScan = () => {
    setMode("qr")
    setStatus("idle")
    setFacePhoto(null)
    startCamera("environment")
  }

  const handleFaceCapture = () => {
    setMode("face")
    setStatus("idle")
    setFacePhoto(null)
    startCamera("user")
  }

  const captureForVerification = useCallback(() => {
    if (!videoRef.current) return
    const canvas = document.createElement("canvas")
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0)
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8)
      setFacePhoto(dataUrl)
      setStatus("pending")
      // TODO: POST dataUrl to backend for verification
      // Simulating backend response for UI demo
      setTimeout(() => {
        setStatus(Math.random() > 0.5 ? "allowed" : "denied")
      }, 2000)
    }
    stopCamera()
  }, [stopCamera])

  const simulateQrDetected = () => {
    setStatus("pending")
    stopCamera()
    // TODO: send QR data to backend
    setTimeout(() => {
      setStatus(Math.random() > 0.5 ? "allowed" : "denied")
    }, 2000)
  }

  const handleBack = () => {
    stopCamera()
    setMode("menu")
    setStatus("idle")
    setFacePhoto(null)
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-lg font-semibold text-foreground">
          Admin Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 space-y-4">
        {/* Main Menu */}
        {mode === "menu" && (
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col gap-1.5 bg-transparent"
              onClick={handleQrScan}
            >
              <ScanLine className="h-6 w-6" />
              <span className="text-sm font-medium">Scan QR Code</span>
            </Button>
            <Button
              variant="outline"
              className="w-full h-20 flex flex-col gap-1.5 bg-transparent"
              onClick={handleFaceCapture}
            >
              <Camera className="h-6 w-6" />
              <span className="text-sm font-medium">Live Face Capture</span>
            </Button>
          </div>
        )}

        {/* QR Scanner */}
        {mode === "qr" && (
          <div className="space-y-3">
            {cameraActive && (
              <div className="relative rounded-md overflow-hidden bg-muted">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-square object-cover"
                />
                {/* QR scan overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-foreground/40 rounded-lg" />
                </div>
                <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-muted-foreground bg-background/70 py-1 mx-4 rounded">
                  Point camera at QR code
                </p>
              </div>
            )}

            {cameraActive && (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={handleBack}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button className="flex-1" onClick={simulateQrDetected}>
                  <ScanLine className="h-4 w-4 mr-1" />
                  Simulate Scan
                </Button>
              </div>
            )}

            {/* Response display */}
            {!cameraActive && status !== "idle" && (
              <ResponseDisplay status={status} onReset={handleBack} />
            )}
          </div>
        )}

        {/* Face Capture */}
        {mode === "face" && (
          <div className="space-y-3">
            {cameraActive && (
              <div className="relative rounded-md overflow-hidden bg-muted">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-[3/4] object-cover"
                />
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleBack}
                    className="rounded-full h-10 w-10 p-0"
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={captureForVerification}
                    className="rounded-full h-12 w-12 p-0"
                    aria-label="Capture face"
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}

            {facePhoto && (
              <div className="rounded-md overflow-hidden">
                <img
                  src={facePhoto || "/placeholder.svg"}
                  alt="Captured face for verification"
                  className="w-full aspect-[3/4] object-cover"
                />
              </div>
            )}

            {!cameraActive && status !== "idle" && (
              <ResponseDisplay status={status} onReset={handleBack} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ResponseDisplay({
  status,
  onReset,
}: {
  status: VerificationStatus
  onReset: () => void
}) {
  return (
    <div className="space-y-3">
      {status === "pending" && (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Verifying...</span>
        </div>
      )}

      {status === "allowed" && (
        <div className="flex flex-col items-center py-6 gap-2 text-emerald-600">
          <ShieldCheck className="h-12 w-12" />
          <span className="text-lg font-semibold">Access Allowed</span>
        </div>
      )}

      {status === "denied" && (
        <div className="flex flex-col items-center py-6 gap-2 text-destructive">
          <ShieldX className="h-12 w-12" />
          <span className="text-lg font-semibold">Access Denied</span>
        </div>
      )}

      <Button variant="outline" className="w-full gap-1 bg-transparent" onClick={onReset}>
        <RotateCcw className="h-3 w-3" />
        Back to Menu
      </Button>
    </div>
  )
}
