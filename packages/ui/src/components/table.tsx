import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

export type TableColumn<T> = {
  header: string;
  key: string;
  render?: (row: T) => ReactNode;
  className?: string;
};

export type TableProps<T> = {
  columns: Array<TableColumn<T>>;
  rows: T[];
  getRowKey: (row: T) => string;
  className?: string;
};

export function Table<T>({ columns, rows, getRowKey, className }: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)]', className)}>
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--eq-color-border)] bg-[var(--eq-color-surface-alt)]">
            {columns.map((column) => (
              <th
                className={cn('px-4 py-3 font-medium text-[var(--eq-color-fg-muted)]', column.className)}
                key={column.key}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-[var(--eq-color-border)] last:border-0" key={getRowKey(row)}>
              {columns.map((column) => (
                <td className={cn('px-4 py-3 text-[var(--eq-color-fg)]', column.className)} key={column.key}>
                  {column.render ? column.render(row) : (row as Record<string, ReactNode>)[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
