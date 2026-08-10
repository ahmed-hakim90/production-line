import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getRootPortalContainer() {
  if (typeof document === "undefined") return undefined
  // Prefer the dedicated overlay root (above topbar / page chrome).
  return (
    document.getElementById("erp-modal-root")
    ?? document.getElementById("root")
    ?? undefined
  )
}
