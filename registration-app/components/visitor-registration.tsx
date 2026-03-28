"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Camera, Check, CheckCircle2, RotateCcw, X, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const API_BASE_URL = "http://localhost:8000"

function StepDotBar({ currentStep }: { currentStep: number }) {
  const steps = ["PERSONAL\nINFO", "VERIFI-\nCATION", "PHOTO", "COMPLETE"]
  return (
    <div className="relative pt-4 pb-2">
      {/* Background line */}
      <div className="absolute top-[22px] left-0 right-0 h-0.5 bg-gray-200" />
      {/* Filled line progress */}
      <div
        className="absolute top-[22px] left-0 h-0.5 bg-indigo-500 transition-all duration-500"
        style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
      />
      <div className="relative flex justify-between">
        {steps.map((label, i) => {
          const step = i + 1
          const isActive = currentStep === step
          const isDone = currentStep > step
          return (
            <div key={i} className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "w-3 h-3 rounded-full border-2 transition-all",
                  isDone && "bg-indigo-500 border-indigo-500",
                  isActive && "bg-indigo-500 border-indigo-500 ring-4 ring-indigo-100",
                  !isDone && !isActive && "bg-white border-gray-300"
                )}
              />
              <div className="text-center">
                <p className="text-[8px] uppercase font-semibold text-gray-600 leading-tight whitespace-pre-line">{`STEP ${step}:\n${label}`}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function VisitorRegistration() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otpVerified, setOtpVerified] = useState(false)
  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [cameraMessage, setCameraMessage] = useState("")
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [registrationComplete, setRegistrationComplete] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Calculate current step
  const currentStep = registrationComplete
    ? 4
    : photo
      ? 4
      : otpVerified
        ? 3
        : otpSent || email.trim()
          ? 2
          : 1

  const resetOtpState = useCallback(() => {
    setOtp("")
    setOtpSent(false)
    setOtpVerified(false)
    setVerificationToken(null)
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }

    setCameraOpen(false)
    setVideoReady(false)
  }, [])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !cameraOpen || !streamRef.current) {
      return
    }

    video.srcObject = streamRef.current
    void video.play().catch(() => {
      setCameraMessage("Camera is ready but could not autoplay. Wait for the preview, then capture.")
    })
  }, [cameraOpen])

  const openCamera = useCallback(async () => {
    stopCamera()
    setPhoto(null)
    setCameraMessage("Starting live preview...")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      streamRef.current = stream
      setCameraOpen(true)
    } catch {
      toast.error("Unable to access camera. Please allow camera permissions.")
    }
  }, [stopCamera])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      toast.error("Camera preview is not ready yet. Wait for the live image, then capture.")
      return
    }

    const canvas = document.createElement("canvas")
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      toast.error("Unable to capture a photo from the live preview.")
      return
    }

    ctx.drawImage(videoRef.current, 0, 0)
    setPhoto(canvas.toDataURL("image/jpeg", 0.9))
    stopCamera()
  }, [stopCamera])

  const handleSendOtp = async () => {
    if (!email.trim()) {
      return
    }

    setSendingOtp(true)
    resetOtpState()

    try {
      const response = await fetch(`${API_BASE_URL}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.detail ?? "Failed to send OTP.")
      }

      setOtpSent(true)
      toast.success("Verification code sent to your email inbox.")
    } catch (error) {
      console.error("Error sending OTP:", error)
      toast.error(error instanceof Error ? error.message : "Failed to send OTP. Is the backend running?")
    } finally {
      setSendingOtp(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!otpSent || otp.length !== 6) {
      return
    }

    setVerifyingOtp(true)
    try {
      const response = await fetch(`${API_BASE_URL}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.detail ?? "OTP verification failed.")
      }

      setOtpVerified(true)
      setVerificationToken(data.verification_token)
      toast.success("Email verified successfully.")
    } catch (error) {
      console.error("Error verifying OTP:", error)
      toast.error(error instanceof Error ? error.message : "OTP verification failed.")
      setOtpVerified(false)
      setVerificationToken(null)
    } finally {
      setVerifyingOtp(false)
    }
  }

  const handleSubmit = async () => {
    if (!photo || !verificationToken) {
      return
    }

    const responsePhoto = await fetch(photo)
    const blob = await responsePhoto.blob()

    const formData = new FormData()
    formData.append("name", name.trim())
    formData.append("email", email.trim().toLowerCase())
    formData.append("phone", phone.trim())
    formData.append("verification_token", verificationToken)
    formData.append("image", blob, "visitor_photo.jpg")

    try {
      const regResponse = await fetch(`${API_BASE_URL}/visitors/register`, {
        method: "POST",
        body: formData,
      })

      const data = await regResponse.json().catch(() => null)
      if (regResponse.ok) {
        setRegistrationComplete(true)
        toast.success(`Registration successful! Visitor ID: ${data.id}`)
      } else {
        toast.error(`Registration failed: ${data?.detail ?? "Unknown error"}`)
      }
    } catch (error) {
      console.error("Error during registration:", error)
      toast.error("An error occurred during registration. Check the console for details.")
    }
  }

  const handleRegisterAnother = () => {
    setName("")
    setEmail("")
    setPhone("")
    setPhoto(null)
    setCameraMessage("")
    resetOtpState()
    setRegistrationComplete(false)
  }

  // Success state
  if (registrationComplete) {
    return (
      <div className="p-[1.5px] rounded-3xl bg-gradient-to-br from-violet-400/70 via-indigo-300/50 to-purple-400/70 shadow-2xl shadow-indigo-200/50">
        <div className="rounded-3xl bg-white/80 backdrop-blur-xl p-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="animate-check-bounce">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <div className="space-y-1.5 animate-fade-in-up">
              <h2 className="text-xl font-semibold tracking-tight text-gray-900">
                Registration Complete
              </h2>
              <p className="text-sm text-gray-500 max-w-xs">
                Your visitor pass has been created. Check your email for the QR code to present at entry.
              </p>
            </div>
            <button
              className="mt-2 animate-fade-in-up h-10 px-6 rounded-xl border border-gray-200 bg-white/50 hover:bg-white/80 text-gray-700 text-sm font-medium transition-colors"
              onClick={handleRegisterAnother}
            >
              Register Another Visitor
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-[1.5px] rounded-3xl bg-gradient-to-br from-violet-400/70 via-indigo-300/50 to-purple-400/70 shadow-2xl shadow-indigo-200/50">
      <div className="rounded-3xl bg-white/80 backdrop-blur-xl p-8 space-y-5">

        {/* Shield icon */}
        <div className="flex justify-center">
          <ShieldCheck className="h-10 w-10 text-indigo-600" />
        </div>

        {/* Title */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Premium Visitor Registration</h1>
          <p className="text-sm text-gray-500">Complete the steps below to register your visit.</p>
        </div>

        {/* Step dots */}
        <StepDotBar currentStep={currentStep} />

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="visitor-name" className="text-sm font-medium text-gray-700">Full Name</Label>
          <Input
            id="visitor-name"
            placeholder="Enter your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 bg-white/70 border-gray-300 rounded-xl"
          />
        </div>

        {/* Email + OTP button */}
        <div className="space-y-2">
          <Label htmlFor="visitor-email" className="text-sm font-medium text-gray-700">Email Address</Label>
          <div className="flex gap-2">
            <Input
              id="visitor-email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                resetOtpState()
              }}
              className="flex-1 h-11 bg-white/70 border-gray-300 rounded-xl"
            />
            <button
              type="button"
              className="h-11 shrink-0 px-4 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSendOtp}
              disabled={!email.trim() || sendingOtp}
            >
              {sendingOtp ? "Sending..." : otpSent ? "Resend ✦" : "Send OTP ✦"}
            </button>
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="visitor-phone" className="text-sm font-medium text-gray-700">Mobile Number (Optional)</Label>
          <Input
            id="visitor-phone"
            type="tel"
            placeholder="Enter mobile number"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 15))}
            className="h-11 bg-white/70 border-gray-300 rounded-xl"
          />
          <p className="text-xs text-gray-500">
            Stored for contact only. Email is the verified identifier in this POC.
          </p>
        </div>

        {/* OTP Section */}
        {otpSent && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-4 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-700">Enter Email OTP</Label>
              {otpVerified && (
                <Badge
                  variant="secondary"
                  className="bg-green-50 text-green-700 border-green-200 gap-1"
                >
                  <Check className="h-3 w-3" />
                  Verified
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={otp.length !== 6 || otpVerified || verifyingOtp}
                className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifyingOtp ? "Verifying..." : "Verify"}
              </button>
            </div>
          </div>
        )}

        {/* Photo Section */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Photo</Label>

          {!cameraOpen && !photo && (
            <button
              type="button"
              onClick={() => void openCamera()}
              className="w-full h-32 rounded-xl bg-gray-800/70 backdrop-blur flex flex-col items-center justify-center gap-2 text-white hover:bg-gray-800/80 transition-colors border-0"
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
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={() => {
                    setVideoReady(true)
                    setCameraMessage("Live preview ready. Keep your face centered and tap capture.")
                  }}
                  className="w-full aspect-[4/3] object-cover scale-x-[-1]"
                />
                {/* Face oval guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-44 h-56 rounded-full border-2 border-white/40 border-dashed" />
                </div>
                {/* Bottom control bar */}
                <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-4 pb-4 pt-8 bg-gradient-to-t from-black/60 to-transparent">
                  <button
                    onClick={stopCamera}
                    className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 flex items-center justify-center transition-colors"
                    aria-label="Close camera"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    onClick={capturePhoto}
                    className="h-14 w-14 rounded-full bg-white text-black hover:bg-white/90 shadow-lg flex items-center justify-center transition-colors disabled:opacity-50"
                    aria-label="Capture photo"
                    disabled={!videoReady}
                  >
                    <Camera className="h-6 w-6" />
                  </button>
                  <div className="h-10 w-10" />
                </div>
              </div>
            </div>
          )}

          {photo && (
            <div className="relative overflow-hidden rounded-xl animate-scale-in">
              <img
                src={photo}
                alt="Captured visitor photo"
                className="w-full aspect-[4/3] object-cover"
              />
              <button
                className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white/80 backdrop-blur-sm hover:bg-white/90 shadow-sm text-sm text-gray-700 transition-colors"
                onClick={() => void openCamera()}
              >
                <RotateCcw className="h-3 w-3" />
                Retake
              </button>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSubmit}
          disabled={!name.trim() || !email.trim() || !otpVerified || !verificationToken || !photo}
        >
          Complete Registration
        </button>

      </div>
    </div>
  )
}
