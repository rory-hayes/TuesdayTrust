import type { ReactNode } from 'react';

import {
  Table as CatalystTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../catalyst/table';
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
    <CatalystTable className={cn('rounded-xl border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900', className)} grid>
      <TableHead>
        <TableRow>
          {columns.map((column) => (
            <TableHeader className={cn('text-xs uppercase tracking-wide text-zinc-500', column.className)} key={column.key}>
              {column.header}
            </TableHeader>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={getRowKey(row)}>
            {columns.map((column) => (
              <TableCell className={cn('align-top text-zinc-900 dark:text-zinc-100', column.className)} key={column.key}>
                {column.render ? column.render(row) : (row as Record<string, ReactNode>)[column.key]}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </CatalystTable>
  );
}
