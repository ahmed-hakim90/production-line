import React from 'react';
import { Button } from '@/components/ui/button';

type WhatsAppShareProps = {
  text: string;
  phone?: string;
  /** نص الزر — افتراضيًا «إرسال واتساب» */
  label?: string;
};

const normalizeWhatsAppPhone = (phone?: string): string => {
  if (!phone) return '';
  const digitsOnly = String(phone).replace(/\D+/g, '');
  if (!digitsOnly) return '';
  return digitsOnly.startsWith('00') ? digitsOnly.slice(2) : digitsOnly;
};

export const WhatsAppShare: React.FC<WhatsAppShareProps> = ({ text, phone, label }) => {
  const share = () => {
    const encoded = encodeURIComponent(text);
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    const targetUrl = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(targetUrl, '_blank');
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={share}>
      {label || 'إرسال واتساب'}
    </Button>
  );
};
