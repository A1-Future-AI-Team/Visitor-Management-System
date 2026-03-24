"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Camera, CheckCircle2, RotateCcw, X } from "lucide-react"

const API_BASE_URL = "http://localhost:8000"

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
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

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
      alert("Unable to access camera. Please allow camera permissions.")
    }
  }, [stopCamera])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      alert("Camera preview is not ready yet. Wait for the live image, then capture.")
      return
    }

    const canvas = document.createElement("canvas")
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      alert("Unable to capture a photo from the live preview.")
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
      alert("Verification code sent to your email inbox.")
    } catch (error) {
      console.error("Error sending OTP:", error)
      alert(error instanceof Error ? error.message : "Failed to send OTP. Is the backend running?")
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
      alert("Email verified successfully.")
    } catch (error) {
      console.error("Error verifying OTP:", error)
      alert(error instanceof Error ? error.message : "OTP verification failed.")
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
        alert(`Registration successful. Visitor ID: ${data.id}. Check your email for the QR code.`)
        setName("")
        setEmail("")
        setPhone("")
        setPhoto(null)
        setCameraMessage("")
        resetOtpState()
      } else {
        alert(`Registration failed: ${data?.detail ?? "Unknown error"}`)
      }
    } catch (error) {
      console.error("Error during registration:", error)
      alert("An error occurred during registration. Check the console for details.")
    }
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-lg font-semibold text-foreground">
          Visitor Registration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-0">
        <div className="space-y-2">
          <Label htmlFor="visitor-name">Full Name</Label>
          <Input
            id="visitor-name"
            placeholder="Enter your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="visitor-email">Email Address</Label>
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
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 shrink-0 bg-transparent px-4"
              onClick={handleSendOtp}
              disabled={!email.trim() || sendingOtp}
            >
              {otpSent ? "Resend" : "Send OTP"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="visitor-phone">Mobile Number (Optional)</Label>
          <Input
            id="visitor-phone"
            type="tel"
            placeholder="Enter mobile number"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 15))}
          />
          <p className="text-xs text-muted-foreground">Stored for contact only. Email is the verified identifier in this POC.</p>
        </div>

        {otpSent && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Enter Email OTP</Label>
              {otpVerified && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Verified
                </span>
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
              <Button type="button" variant="secondary" onClick={handleVerifyOtp} disabled={otp.length !== 6 || otpVerified || verifyingOtp}>
                Verify
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Photo</Label>
          {!cameraOpen && !photo && (
            <Button
              type="button"
              variant="outline"
              className="h-24 w-full flex-col gap-2 border-dashed bg-transparent"
              onClick={() => void openCamera()}
            >
              <Camera className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Tap to open live camera preview
              </span>
            </Button>
          )}

          {cameraOpen && (
            <div className="space-y-2">
              {cameraMessage && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{cameraMessage}</p>
              )}
              <div className="relative overflow-hidden rounded-md bg-muted">
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
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={stopCamera}
                    className="h-10 w-10 rounded-full p-0"
                    aria-label="Close camera"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={capturePhoto}
                    className="h-12 w-12 rounded-full p-0"
                    aria-label="Capture photo"
                    disabled={!videoReady}
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {photo && (
            <div className="relative overflow-hidden rounded-md">
              <img
                src={photo}
                alt="Captured visitor photo"
                className="w-full aspect-[4/3] object-cover"
              />
              <Button
                size="sm"
                variant="secondary"
                className="absolute bottom-2 right-2 gap-1"
                onClick={() => void openCamera()}
              >
                <RotateCcw className="h-3 w-3" />
                Retake
              </Button>
            </div>
          )}
        </div>

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={!name.trim() || !email.trim() || !otpVerified || !verificationToken || !photo}
        >
          Register
        </Button>
      </CardContent>
    </Card>
  )
}
