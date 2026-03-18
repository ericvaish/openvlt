import { redirect } from "next/navigation"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarSwitcher } from "@/components/sidebar-switcher"
import { CommandPalette } from "@/components/command-palette"
import { TabProvider } from "@/lib/stores/tab-store"
import { CardModeProvider } from "@/lib/stores/card-mode-store"
import { TabContainer } from "@/components/tab-container"
import { getSession } from "@/lib/auth/middleware"
import { CustomCssInjector } from "@/components/custom-css-injector"
import { ConflictResolver } from "@/components/conflict-resolver"
import { CardModeContainer } from "@/components/card-mode-container"
import { ShortcutsProvider } from "@/lib/stores/shortcuts-store"
import { OfflineProvider } from "@/components/offline-provider"
import { OfflineBanner } from "@/components/offline-banner"
import { AIChatProvider } from "@/lib/stores/ai-chat-store"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={0}>
      <TabProvider>
        <ShortcutsProvider>
        <CardModeProvider>
        <OfflineProvider>
        <AIChatProvider>
        <SidebarProvider className="h-svh max-h-svh overflow-hidden">
          <SidebarSwitcher />
          <CardModeContainer />
          {/* min-w-0 + overflow-hidden: prevents horizontal overflow when
              sidebar is open + split view is active. Without this, the two
              split panes size for full viewport width and overflow past the
              sidebar. Do not remove these classes. */}
          <SidebarInset className="min-w-0 overflow-hidden">
            <OfflineBanner />
            <TabContainer />
            {/* children renders TabActivator (invisible) or the notes list page */}
            <div className="hidden">{children}</div>
          </SidebarInset>
          <CommandPalette />
          <CustomCssInjector />
          <ConflictResolver />
        </SidebarProvider>
        </AIChatProvider>
        </OfflineProvider>
        </CardModeProvider>
        </ShortcutsProvider>
      </TabProvider>
    </TooltipProvider>
  )
}
