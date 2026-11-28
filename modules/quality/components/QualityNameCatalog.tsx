import { useState } from 'react';
import { toast } from 'sonner';
import type { QualityNamedReason } from '../model';
import { qualityUserMessage } from '../services/qualityGateway';

export function QualityNameCatalog({
  title,
  placeholder,
  names,
  canManage,
  emptyLabel = 'لا توجد أسباب محفوظة بعد.',
  maxLength = 120,
  onCreate,
  onRename,
  onRemove,
  onSetActive,
  onRemoveMany,
}: {
  title: string;
  placeholder: string;
  names: QualityNamedReason[];
  canManage: boolean;
  emptyLabel?: string;
  maxLength?: number;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSetActive?: (id: string, isActive: boolean) => Promise<void>;
  onRemoveMany?: (ids: string[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error: unknown) {
      toast.error(qualityUserMessage(error, 'تعذر حفظ القائمة'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="qms-card" style={{ marginBottom: 12 }}>
      <h2 className="qms-label">{title}</h2>
      <div className="qms-row">
        <input className="qms-input" maxLength={maxLength} value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} disabled={!canManage} />
        <button
          type="button"
          className="qms-btn qms-btn-ghost"
          disabled={busy || !canManage}
          onClick={() => void run(async () => {
            await onCreate(draft);
            setDraft('');
            toast.success('تمت الإضافة');
          })}
        >إضافة</button>
      </div>
      {onRemoveMany && selectedIds.length > 0 ? (
        <div className="qms-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <span className="qms-muted">تم تحديد {selectedIds.length}</span>
          <button type="button" className="qms-btn qms-btn-ghost" disabled={busy} onClick={() => {
            if (!window.confirm(`حذف ${selectedIds.length} عنصرًا محددًا؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
            void run(async () => {
              await onRemoveMany(selectedIds);
              setSelectedIds([]);
              toast.success('تم حذف العناصر المحددة');
            });
          }}>حذف المحدد ({selectedIds.length})</button>
        </div>
      ) : null}
      <ul>
        {names.map((reason) => (
          <li key={reason.id} className="qms-row">
            {onRemoveMany ? (
              <input
                type="checkbox"
                aria-label={`تحديد ${reason.name}`}
                checked={selectedIds.includes(reason.id)}
                disabled={busy}
                onChange={() => setSelectedIds((current) =>
                  current.includes(reason.id)
                    ? current.filter((id) => id !== reason.id)
                    : [...current, reason.id],
                )}
              />
            ) : null}
            {editingId === reason.id ? (
              <input className="qms-input" maxLength={maxLength} value={editingName} onChange={(event) => setEditingName(event.target.value)} />
            ) : <span>{reason.name}{reason.isActive === false ? ' (موقوف)' : ''}</span>}
            {canManage && editingId === reason.id ? (
              <button type="button" className="qms-btn qms-btn-ghost" disabled={busy} onClick={() => void run(async () => {
                await onRename(reason.id, editingName);
                setEditingId('');
                toast.success('تم التعديل');
              })}>حفظ</button>
            ) : null}
            {canManage ? (
              <button type="button" className="qms-btn qms-btn-ghost" disabled={busy} onClick={() => {
                setEditingId(reason.id);
                setEditingName(reason.name);
              }}>تعديل</button>
            ) : null}
            {canManage && onSetActive ? (
              <button type="button" className="qms-btn qms-btn-ghost" disabled={busy} onClick={() => void run(async () => {
                await onSetActive(reason.id, reason.isActive === false);
                toast.success(reason.isActive === false ? 'تم التفعيل' : 'تم الإيقاف');
              })}>{reason.isActive === false ? 'تفعيل' : 'إيقاف'}</button>
            ) : null}
            {canManage ? (
              <button type="button" className="qms-btn qms-btn-ghost" disabled={busy} onClick={() => void run(async () => {
                if (!window.confirm(`حذف «${reason.name}» من القائمة؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
                await onRemove(reason.id);
                toast.success('تم الحذف من القائمة');
              })}>حذف</button>
            ) : null}
          </li>
        ))}
      </ul>
      {names.length === 0 ? <p>{emptyLabel}</p> : null}
    </section>
  );
}
