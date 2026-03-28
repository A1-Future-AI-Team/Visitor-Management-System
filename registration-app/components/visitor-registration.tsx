"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  RotateCcw,
  User,
  X,
  ShieldCheck,
  UserCheck,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const API_BASE_URL = "http://localhost:8000"

// 30-minute slots 08:00–18:00
const TIME_SLOTS = Array.from({ length: 21 }, (_, i) => {
  const m = 8 * 60 + i * 30
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
})

type Page = "info" | "photo" | "visit" | "done"
type DoneReason = "visit-submitted" | "skip"

interface LocationItem { id: number; name: string; city: string | null }
interface HostItem { id: number; name: string; department: string | null }

// ─── Step dot bar ─────────────────────────────────────────────────────────────
// Steps: 1=Details, 2=Verify, 3=Photo, 4=Your Visit, 5=Complete
const STEP_LABELS = ["DETAILS", "VERIFY", "PHOTO", "YOUR\nVISIT", "COMPLETE"]

function StepDotBar({ currentDot }: { currentDot: number }) {
  return (
    <div className="relative pt-4 pb-1">
      <div className="absolute top-[22px] left-0 right-0 h-0.5 bg-gray-200" />
      <div
        className="absolute top-[22px] left-0 h-0.5 bg-indigo-500 transition-all duration-500"
        style={{ width: `${((currentDot - 1) / 4) * 100}%` }}
      />
      <div className="relative flex justify-between">
        {STEP_LABELS.map((label, i) => {
          const dot = i + 1
          const active = currentDot === dot
          const done = currentDot > dot
          return (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className={cn(
                "w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center",
                done  && "bg-indigo-500 border-indigo-500",
                active && "bg-indigo-500 border-indigo-500 ring-4 ring-indigo-100",
                !done && !active && "bg-white border-gray-300",
              )}>
                {done && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p className={cn(
                "text-[10px] uppercase font-semibold text-center leading-tight whitespace-pre-line tracking-wide",
                active ? "text-indigo-600" : done ? "text-indigo-400" : "text-gray-400",
              )}>
                {`${dot}\n${label}`}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const OUTER = "p-[1.5px] rounded-3xl bg-gradient-to-br from-violet-400/70 via-indigo-300/50 to-purple-400/70 shadow-2xl shadow-indigo-200/50"
const INNER = "rounded-3xl bg-white/80 backdrop-blur-xl p-8"

// ─── Main component ───────────────────────────────────────────────────────────
export function VisitorRegistration() {
  // ── Page / navigation ──────────────────────────────────────────────────────
  const [page, setPage] = useState<Page>("info")
  const [doneReason, setDoneReason] = useState<DoneReason>("skip")

  // ── Step 1 — Personal info ─────────────────────────────────────────────────
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otpVerified, setOtpVerified] = useState(false)
  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  const [existingVisitorId, setExistingVisitorId] = useState<number | null>(null)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)

  // ── Step 2 — Photo ────────────────────────────────────────────────────────
  const [cameraOpen, setCameraOpen] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [cameraMessage, setCameraMessage] = useState("")
  const [registering, setRegistering] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // ── Step 3 — Visit request ────────────────────────────────────────────────
  const [registeredVisitorId, setRegisteredVisitorId] = useState<number | null>(null)
  const [isReturningVisitor, setIsReturningVisitor] = useState(false)
  const [locations, setLocations] = useState<LocationItem[]>([])
  const [hosts, setHosts] = useState<HostItem[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [selectedHostId, setSelectedHostId] = useState<number | null>(null)
  const [visitDate, setVisitDate] = useState("")
  const [visitTime, setVisitTime] = useState("")
  const [visitPurpose, setVisitPurpose] = useState("")
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [loadingHosts, setLoadingHosts] = useState(false)
  const [submittingVisit, setSubmittingVisit] = useState(false)
  const [confirmedHostName, setConfirmedHostName] = useState("")
  const [confirmedLocationName, setConfirmedLocationName] = useState("")

  // ── Derived ────────────────────────────────────────────────────────────────
  const tomorrowDate = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return d.toISOString().split("T")[0]
  }, [])

  const currentDot = useMemo(() => {
    if (page === "done")  return 5
    if (page === "visit") return 4
    if (page === "photo") return 3
    return otpVerified ? 2 : 1
  }, [page, otpVerified])

  // ── Camera helpers ─────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null }
    setCameraOpen(false); setVideoReady(false)
  }, [])

  useEffect(() => () => { stopCamera() }, [stopCamera])

  useEffect(() => {
    if (!videoRef.current || !cameraOpen || !streamRef.current) return
    videoRef.current.srcObject = streamRef.current
    void videoRef.current.play().catch(() =>
      setCameraMessage("Camera is ready but could not autoplay. Wait for the preview, then capture.")
    )
  }, [cameraOpen])

  const openCamera = useCallback(async () => {
    stopCamera(); setPhoto(null); setCameraMessage("Starting live preview…")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream; setCameraOpen(true)
    } catch {
      toast.error("Unable to access camera. Please allow camera permissions.")
    }
  }, [stopCamera])

  const capturePhoto = useCallback(() => {
    const v = videoRef.current
    if (!v || v.videoWidth === 0) { toast.error("Camera not ready yet."); return }
    const c = document.createElement("canvas")
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext("2d")?.drawImage(v, 0, 0)
    setPhoto(c.toDataURL("image/jpeg", 0.9)); stopCamera()
  }, [stopCamera])

  // ── Fetch locations when entering visit page ──────────────────────────────
  useEffect(() => {
    if (page !== "visit") return
    setLoadingLocations(true)
    fetch(`${API_BASE_URL}/locations`)
      .then(r => r.json()).then(d => setLocations(d as LocationItem[]))
      .catch(() => toast.error("Could not load office locations."))
      .finally(() => setLoadingLocations(false))
  }, [page])

  useEffect(() => {
    if (!selectedLocationId) { setHosts([]); return }
    setLoadingHosts(true); setSelectedHostId(null)
    fetch(`${API_BASE_URL}/hosts?location_id=${selectedLocationId}`)
      .then(r => r.json()).then(d => setHosts(d as HostItem[]))
      .catch(() => toast.error("Could not load hosts."))
      .finally(() => setLoadingHosts(false))
  }, [selectedLocationId])

  // ── OTP ───────────────────────────────────────────────────────────────────
  const resetOtp = useCallback(() => {
    setOtp(""); setOtpSent(false); setOtpVerified(false)
    setVerificationToken(null); setExistingVisitorId(null)
  }, [])

  const handleSendOtp = async () => {
    if (!email.trim()) return
    setSendingOtp(true); resetOtp()
    try {
      const r = await fetch(`${API_BASE_URL}/otp/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.detail ?? "Failed to send OTP.")
      setOtpSent(true); toast.success("Verification code sent to your email.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send OTP. Is the backend running?")
    } finally { setSendingOtp(false) }
  }

  const handleVerifyOtp = async () => {
    if (!otpSent || otp.length !== 6) return
    setVerifyingOtp(true)
    try {
      const r = await fetch(`${API_BASE_URL}/otp/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.detail ?? "OTP verification failed.")
      setOtpVerified(true)
      setVerificationToken(d.verification_token)
      setExistingVisitorId(d.existing_visitor_id ?? null)
      toast.success(d.existing_visitor_id
        ? "Welcome back! Your profile was found."
        : "Email verified successfully.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OTP verification failed.")
    } finally { setVerifyingOtp(false) }
  }

  // "Continue" from step 1 — routing depends on visitor status
  const handleContinueFromInfo = () => {
    if (!otpVerified) return
    if (existingVisitorId !== null) {
      // Returning visitor — jump straight to visit request
      setRegisteredVisitorId(existingVisitorId)
      setIsReturningVisitor(true)
      setPage("visit")
    } else {
      setPage("photo")
    }
  }

  // ── Registration (new visitors) ───────────────────────────────────────────
  const handleRegister = async () => {
    if (!photo || !verificationToken) return
    setRegistering(true)
    try {
      const blob = await (await fetch(photo)).blob()
      const fd = new FormData()
      fd.append("name", name.trim())
      fd.append("email", email.trim().toLowerCase())
      fd.append("phone", phone.trim())
      fd.append("verification_token", verificationToken)
      fd.append("image", blob, "visitor_photo.jpg")
      const r = await fetch(`${API_BASE_URL}/visitors/register`, { method: "POST", body: fd })
      const d = await r.json().catch(() => null)
      if (r.ok) {
        setRegisteredVisitorId(d.id)
        setPage("visit")
        toast.success("Registration complete! Now plan your visit.")
      } else {
        toast.error(`Registration failed: ${d?.detail ?? "Unknown error"}`)
      }
    } catch (e) {
      console.error(e)
      toast.error("An error occurred during registration.")
    } finally { setRegistering(false) }
  }

  // ── Visit request ─────────────────────────────────────────────────────────
  const handleSubmitVisit = async () => {
    if (!registeredVisitorId || !selectedHostId || !selectedLocationId || !visitDate || !visitTime || !visitPurpose.trim()) return
    setSubmittingVisit(true)
    try {
      const r = await fetch(`${API_BASE_URL}/visit-requests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitor_id: registeredVisitorId,
          host_id: selectedHostId,
          location_id: selectedLocationId,
          purpose: visitPurpose.trim(),
          requested_datetime: `${visitDate}T${visitTime}:00.000Z`,
        }),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) throw new Error(d?.detail ?? "Failed to submit visit request.")
      setConfirmedHostName(hosts.find(h => h.id === selectedHostId)?.name ?? "")
      setConfirmedLocationName(locations.find(l => l.id === selectedLocationId)?.name ?? "")
      setDoneReason("visit-submitted"); setPage("done")
      toast.success("Visit request submitted!")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit visit request.")
    } finally { setSubmittingVisit(false) }
  }

  // ── Reset everything ──────────────────────────────────────────────────────
  const handleReset = () => {
    setPage("info"); setDoneReason("skip")
    setName(""); setEmail(""); setPhone(""); resetOtp()
    setPhoto(null); setCameraMessage(""); setRegistering(false)
    setRegisteredVisitorId(null); setIsReturningVisitor(false)
    setLocations([]); setHosts([])
    setSelectedLocationId(null); setSelectedHostId(null)
    setVisitDate(""); setVisitTime(""); setVisitPurpose("")
    setConfirmedHostName(""); setConfirmedLocationName("")
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: Done
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "done") {
    return (
      <div className={OUTER}>
        <div className={cn(INNER, "space-y-4")}>
          <StepDotBar currentDot={5} />
          <div className="flex flex-col items-center text-center space-y-4 pt-2">
            <div className="animate-check-bounce">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div className="animate-fade-in-up space-y-1.5">
              {doneReason === "visit-submitted" ? (
                <>
                  <h2 className="text-xl font-semibold text-gray-900">Visit Request Submitted</h2>
                  <p className="text-sm text-gray-500 max-w-xs">
                    Your request has been sent to{" "}
                    <strong className="text-gray-700">{confirmedHostName}</strong> at{" "}
                    <strong className="text-gray-700">{confirmedLocationName}</strong>.
                    You&apos;ll receive an email once they respond.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-2 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-100 w-fit mx-auto">
                    <Clock className="h-4 w-4 text-indigo-500 shrink-0" />
                    <span className="text-sm text-indigo-700 font-medium">
                      {visitDate} · {visitTime}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-gray-900">Registration Complete</h2>
                  <p className="text-sm text-gray-500 max-w-xs">
                    Your visitor profile has been created. Check your email for your QR code.
                  </p>
                </>
              )}
            </div>
            <button
              className="animate-fade-in-up h-10 px-6 rounded-xl border border-gray-200 bg-white/50 hover:bg-white/80 text-gray-700 text-sm font-medium transition-colors"
              onClick={handleReset}
            >
              Register Another Visitor
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: Visit request (Step 4)
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "visit") {
    return (
      <div className={OUTER}>
        <div className={cn(INNER, "space-y-5")}>

          <div className="flex justify-center">
            <ShieldCheck className="h-10 w-10 text-indigo-600" />
          </div>

          <div className="text-center space-y-0.5">
            <h1 className="text-2xl font-bold text-gray-900">Plan Your Visit</h1>
            <p className="text-sm text-gray-500">Select who you&apos;re visiting and when.</p>
          </div>

          <StepDotBar currentDot={4} />

          {/* Returning visitor banner */}
          {isReturningVisitor && (
            <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 animate-fade-in-up">
              <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700">
                Welcome back, <strong>{name || "visitor"}</strong>! Your profile is already on file.
              </p>
            </div>
          )}

          {/* Location */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-indigo-500" />
              Office Location
            </Label>
            {loadingLocations ? (
              <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />
            ) : locations.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                No locations configured yet — contact your administrator.
              </p>
            ) : (
              <select
                value={selectedLocationId ?? ""}
                onChange={e => { setSelectedLocationId(Number(e.target.value)); setSelectedHostId(null) }}
                className="h-11 w-full bg-white/70 border border-gray-300 rounded-xl px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 appearance-none cursor-pointer"
              >
                <option value="">Select a location…</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ""}</option>
                ))}
              </select>
            )}
          </div>

          {/* Host */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-indigo-500" />
              Who are you visiting?
            </Label>
            <select
              value={selectedHostId ?? ""}
              onChange={e => setSelectedHostId(Number(e.target.value))}
              disabled={!selectedLocationId || loadingHosts}
              className="h-11 w-full bg-white/70 border border-gray-300 rounded-xl px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
            >
              <option value="">
                {!selectedLocationId ? "Select a location first…"
                  : loadingHosts ? "Loading…"
                  : hosts.length === 0 ? "No hosts at this location"
                  : "Select a host…"}
              </option>
              {hosts.map(h => (
                <option key={h.id} value={h.id}>
                  {h.name}{h.department ? ` (${h.department})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Visit Date</Label>
              <Input
                type="date" value={visitDate} min={tomorrowDate}
                onChange={e => setVisitDate(e.target.value)}
                className="h-11 bg-white/70 border-gray-300 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Time Slot</Label>
              <select
                value={visitTime} onChange={e => setVisitTime(e.target.value)}
                className="h-11 w-full bg-white/70 border border-gray-300 rounded-xl px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 appearance-none cursor-pointer"
              >
                <option value="">Select…</option>
                {TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-3">Each slot is 30 minutes.</p>

          {/* Purpose */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Purpose of Visit</Label>
            <textarea
              placeholder="Briefly describe the purpose of your visit…"
              value={visitPurpose} onChange={e => setVisitPurpose(e.target.value)}
              rows={3}
              className="w-full bg-white/70 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-gray-400"
            />
          </div>

          <button
            onClick={() => void handleSubmitVisit()}
            disabled={!selectedLocationId || !selectedHostId || !visitDate || !visitTime || !visitPurpose.trim() || submittingVisit}
            className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submittingVisit ? "Submitting…" : "Submit Visit Request"}
          </button>

          <button
            type="button"
            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
            onClick={() => { setDoneReason("skip"); setPage("done") }}
          >
            Skip — I&apos;ll schedule a visit later
          </button>

        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: Photo capture (Step 3 — new visitors only)
  // ════════════════════════════════════════════════════════════════════════════
  if (page === "photo") {
    return (
      <div className={OUTER}>
        <div className={cn(INNER, "space-y-5")}>

          <div className="flex justify-center">
            <ShieldCheck className="h-10 w-10 text-indigo-600" />
          </div>

          <div className="text-center space-y-0.5">
            <h1 className="text-2xl font-bold text-gray-900">Face Registration</h1>
            <p className="text-sm text-gray-500">We need a clear photo to identify you at entry.</p>
          </div>

          <StepDotBar currentDot={3} />

          {/* Camera */}
          {!cameraOpen && !photo && (
            <button
              type="button" onClick={() => void openCamera()}
              className="w-full h-36 rounded-xl bg-gray-800/70 backdrop-blur flex flex-col items-center justify-center gap-2 hover:bg-gray-800/80 transition-colors border-0"
            >
              <div className="rounded-full bg-white/20 p-3">
                <Camera className="h-6 w-6 text-white" />
              </div>
              <span className="text-sm text-white">Tap to open camera</span>
            </button>
          )}

          {cameraOpen && (
            <div className="space-y-2 animate-scale-in">
              {cameraMessage && (
                <p className="rounded-xl bg-white/70 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  {cameraMessage}
                </p>
              )}
              <div className="relative overflow-hidden rounded-xl bg-gray-900">
                <video
                  ref={videoRef} autoPlay playsInline muted
                  onLoadedMetadata={() => {
                    setVideoReady(true)
                    setCameraMessage("Live preview ready. Center your face and tap capture.")
                  }}
                  className="w-full aspect-[4/3] object-cover scale-x-[-1]"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-44 h-56 rounded-full border-2 border-white/40 border-dashed" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-4 pb-4 pt-8 bg-gradient-to-t from-black/60 to-transparent">
                  <button onClick={stopCamera}
                    className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 flex items-center justify-center transition-colors"
                    aria-label="Close camera">
                    <X className="h-4 w-4" />
                  </button>
                  <button onClick={capturePhoto} disabled={!videoReady}
                    className="h-14 w-14 rounded-full bg-white text-black hover:bg-white/90 shadow-lg flex items-center justify-center transition-colors disabled:opacity-50"
                    aria-label="Capture photo">
                    <Camera className="h-6 w-6" />
                  </button>
                  <div className="h-10 w-10" />
                </div>
              </div>
            </div>
          )}

          {photo && (
            <div className="space-y-3 animate-scale-in">
              <div className="relative overflow-hidden rounded-xl">
                <img src={photo} alt="Visitor photo" className="w-full aspect-[4/3] object-cover" />
                <button
                  className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/80 backdrop-blur-sm hover:bg-white/90 shadow-sm text-sm text-gray-700 transition-colors"
                  onClick={() => void openCamera()}
                >
                  <RotateCcw className="h-3 w-3" />
                  Retake
                </button>
              </div>

              <button
                onClick={() => void handleRegister()}
                disabled={registering}
                className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {registering ? "Registering…" : (
                  <><span>Complete Registration</span><ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </div>
          )}

        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE: Personal info + OTP (Step 1 / 2)
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className={OUTER}>
      <div className={cn(INNER, "space-y-5")}>

        <div className="flex justify-center">
          <ShieldCheck className="h-10 w-10 text-indigo-600" />
        </div>

        <div className="text-center space-y-0.5">
          <h1 className="text-2xl font-bold text-gray-900">Visitor Registration</h1>
          <p className="text-sm text-gray-500">Enter your details to get started.</p>
        </div>

        <StepDotBar currentDot={currentDot} />

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="v-name" className="text-sm font-medium text-gray-700">Full Name</Label>
          <Input
            id="v-name" placeholder="Enter your full name"
            value={name} onChange={e => setName(e.target.value)}
            className="h-11 bg-white/70 border-gray-300 rounded-xl"
          />
        </div>

        {/* Email + OTP send */}
        <div className="space-y-2">
          <Label htmlFor="v-email" className="text-sm font-medium text-gray-700">Email Address</Label>
          <div className="flex gap-2">
            <Input
              id="v-email" type="email" placeholder="Enter your email"
              value={email}
              onChange={e => { setEmail(e.target.value); resetOtp() }}
              className="flex-1 h-11 bg-white/70 border-gray-300 rounded-xl"
            />
            <button
              type="button"
              onClick={() => void handleSendOtp()}
              disabled={!email.trim() || sendingOtp}
              className="h-11 shrink-0 px-4 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingOtp ? "Sending…" : otpSent ? "Resend ✦" : "Send OTP ✦"}
            </button>
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="v-phone" className="text-sm font-medium text-gray-700">Mobile Number <span className="text-gray-400 font-normal">(Optional)</span></Label>
          <Input
            id="v-phone" type="tel" placeholder="Enter mobile number"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
            className="h-11 bg-white/70 border-gray-300 rounded-xl"
          />
        </div>

        {/* OTP verification box */}
        {otpSent && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-700">Enter 6-digit code</Label>
              {otpVerified && (
                <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 gap-1">
                  <Check className="h-3 w-3" /> Verified
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} />)}
                </InputOTPGroup>
              </InputOTP>
              <button
                type="button"
                onClick={() => void handleVerifyOtp()}
                disabled={otp.length !== 6 || otpVerified || verifyingOtp}
                className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifyingOtp ? "Verifying…" : "Verify"}
              </button>
            </div>

            {/* Returning visitor notice */}
            {otpVerified && existingVisitorId !== null && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 animate-fade-in-up">
                <UserCheck className="h-4 w-4 shrink-0" />
                You&apos;re already registered — no photo needed.
              </div>
            )}
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={handleContinueFromInfo}
          disabled={!name.trim() || !otpVerified}
          className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {otpVerified && existingVisitorId !== null
            ? <><span>Schedule My Visit</span><ArrowRight className="h-4 w-4" /></>
            : otpVerified
              ? <><span>Continue to Photo</span><ArrowRight className="h-4 w-4" /></>
              : "Verify your email to continue"
          }
        </button>

      </div>
    </div>
  )
}
