"use client"

import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export type ToolStatus = "pending" | "executing" | "completed" | "error"

export type ToolProps = ComponentProps<typeof Collapsible>

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible className={cn("not-prose mb-1.5 w-full rounded-md border", className)} {...props} />
)

export interface ToolHeaderProps {
  title: string
  status: ToolStatus
  className?: string
}

const statusConfig: Record<ToolStatus, { label: string; icon: ReactNode }> = {
  pending: {
    label: "Pending",
    icon: <CircleIcon className="size-3.5" />,
  },
  executing: {
    label: "Running",
    icon: <ClockIcon className="size-3.5 animate-pulse" />,
  },
  completed: {
    label: "Done",
    icon: <CheckCircleIcon className="size-3.5 text-green-600" />,
  },
  error: {
    label: "Error",
    icon: <XCircleIcon className="size-3.5 text-red-600" />,
  },
}

export const ToolHeader = ({ className, title, status }: ToolHeaderProps) => {
  const { label, icon } = statusConfig[status]

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs">{title}</span>
        <Badge className="gap-1 rounded-full px-1.5 py-0 text-[10px]" variant="secondary">
          {icon}
          {label}
        </Badge>
      </div>
      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
    </CollapsibleTrigger>
  )
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent className={cn("border-t", className)} {...props} />
)

export type ToolInputProps = ComponentProps<"div"> & {
  input: Record<string, unknown>
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1.5 p-3", className)} {...props}>
    <p className="text-xs font-medium text-muted-foreground">Parameters</p>
    <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-xs">
      {JSON.stringify(input, null, 2)}
    </pre>
  </div>
)

export type ToolOutputProps = ComponentProps<"div"> & {
  output: unknown
}

export const ToolOutput = ({ className, output, ...props }: ToolOutputProps) => {
  if (output === undefined) return null

  return (
    <div className={cn("space-y-1.5 border-t p-3", className)} {...props}>
      <p className="text-xs font-medium text-muted-foreground">Result</p>
      <pre className="max-h-48 overflow-auto rounded bg-muted/50 p-2 text-xs">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  )
}
