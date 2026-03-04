import React from 'react';
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
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-bold">الإعدادات العامة</h3>
        <p className="page-subtitle">هوية المصنع، المظهر، سلوك النظام، لوحة التحكم، والتنبيهات.</p>
      </div>
      <Button onClick={onSave} disabled={saving}>
        {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
        <span className="material-icons-round text-sm">save</span>
        حفظ جميع الإعدادات
      </Button>
    </div>
  );
};
