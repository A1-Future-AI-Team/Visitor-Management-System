import { CheckInPanel } from "@/components/check-in-panel"

export default function CheckInApp() {
  return (
    <main className="min-h-screen bg-background py-6 px-4">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold text-foreground mb-4 text-center text-balance">
          Gate Pass System - Check-in
        </h1>
        <CheckInPanel />
      </div>
    </main>
  )
}
