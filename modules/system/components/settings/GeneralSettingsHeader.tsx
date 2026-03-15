import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '../../../production/components/UI';

type GeneralSettingsHeaderProps = {
  isAdmin: boolean;
  saving: boolean;
  onSave: () => void;
};

export const GeneralSettingsHeader: React.FC<GeneralSettingsHeaderProps> = ({
  isAdmin,
  saving,
  onSave,
}) => {
  if (!isAdmin) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold">الإعدادات العامة</h3>
        <p className="page-subtitle">هوية المصنع، المظهر، سلوك النظام، لوحة التحكم، والتنبيهات.</p>
      </div>
      <Button onClick={onSave} disabled={saving} className="w-full sm:w-auto">
        {saving && <Loader2 size={14} className="animate-spin" />}
        <Save size={14} />
        حفظ جميع الإعدادات
      </Button>
    </div>
  );
};
