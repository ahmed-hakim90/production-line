import React from 'react';

type GeneralSettingsHeaderProps = {
  isAdmin: boolean;
};

export const GeneralSettingsHeader: React.FC<GeneralSettingsHeaderProps> = ({
  isAdmin,
}) => {
  if (!isAdmin) return null;

  return (
    <div>
      <div>
        <h3 className="text-lg font-bold">النظام الأساسي</h3>
        <p className="page-subtitle">بيانات الشركة، صفحة البداية، وقواعد التشغيل العامة فقط.</p>
      </div>
    </div>
  );
};
