"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function GetStartedRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/docs/get-started")
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-stone-500">
      <p className="text-sm">Redirecting...</p>
    </div>
  )
}
