import React from 'react';
import { toast as sonnerToast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

type ToastLevel = 'success' | 'error' | 'warning' | 'info';

type ToastOptions = {
  duration?: number;
  description?: string;
  /** عند التحديث: استبدال toast تحميل سابق بنفس المعرف */
  id?: string | number;
};

const DEFAULT_TOAST_DURATION = 3500;

const resolveToastOptions = (durOrOptions?: number | ToastOptions): ToastOptions => {
  if (typeof durOrOptions === 'number') {
    return { duration: durOrOptions };
  }
  return {
    duration: durOrOptions?.duration ?? DEFAULT_TOAST_DURATION,
    description: durOrOptions?.description,
    id: durOrOptions?.id,
  };
};

const showToast = (level: ToastLevel, message: string, durOrOptions?: number | ToastOptions) => {
  const options = resolveToastOptions(durOrOptions);
  sonnerToast[level](message, {
    duration: options.duration,
    description: options.description,
    ...(options.id != null ? { id: options.id } : {}),
  });
};

const DEFAULT_LOADING_DURATION_MS = 600_000;

/**
 * Backward-compatible toast API backed by shadcn/sonner.
 */
export const toast = {
  success: (msg: string, durOrOptions?: number | ToastOptions) => showToast('success', msg, durOrOptions),
  error: (msg: string, durOrOptions?: number | ToastOptions) => showToast('error', msg, durOrOptions),
  warning: (msg: string, durOrOptions?: number | ToastOptions) => showToast('warning', msg, durOrOptions),
  info: (msg: string, durOrOptions?: number | ToastOptions) => showToast('info', msg, durOrOptions),
  /** يعرض مؤشر تحميل؛ يُرجَع المعرف لاستبداله لاحقًا بـ success/error أو dismiss */
  loading: (msg: string, options?: Pick<ToastOptions, 'duration' | 'id'>) =>
    sonnerToast.loading(msg, {
      duration: options?.duration ?? DEFAULT_LOADING_DURATION_MS,
      ...(options?.id != null ? { id: options.id } : {}),
    }),
  dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
};

export const ToastContainer: React.FC = () => (
  <Toaster position="top-center" richColors closeButton />
);
