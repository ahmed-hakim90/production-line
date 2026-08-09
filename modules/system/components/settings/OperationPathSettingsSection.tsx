import React from 'react';
import type { OperationPathSettings } from '../../../../types';
import {
  OPERATION_PATH_REGISTRY,
  isOperationPathEnabled,
  patchOperationPathControl,
} from '../../lib/operationPathSettings';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
type Props = {
  isAdmin: boolean;
  value: OperationPathSettings;
  onChange: React.Dispatch<React.SetStateAction<OperationPathSettings>>;
};
const ToggleButton: React.FC<{
  checked: boolean;
  label: string;
  onToggle: () => void;
  disabled?: boolean;
}> = ({ checked, label, onToggle, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onToggle}
    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
      checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
    }`}
  >
    <span
      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
        checked ? 'left-0.5' : 'left-[calc(100%-1.625rem)]'
      }`}
    />
  </button>
);
export const OperationPathSettingsSection: React.FC<Props> = ({
  isAdmin,
  value,
  onChange,
}) => {
  if (!isAdmin) return null;
  return (
    <OpsDashPanel title="مسارات تنفيذ العمليات">
      <div className="space-y-5">
        <p className="text-xs leading-6 text-[var(--color-text-muted)]">
          كل عملية لها منطق تنفيذ موحد، ويمكن تشغيل أو إيقاف كل نقطة دخول مستقلة. الإيقاف يُراجع مرة أخرى داخل أكشن الحفظ ولا يعتمد على إخفاء الزر فقط.
        </p>
        {OPERATION_PATH_REGISTRY
          .map((operation) => {
            const control = value.operations?.[operation.key];
            const operationEnabled = control?.enabled !== false;
            return (
              <section
                key={operation.key}
                className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-black text-[var(--color-text)]">{operation.label}</h4>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                      {operation.description}
                    </p>
                  </div>
                  <ToggleButton
                    checked={operationEnabled}
                    label={`${operationEnabled ? 'إيقاف' : 'تشغيل'} عملية ${operation.label}`}
                    onToggle={() => onChange((current) => patchOperationPathControl(
                      current,
                      operation.key,
                      { enabled: !operationEnabled },
                    ))}
                  />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {operation.paths.map((path) => {
                    const pathEnabled = isOperationPathEnabled(value, operation.key, path.key);
                    return (
                      <div
                        key={path.key}
                        className={`flex items-start gap-3 rounded-[var(--border-radius-base)] border p-3 ${
                          operationEnabled
                            ? 'border-[var(--color-border)] bg-[var(--color-surface)]'
                            : 'border-slate-200 bg-slate-100/60 opacity-60 dark:border-slate-700 dark:bg-slate-900/40'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[var(--color-text)]">{path.label}</p>
                          <p className="mt-1 text-[11px] leading-5 text-[var(--color-text-muted)]">
                            {path.description}
                          </p>
                        </div>
                        <ToggleButton
                          checked={operationEnabled && pathEnabled}
                          label={`${pathEnabled ? 'إيقاف' : 'تشغيل'} مسار ${path.label}`}
                          disabled={!operationEnabled}
                          onToggle={() => onChange((current) => patchOperationPathControl(
                            current,
                            operation.key,
                            { paths: { [path.key]: !pathEnabled } },
                          ))}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>
    </OpsDashPanel>
  );
};
