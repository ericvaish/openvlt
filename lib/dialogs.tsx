"use client"

import * as React from "react"
import { createRoot } from "react-dom/client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// ---------------------------------------------------------------------------
// confirmDialog — imperative replacement for window.confirm()
// Usage: if (await confirmDialog("Delete this?")) { ... }
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export function confirmDialog(
  descriptionOrOpts: string | ConfirmOptions
): Promise<boolean> {
  const opts: ConfirmOptions =
    typeof descriptionOrOpts === "string"
      ? { description: descriptionOrOpts }
      : descriptionOrOpts

  return new Promise((resolve) => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    function cleanup() {
      root.unmount()
      container.remove()
    }

    function ConfirmImpl() {
      const [open, setOpen] = React.useState(true)

      return (
        <AlertDialog
          open={open}
          onOpenChange={(v) => {
            if (!v) {
              setOpen(false)
              resolve(false)
              cleanup()
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {opts.title || "Are you sure?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {opts.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setOpen(false)
                  resolve(false)
                  cleanup()
                }}
              >
                {opts.cancelLabel || "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={opts.destructive ? "destructive" : "default"}
                onClick={() => {
                  setOpen(false)
                  resolve(true)
                  cleanup()
                }}
              >
                {opts.confirmLabel || "Continue"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )
    }

    root.render(<ConfirmImpl />)
  })
}

// ---------------------------------------------------------------------------
// promptDialog — imperative replacement for window.prompt()
// Usage: const name = await promptDialog("Enter name:", "default")
// ---------------------------------------------------------------------------

interface PromptOptions {
  title?: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  type?: string
  /** Return an error string to show below the input, or null/undefined if valid. */
  validate?: (value: string) => string | null | undefined
}

export function promptDialog(
  descriptionOrOpts: string | PromptOptions,
  defaultValue?: string
): Promise<string | null> {
  const opts: PromptOptions =
    typeof descriptionOrOpts === "string"
      ? { description: descriptionOrOpts, defaultValue }
      : descriptionOrOpts

  return new Promise((resolve) => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    function cleanup() {
      root.unmount()
      container.remove()
    }

    function PromptImpl() {
      const [open, setOpen] = React.useState(true)
      const [value, setValue] = React.useState(opts.defaultValue || "")
      const inputRef = React.useRef<HTMLInputElement>(null)

      const validationError = opts.validate ? opts.validate(value) : null

      React.useEffect(() => {
        // Focus and select on open
        requestAnimationFrame(() => inputRef.current?.select())
      }, [])

      function handleSubmit() {
        if (validationError) return
        setOpen(false)
        resolve(value)
        cleanup()
      }

      function handleCancel() {
        setOpen(false)
        resolve(null)
        cleanup()
      }

      return (
        <Dialog
          open={open}
          onOpenChange={(v) => {
            if (!v) handleCancel()
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{opts.title || "Input"}</DialogTitle>
              {opts.description && (
                <DialogDescription>{opts.description}</DialogDescription>
              )}
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSubmit()
              }}
            >
              <Input
                ref={inputRef}
                type={opts.type || "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={opts.placeholder}
                className={validationError ? "mb-1" : "mb-4"}
                autoFocus
              />
              {validationError && (
                <p className="mb-3 text-sm text-destructive">{validationError}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  {opts.cancelLabel || "Cancel"}
                </Button>
                <Button type="submit" disabled={!!validationError}>
                  {opts.confirmLabel || "OK"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )
    }

    root.render(<PromptImpl />)
  })
}
