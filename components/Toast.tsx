import React from 'react';
import { toast as sonnerToast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

/**
 * Backward-compatible toast API backed by shadcn/sonner.
 */
export const toast = {
  success: (msg: string, dur?: number) => sonnerToast.success(msg, { duration: dur }),
  error: (msg: string, dur?: number) => sonnerToast.error(msg, { duration: dur }),
  warning: (msg: string, dur?: number) => sonnerToast.warning(msg, { duration: dur }),
  info: (msg: string, dur?: number) => sonnerToast.info(msg, { duration: dur }),
};

export const ToastContainer: React.FC = () => (
  <Toaster position="top-center" richColors closeButton />
);
