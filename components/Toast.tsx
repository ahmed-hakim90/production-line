import React from 'react';
import { toast as sonnerToast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

type ToastLevel = 'success' | 'error' | 'warning' | 'info';

type ToastOptions = {
  duration?: number;
  description?: string;
};

const DEFAULT_TOAST_DURATION = 3500;

const resolveToastOptions = (durOrOptions?: number | ToastOptions): ToastOptions => {
  if (typeof durOrOptions === 'number') {
    return { duration: durOrOptions };
  }
  return {
    duration: durOrOptions?.duration ?? DEFAULT_TOAST_DURATION,
    description: durOrOptions?.description,
  };
};

const showToast = (level: ToastLevel, message: string, durOrOptions?: number | ToastOptions) => {
  const options = resolveToastOptions(durOrOptions);
  sonnerToast[level](message, options);
};

/**
 * Backward-compatible toast API backed by shadcn/sonner.
 */
export const toast = {
  success: (msg: string, durOrOptions?: number | ToastOptions) => showToast('success', msg, durOrOptions),
  error: (msg: string, durOrOptions?: number | ToastOptions) => showToast('error', msg, durOrOptions),
  warning: (msg: string, durOrOptions?: number | ToastOptions) => showToast('warning', msg, durOrOptions),
  info: (msg: string, durOrOptions?: number | ToastOptions) => showToast('info', msg, durOrOptions),
};

export const ToastContainer: React.FC = () => (
  <Toaster position="top-center" richColors closeButton />
);
