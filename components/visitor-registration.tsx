"use client"

import { useState, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Camera, X, RotateCcw } from "lucide-react"

export function VisitorRegistration() {
  const [name, setName] = useState("")
  const [mobile, setMobile] = useState("")
  const [otp, setOtp] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraOpen(true)
      setPhoto(null)
    } catch {
      alert("Unable to access camera. Please allow camera permissions.")
    }
  }, [])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return
    const canvas = document.createElement("canvas")
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0)
      setPhoto(canvas.toDataURL("image/jpeg", 0.8))
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setCameraOpen(false)
  }, [])

  const closeCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setCameraOpen(false)
  }, [])

  const handleSendOtp = async () => {
    if (mobile.length === 10) {
      try {
        const response = await fetch("http://localhost:8000/otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: mobile }),
        })
        const data = await response.json()
        if (data.status === "success") {
          setOtpSent(true)
          alert("MOCK OTP sent! Check backend console for the 4-digit code.")
        }
      } catch (error) {
        console.error("Error sending OTP:", error)
        alert("Failed to send OTP. Is the backend running?")
      }
    }
  }

  const handleSubmit = async () => {
    if (!photo) return
    
    // Convert dataUrl to Blob
    const response_photo = await fetch(photo)
    const blob = await response_photo.blob()
    
    const formData = new FormData()
    formData.append("name", name)
    formData.append("phone", mobile)
    formData.append("image", blob, "visitor_photo.jpg")
    // Note: OTP verification happens first in a real app, 
    // but here we just proceed if OTP is entered.
    
    try {
      // First verify OTP
      const otpResponse = await fetch("http://localhost:8000/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: mobile, otp: otp }),
      })
      
      if (!otpResponse.ok) {
        alert("Invalid OTP")
        return
      }

      const regResponse = await fetch("http://localhost:8000/visitors/register", {
        method: "POST",
        body: formData,
      })
      
      const data = await regResponse.json()
      if (regResponse.ok) {
        alert("Registration Successful! Visitor ID: " + data.id)
        // Reset form
        setName("")
        setMobile("")
        setOtp("")
        setOtpSent(false)
        setPhoto(null)
      } else {
        alert("Registration failed: " + data.detail)
      }
    } catch (error) {
      console.error("Error during registration:", error)
      alert("An error occurred. Check console for details.")
    }
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-lg font-semibold text-foreground">
          Visitor Registration
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 space-y-5">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="visitor-name">Full Name</Label>
          <Input
            id="visitor-name"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Mobile */}
        <div className="space-y-2">
          <Label htmlFor="visitor-mobile">Mobile Number</Label>
          <div className="flex gap-2">
            <Input
              id="visitor-mobile"
              type="tel"
              placeholder="Enter mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 h-10 px-4 bg-transparent"
              onClick={handleSendOtp}
              disabled={mobile.length < 10}
            >
              {otpSent ? "Resend" : "Send OTP"}
            </Button>
          </div>
        </div>

        {/* OTP */}
        {otpSent && (
          <div className="space-y-2">
            <Label>Enter OTP</Label>
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
          </div>
        )}

        {/* Photo Capture */}
        <div className="space-y-2">
          <Label>Photo</Label>
          {!cameraOpen && !photo && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-24 flex flex-col gap-2 border-dashed bg-transparent"
              onClick={openCamera}
            >
              <Camera className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Tap to open camera
              </span>
            </Button>
          )}

          {cameraOpen && (
            <div className="relative rounded-md overflow-hidden bg-muted">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-[4/3] object-cover"
              />
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={closeCamera}
                  className="rounded-full h-10 w-10 p-0"
                  aria-label="Close camera"
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={capturePhoto}
                  className="rounded-full h-12 w-12 p-0"
                  aria-label="Capture photo"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          {photo && (
            <div className="relative rounded-md overflow-hidden">
              <img
                src={photo || "/placeholder.svg"}
                alt="Captured visitor photo"
                className="w-full aspect-[4/3] object-cover"
              />
              <Button
                size="sm"
                variant="secondary"
                className="absolute bottom-2 right-2 gap-1"
                onClick={openCamera}
              >
                <RotateCcw className="h-3 w-3" />
                Retake
              </Button>
            </div>
          )}
        </div>

        {/* Submit */}
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={!name || !mobile || !otp || !photo}
        >
          Register
        </Button>
      </CardContent>
    </Card>
  )
}
