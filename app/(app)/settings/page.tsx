"use client"

import { useEffect } from "react"
import { useTabStore } from "@/lib/stores/tab-store"

export default function SettingsPage() {
  const { openTab } = useTabStore()

  useEffect(() => {
    openTab("__settings__", "Settings")
  }, [openTab])

  return null
}
