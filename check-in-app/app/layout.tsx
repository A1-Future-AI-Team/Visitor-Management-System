import React from "react"
import type { Metadata } from 'next'
import { Toaster } from "@/components/ui/sonner"

import './globals.css'

export const metadata: Metadata = {
  title: 'Security Check-in',
  description: 'Visitor identity verification and check-in system',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
