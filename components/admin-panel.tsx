"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScanLine, Camera, X, RotateCcw, ShieldCheck, ShieldX } from "lucide-react"

type VerificationStatus = "idle" | "pending" | "allowed" | "denied"

export function AdminPanel() {
  const [mode, setMode] = useState<"menu" | "qr" | "face" | "visitors" | "logs" | "duplicates">("menu")
  const [status, setStatus] = useState<VerificationStatus>("idle")
  const [cameraActive, setCameraActive] = useState(false)
  const [facePhoto, setFacePhoto] = useState<string | null>(null)

  const [visitors, setVisitors] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [duplicates, setDuplicates] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const fetchVisitors = async () => {
    setLoading(true)
    try {
      const resp = await fetch("http://localhost:8000/admin/visitors")
      setVisitors(await resp.json())
      setMode("visitors")
    } finally {
      setLoading(false)
    }
  }

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const resp = await fetch("http://localhost:8000/admin/logs")
      setLogs(await resp.json())
      setMode("logs")
    } finally {
      setLoading(false)
    }
  }

  const fetchDuplicates = async () => {
    setLoading(true)
    try {
      const resp = await fetch("http://localhost:8000/admin/duplicates")
      setDuplicates(await resp.json())
      setMode("duplicates")
    } finally {
      setLoading(false)
    }
  }

  const handleMerge = async (v1Id: number, v2Id: number) => {
    if (!confirm(`Merge profile ${v2Id} into ${v1Id}?`)) return
    try {
      await fetch("http://localhost:8000/admin/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_visitor_id: v1Id, secondary_visitor_id: v2Id })
      })
      alert("Merged successfully")
      fetchDuplicates()
    } catch (e) {
      alert("Merge failed")
    }
  }

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

  const captureForVerification = useCallback(async () => {
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

      // Verification logic
      try {
        const visitorId = prompt("Enter Visitor ID:")
        if (!visitorId) {
          setStatus("idle")
          setFacePhoto(null)
          return
        }

        const res_photo = await fetch(dataUrl)
        const blob = await res_photo.blob()
        const formData = new FormData()
        formData.append("visitor_id", visitorId)
        formData.append("image", blob, "verify.jpg")

        const response = await fetch("http://localhost:8000/check-in", {
          method: "POST",
          body: formData
        })
        const data = await response.json()

        if (data.decision === "ALLOW") {
          setStatus("allowed")
        } else {
          setStatus("denied")
        }
      } catch (error) {
        console.error("Verification error:", error)
        setStatus("denied")
      }
    }
    stopCamera()
  }, [stopCamera])

  const simulateQrDetected = async () => {
    const visitorId = prompt("Enter Visitor ID:")
    if (!visitorId) return

    setStatus("pending")
    stopCamera()

    try {
      // For QR, we still need a face verify in this flow
      // but let's simulate a success if ID exists
      const resp = await fetch("http://localhost:8000/admin/visitors")
      const list = await resp.json()
      const found = list.find((v: any) => v.id === parseInt(visitorId))

      setTimeout(() => {
        setStatus(found ? "allowed" : "denied")
      }, 1000)
    } catch (e) {
      setStatus("denied")
    }
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
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-semibold text-foreground">
            {mode === "menu" ? "Admin Panel" : mode === "visitors" ? "Visitor List" : mode === "logs" ? "Visit Logs" : mode === "duplicates" ? "Potential Duplicates" : "Verification"}
          </CardTitle>
          {mode !== "menu" && (
            <Button variant="ghost" size="sm" onClick={handleBack}>Back</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-0 space-y-4">
        {/* Main Menu */}
        {mode === "menu" && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-24 flex flex-col gap-1.5" onClick={handleQrScan}>
              <ScanLine className="h-6 w-6" />
              <span className="text-xs">Scan QR</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col gap-1.5" onClick={handleFaceCapture}>
              <Camera className="h-6 w-6" />
              <span className="text-xs">Face ID</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col gap-1.5" onClick={fetchVisitors}>
              <RotateCcw className="h-6 w-6" />
              <span className="text-xs">Visitors</span>
            </Button>
            <Button variant="outline" className="h-24 flex flex-col gap-1.5" onClick={fetchLogs}>
              <RotateCcw className="h-6 w-6" />
              <span className="text-xs">Logs</span>
            </Button>
            <Button variant="outline" className="h-24 col-span-2 flex flex-col gap-1.5" onClick={fetchDuplicates}>
              <ShieldCheck className="h-6 w-6" />
              <span className="text-xs">Merge Duplicates (POC)</span>
            </Button>
          </div>
        )}

        {mode === "visitors" && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {visitors.map(v => (
              <div key={v.id} className="p-2 border rounded-md text-sm">
                <p className="font-bold">{v.name}</p>
                <p className="text-xs text-muted-foreground">{v.phone} | {v.email}</p>
                <p className="text-[10px] mt-1">ID: {v.id} | Joined: {new Date(v.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}

        {mode === "logs" && (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
            {logs.map(l => (
              <div key={l.id} className={`p-2 border rounded-md text-sm ${l.decision === 'ALLOW' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <div className="flex justify-between">
                  <span className="font-bold">{l.visitor_name}</span>
                  <span className={`font-bold ${l.decision === 'ALLOW' ? 'text-emerald-700' : 'text-red-700'}`}>{l.decision}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</p>
                <p className="text-[10px]">Confidence: {(l.confidence_score * 100).toFixed(1)}%</p>
              </div>
            ))}
          </div>
        )}

        {mode === "duplicates" && (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {duplicates.length === 0 && <p className="text-sm text-center py-4">No obvious duplicates found.</p>}
            {duplicates.map((d, i) => (
              <div key={i} className="p-3 border rounded-md space-y-2">
                <div className="flex justify-between text-xs font-bold text-amber-600">
                  <span>Potential Duplicate Found</span>
                  <span>Reason: {d.reason}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-1 bg-muted rounded">
                    <p className="font-bold">{d.visitor1.name}</p>
                    <p>{d.visitor1.phone}</p>
                    <p>ID: {d.visitor1.id}</p>
                  </div>
                  <div className="p-1 bg-muted rounded">
                    <p className="font-bold">{d.visitor2.name}</p>
                    <p>{d.visitor2.phone}</p>
                    <p>ID: {d.visitor2.id}</p>
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={() => handleMerge(d.visitor1.id, d.visitor2.id)}>
                  Merge {d.visitor2.id} into {d.visitor1.id}
                </Button>
              </div>
            ))}
          </div>
        )}

        {(mode === "qr" || mode === "face") && (
          <div className="space-y-3">
            {cameraActive && (
              <div className="relative rounded-md overflow-hidden bg-muted">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full object-cover ${mode === "qr" ? "aspect-square" : "aspect-[3/4]"}`}
                />
                {mode === "qr" && (
                  <>
                    {/* QR scan overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-48 h-48 border-2 border-foreground/40 rounded-lg" />
                    </div>
                    <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-muted-foreground bg-background/70 py-1 mx-4 rounded">
                      Point camera at QR code
                    </p>
                  </>
                )}
                {mode === "face" && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                    <Button size="sm" variant="secondary" onClick={handleBack} className="rounded-full h-10 w-10 p-0"><X className="h-4 w-4" /></Button>
                    <Button size="sm" onClick={captureForVerification} className="rounded-full h-12 w-12 p-0"><Camera className="h-5 w-5" /></Button>
                  </div>
                )}
              </div>
            )}
            {mode === "qr" && cameraActive && (
              <Button className="w-full" onClick={simulateQrDetected}>Simulate Scan</Button>
            )}
            {facePhoto && !cameraActive && (
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
