import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import type {
  TableColumnDefinition,
  TableColumnSettings,
  TableColumnWidth,
  UserTableSettingsDocument,
} from './tableSettings.types';

type TableSettingsState = {
  columns: TableColumnSettings[];
};

function buildDefaults<T>(columns: TableColumnDefinition<T>[]): TableColumnSettings[] {
  return columns.map((column, index) => ({
    id: column.id,
    visible: column.visible ?? true,
    width: column.width ?? 'md',
    order: index,
  }));
}

function mergeSettings<T>(
  defaults: TableColumnSettings[],
  persisted: TableColumnSettings[] | undefined,
  columnDefs: TableColumnDefinition<T>[],
): TableColumnSettings[] {
  if (!persisted?.length) {
    return defaults;
  }

  const persistedMap = new Map(persisted.map((column) => [column.id, column]));
  const merged = defaults.map((column, defaultIndex) => {
    const fromStorage = persistedMap.get(column.id);
    if (!fromStorage) {
      return { ...column, order: defaultIndex };
    }
    return {
      ...column,
      visible: fromStorage.visible,
      width: fromStorage.width,
      order: fromStorage.order,
    };
  });

  const availableIds = new Set(columnDefs.map((column) => column.id));
  return merged
    .filter((column) => availableIds.has(column.id))
    .sort((a, b) => a.order - b.order)
    .map((column, index) => ({ ...column, order: index }));
}

export function useTableSettings<T>(params: {
  userId?: string | null;
  tableId: string;
  columns: TableColumnDefinition<T>[];
}) {
  const { userId, tableId, columns } = params;
  const defaultSettings = useMemo(() => buildDefaults(columns), [columns]);

  // Stable refs so effects don't re-run on every render when columns change
  const defaultSettingsRef = useRef(defaultSettings);
  const columnsRef = useRef(columns);
  defaultSettingsRef.current = defaultSettings;
  columnsRef.current = columns;

  const [state, setState] = useState<TableSettingsState>({ columns: defaultSettings });
  const [isLoading, setIsLoading] = useState(true);

  // Load from Firestore only when userId or tableId actually changes
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!userId || !isConfigured) {
        setState({ columns: defaultSettingsRef.current });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const ref = doc(db, 'users', userId, 'preferences', 'tableSettings');
        const snapshot = await getDoc(ref);
        const documentData = (snapshot.data() ?? {}) as UserTableSettingsDocument;
        const persisted = documentData[tableId]?.columns;
        if (!cancelled) {
          setState({
            columns: mergeSettings(defaultSettingsRef.current, persisted, columnsRef.current),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ columns: defaultSettingsRef.current });
        }
        console.error('Failed to load table settings:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tableId]);

  const persist = useCallback(
    async (nextColumns: TableColumnSettings[]) => {
      if (!userId || !isConfigured) {
        return;
      }
      try {
        const ref = doc(db, 'users', userId, 'preferences', 'tableSettings');
        await setDoc(
          ref,
          {
            [tableId]: {
              columns: nextColumns,
              updatedAt: serverTimestamp(),
            },
          },
          { merge: true },
        );
      } catch (error) {
        console.error('Failed to persist table settings:', error);
      }
    },
    [userId, tableId],
  );

  const updateColumns = useCallback(
    (updater: (previous: TableColumnSettings[]) => TableColumnSettings[]) => {
      setState((previous) => {
        const nextColumns = updater(previous.columns)
          .map((column, index) => ({ ...column, order: index }))
          .filter((column) => columns.some((definition) => definition.id === column.id));
        void persist(nextColumns);
        return { columns: nextColumns };
      });
    },
    [columns, persist],
  );

  const toggleVisibility = useCallback((columnId: string) => {
    updateColumns((previous) =>
      previous.map((column) =>
        column.id === columnId ? { ...column, visible: !column.visible } : column,
      ),
    );
  }, [updateColumns]);

  const setWidth = useCallback((columnId: string, width: TableColumnWidth) => {
    updateColumns((previous) =>
      previous.map((column) => (column.id === columnId ? { ...column, width } : column)),
    );
  }, [updateColumns]);

  const moveColumn = useCallback((columnId: string, direction: 'left' | 'right') => {
    updateColumns((previous) => {
      const index = previous.findIndex((column) => column.id === columnId);
      if (index < 0) {
        return previous;
      }
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= previous.length) {
        return previous;
      }
      const next = [...previous];
      const [column] = next.splice(index, 1);
      next.splice(targetIndex, 0, column);
      return next;
    });
  }, [updateColumns]);

  const reset = useCallback(() => {
    setState({ columns: defaultSettings });
    void persist(defaultSettings);
  }, [defaultSettings, persist]);

  return {
    settings: state.columns,
    isLoading,
    toggleVisibility,
    setWidth,
    moveColumn,
    reset,
  };
}
