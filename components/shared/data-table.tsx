"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-media-query";

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  emptyMessage?: string;
};

function isActionsColumn<TData>(column: ColumnDef<TData, unknown>): boolean {
  const id = "id" in column ? column.id : undefined;
  const accessorKey =
    "accessorKey" in column ? String(column.accessorKey) : undefined;
  if (id === "actions" || accessorKey === "actions") return true;
  if (typeof column.header === "string" && column.header.trim() === "") {
    return true;
  }
  return false;
}

function MobileCardList<TData>({
  rows,
  emptyMessage,
}: {
  rows: Row<TData>[];
  emptyMessage: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const cells = row.getVisibleCells();
        const actionCells = cells.filter((cell) =>
          isActionsColumn(cell.column.columnDef)
        );
        const contentCells = cells.filter(
          (cell) => !isActionsColumn(cell.column.columnDef)
        );
        const titleCell = contentCells[0];
        const metaCells = contentCells.slice(1);

        return (
          <div
            key={row.id}
            className="space-y-3 rounded-2xl border bg-card px-4 py-3"
          >
            {titleCell ? (
              <div className="text-base font-medium">
                {flexRender(
                  titleCell.column.columnDef.cell,
                  titleCell.getContext()
                )}
              </div>
            ) : null}
            {metaCells.length ? (
              <dl className="grid gap-2 text-sm">
                {metaCells.map((cell) => {
                  const header = cell.column.columnDef.header;
                  const label =
                    typeof header === "string"
                      ? header
                      : cell.column.id.replace(/_/g, " ");
                  return (
                    <div
                      key={cell.id}
                      className="flex items-start justify-between gap-3"
                    >
                      <dt className="shrink-0 text-muted-foreground capitalize">
                        {label}
                      </dt>
                      <dd className="min-w-0 text-right">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : null}
            {actionCells.length ? (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                {actionCells.map((cell) => (
                  <div key={cell.id} className="min-w-0">
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function DataTable<TData>({
  columns,
  data,
  emptyMessage = "No results.",
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const isMobile = useIsMobile();

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = Math.max(table.getPageCount(), 1);
  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      {isMobile ? (
        <MobileCardList rows={rows} emptyMessage={emptyMessage} />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Page {pageIndex + 1} of {pageCount}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
