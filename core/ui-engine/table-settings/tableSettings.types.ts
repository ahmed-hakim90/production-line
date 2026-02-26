import type React from 'react';

export type TableColumnWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const TABLE_WIDTH_CLASS: Record<TableColumnWidth, string> = {
  xs: 'w-24',
  sm: 'w-32',
  md: 'w-44',
  lg: 'w-56',
  xl: 'w-72',
};

export interface TableColumnDefinition<T> {
  id: string;
  header: string;
  accessor: (row: T) => unknown;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  visible?: boolean;
  width?: TableColumnWidth;
}

export interface TableColumnSettings {
  id: string;
  visible: boolean;
  width: TableColumnWidth;
  order: number;
}

export interface UserTableSettingsDocument {
  [tableId: string]: {
    columns: TableColumnSettings[];
    updatedAt?: unknown;
  };
}
