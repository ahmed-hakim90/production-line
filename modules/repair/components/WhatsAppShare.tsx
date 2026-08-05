import React from 'react';
import { Button } from '@/components/ui/button';
import { normalizeWhatsAppPhone } from '../utils/customerPhone';

type WhatsAppShareProps = {
  text: string;
  phone?: string;
  /** نص الزر — افتراضيًا «إرسال واتساب» */
  label?: string;
  disabled?: boolean;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
};

export const WhatsAppShare: React.FC<WhatsAppShareProps> = ({
  text,
  phone,
  label,
  disabled,
  className,
  size = 'sm',
}) => {
  const share = () => {
    const message = String(text || '').trim();
    if (!message) return;
    const encoded = encodeURIComponent(message);
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    const targetUrl = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      disabled={disabled || !String(text || '').trim()}
      onClick={share}
    >
      {label || 'إرسال واتساب'}
    </Button>
  );
};
