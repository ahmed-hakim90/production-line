import React, { useEffect } from 'react';

type SortDirection = 'desc' | 'asc';
type SortState = { columnIndex: number; direction: SortDirection };

const NUMERIC_RE = /^-?\d+([.,]\d+)?$/;

const parseMaybeNumber = (value: string): number | null => {
  const normalized = value.replace(/,/g, '').trim();
  if (!NUMERIC_RE.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const getCellText = (row: HTMLTableRowElement, index: number): string => {
  const cell = row.children.item(index) as HTMLElement | null;
  return (cell?.innerText || '').trim();
};

export const GlobalTableEnhancer: React.FC = () => {
  useEffect(() => {
    const tableSortState = new WeakMap<HTMLTableElement, SortState>();
    const tableSelectedRows = new WeakMap<HTMLTableElement, WeakSet<HTMLTableRowElement>>();
    const tableSelectAll = new WeakMap<HTMLTableElement, HTMLInputElement>();

    const updateHeaderSortVisual = (table: HTMLTableElement) => {
      const head = table.tHead;
      if (!head) return;
      const state = tableSortState.get(table);
      const headers = Array.from(head.querySelectorAll('th[data-enhancer-sortable="true"]'));
      headers.forEach((th) => {
        const baseLabel = th.getAttribute('data-enhancer-label') || th.textContent || '';
        const colIndex = Number(th.getAttribute('data-enhancer-col-index') || '-1');
        if (state && state.columnIndex === colIndex) {
          th.textContent = `${baseLabel} ${state.direction === 'desc' ? '▼' : '▲'}`;
        } else {
          th.textContent = baseLabel;
        }
      });
    };

    const updateSelectionState = (table: HTMLTableElement) => {
      const tbody = table.tBodies.item(0);
      const selectAll = tableSelectAll.get(table);
      if (!tbody || !selectAll) return;
      const selectedRows = tableSelectedRows.get(table) || new WeakSet<HTMLTableRowElement>();
      const rows = Array.from(tbody.rows);
      const selectedCount = rows.filter((row) => selectedRows.has(row)).length;
      selectAll.checked = rows.length > 0 && selectedCount === rows.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < rows.length;
    };

    const applySort = (table: HTMLTableElement, columnIndex: number, direction: SortDirection) => {
      const tbody = table.tBodies.item(0);
      if (!tbody) return;
      const rows = Array.from(tbody.rows);
      rows.sort((a, b) => {
        const aText = getCellText(a, columnIndex);
        const bText = getCellText(b, columnIndex);
        const aNum = parseMaybeNumber(aText);
        const bNum = parseMaybeNumber(bText);
        let result = 0;
        if (aNum !== null && bNum !== null) {
          result = aNum - bNum;
        } else {
          result = aText.localeCompare(bText, 'ar', { numeric: true, sensitivity: 'base' });
        }
        return direction === 'desc' ? -result : result;
      });
      rows.forEach((row) => tbody.appendChild(row));
      tableSortState.set(table, { columnIndex, direction });
      updateHeaderSortVisual(table);
      updateSelectionState(table);
    };

    const makeColumnSortable = (table: HTMLTableElement, th: HTMLTableCellElement, colIndex: number) => {
      if (th.getAttribute('data-enhancer-sortable') === 'true') return;
      const label = (th.textContent || '').trim();
      if (!label) return;
      th.setAttribute('data-enhancer-sortable', 'true');
      th.setAttribute('data-enhancer-label', label);
      th.setAttribute('data-enhancer-col-index', String(colIndex));
      th.style.cursor = 'pointer';
      th.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('input,button,a,select,textarea')) return;
        const previous = tableSortState.get(table);
        let nextDirection: SortDirection = 'desc';
        if (previous && previous.columnIndex === colIndex) {
          nextDirection = previous.direction === 'desc' ? 'asc' : 'desc';
        }
        applySort(table, colIndex, nextDirection);
      });
    };

    const ensureSelectionColumn = (table: HTMLTableElement) => {
      const headRow = table.tHead?.rows.item(0);
      const tbody = table.tBodies.item(0);
      if (!headRow || !tbody) return;

      const selectedRows = tableSelectedRows.get(table) || new WeakSet<HTMLTableRowElement>();
      tableSelectedRows.set(table, selectedRows);

      let selectAllInput = headRow.querySelector('input[data-enhancer-select-all="true"]') as HTMLInputElement | null;
      if (!selectAllInput) {
        const selectAllTh = document.createElement('th');
        selectAllTh.className = 'px-3 py-2 text-center';
        selectAllInput = document.createElement('input');
        selectAllInput.type = 'checkbox';
        selectAllInput.className = 'w-4 h-4 accent-primary';
        selectAllInput.setAttribute('data-enhancer-select-all', 'true');
        selectAllInput.addEventListener('click', (event) => event.stopPropagation());
        selectAllInput.addEventListener('change', () => {
          const rows = Array.from(tbody.rows);
          rows.forEach((row) => {
            const checkbox = row.querySelector('input[data-enhancer-row-check="true"]') as HTMLInputElement | null;
            if (!checkbox) return;
            checkbox.checked = selectAllInput!.checked;
            if (selectAllInput!.checked) selectedRows.add(row);
          });
          if (!selectAllInput.checked) {
            tableSelectedRows.set(table, new WeakSet<HTMLTableRowElement>());
          }
          updateSelectionState(table);
        });
        selectAllTh.appendChild(selectAllInput);
        headRow.insertBefore(selectAllTh, headRow.firstChild);
      }
      tableSelectAll.set(table, selectAllInput);

      Array.from(tbody.rows).forEach((row) => {
        let input = row.querySelector('input[data-enhancer-row-check="true"]') as HTMLInputElement | null;
        if (!input) {
          const td = document.createElement('td');
          td.className = 'px-3 py-2 text-center';
          input = document.createElement('input');
          input.type = 'checkbox';
          input.className = 'w-4 h-4 accent-primary';
          input.setAttribute('data-enhancer-row-check', 'true');
          input.addEventListener('click', (event) => event.stopPropagation());
          input.addEventListener('change', () => {
            if (input!.checked) {
              selectedRows.add(row);
            } else {
              const nextSet = new WeakSet<HTMLTableRowElement>();
              Array.from(tbody.rows).forEach((r) => {
                const cb = r.querySelector('input[data-enhancer-row-check="true"]') as HTMLInputElement | null;
                if (cb?.checked) nextSet.add(r);
              });
              tableSelectedRows.set(table, nextSet);
            }
            updateSelectionState(table);
          });
          td.appendChild(input);
          row.insertBefore(td, row.firstChild);
        }
      });
      updateSelectionState(table);
    };

    const enhanceTable = (table: HTMLTableElement) => {
      if (table.getAttribute('data-no-table-enhance') === 'true') return;
      if (!table.tHead || table.tBodies.length === 0) return;
      if (table.closest('[data-no-table-enhance="true"]')) return;

      ensureSelectionColumn(table);

      const headRow = table.tHead.rows.item(0);
      if (!headRow) return;
      const headers = Array.from(headRow.cells);
      headers.forEach((header, index) => {
        if (index === 0) return; // selection column
        makeColumnSortable(table, header, index);
      });
      updateHeaderSortVisual(table);
    };

    const runEnhancer = () => {
      const tables = Array.from(document.querySelectorAll('main table')) as HTMLTableElement[];
      tables.forEach(enhanceTable);
    };

    runEnhancer();

    const observer = new MutationObserver(() => {
      runEnhancer();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  return null;
};

