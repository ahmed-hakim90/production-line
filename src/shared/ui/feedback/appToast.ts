import { toast } from '@/components/Toast';

export type AppToastStatus = 'success' | 'error' | 'warning' | 'info';

export type AppToastOptions = {
  duration?: number;
  description?: string;
  id?: string | number;
};

export function showAppToast(status: AppToastStatus, message: string, options?: AppToastOptions): void {
  toast[status](message, options);
}

export function showAppFeedback(
  feedback: { type?: AppToastStatus; status?: AppToastStatus; text?: string; message?: string } | string | null | undefined,
  fallbackStatus: AppToastStatus = 'info',
  options?: AppToastOptions,
): void {
  if (!feedback) return;
  if (typeof feedback === 'string') {
    showAppToast(fallbackStatus, feedback, options);
    return;
  }

  const message = feedback.text || feedback.message;
  if (!message) return;
  showAppToast(feedback.type || feedback.status || fallbackStatus, message, options);
}
