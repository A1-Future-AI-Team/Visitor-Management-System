import { AdminPanel } from "@/components/admin-panel"

export default function AdminApp() {
  return (
    <main className="min-h-screen bg-background py-6 px-4">
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-bold text-foreground mb-4 text-center text-balance">
          Gate Pass System - Admin
        </h1>
        <AdminPanel />
      </div>
    </main>
  )
}
