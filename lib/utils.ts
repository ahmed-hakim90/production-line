import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getRootPortalContainer() {
  if (typeof document === "undefined") return undefined
  return document.getElementById("root") ?? undefined
}
