"use client"

import { NetworkProvider } from "@/lib/stores/network-store"
import { useServiceWorker } from "@/hooks/use-service-worker"

function ServiceWorkerInit() {
  useServiceWorker()
  return null
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  return (
    <NetworkProvider>
      <ServiceWorkerInit />
      {children}
    </NetworkProvider>
  )
}
