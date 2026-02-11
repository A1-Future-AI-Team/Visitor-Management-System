"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { VisitorRegistration } from "@/components/visitor-registration"
import { AdminPanel } from "@/components/admin-panel"

export default function Page() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 py-6">
        <h1 className="text-xl font-bold text-foreground mb-4 text-center text-balance">
          Gate Pass System
        </h1>

        <Tabs defaultValue="visitor" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="visitor">Visitor</TabsTrigger>
            <TabsTrigger value="admin">Admin</TabsTrigger>
          </TabsList>

          <TabsContent value="visitor" className="mt-4">
            <VisitorRegistration />
          </TabsContent>

          <TabsContent value="admin" className="mt-4">
            <AdminPanel />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
