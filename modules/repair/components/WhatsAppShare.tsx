import React from 'react';
import { Button } from '@/components/ui/button';

export const WhatsAppShare: React.FC<{ text: string }> = ({ text }) => {
  const share = () => {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  return (
    <Button type="button" variant="outline" onClick={share}>
      إرسال واتساب
    </Button>
  );
};
