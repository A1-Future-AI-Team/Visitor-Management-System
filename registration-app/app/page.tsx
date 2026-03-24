import { VisitorRegistration } from "@/components/visitor-registration"

export default function RegistrationApp() {
  return (
    <main className="min-h-screen bg-background py-6 px-4">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold text-foreground mb-4 text-center text-balance">
          Gate Pass System - Registration
        </h1>
        <VisitorRegistration />
      </div>
    </main>
  )
}
