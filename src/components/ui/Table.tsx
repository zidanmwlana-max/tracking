import React from 'react';

export const TableContainer: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`w-full overflow-x-auto border border-[#E2E8F0] rounded-[10px] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <table className={`w-full text-left border-collapse ${className}`} {...props}>
      {children}
    </table>
  );
};

export const TableHead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <thead className={`bg-[#F1F5F9] sticky top-0 z-10 ${className}`} {...props}>
      {children}
    </thead>
  );
};

export const TableHeaderCell: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <th
      className={`px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-[#475569] border-b border-[#E2E8F0] whitespace-nowrap ${className}`}
      {...props}
    >
      {children}
    </th>
  );
};

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <tbody className={`divide-y divide-[#E2E8F0] bg-white ${className}`} {...props}>
      {children}
    </tbody>
  );
};

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <tr
      className={`hover:bg-[#F8FAFC] transition-colors duration-150 ease-out ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
};

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <td
      className={`px-4 py-3 text-sm text-[#0F172A] align-middle whitespace-nowrap ${className}`}
      {...props}
    >
      {children}
    </td>
  );
};

export interface TablePaginationProps {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50]
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="px-4 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#475569]">
      <div className="flex items-center gap-3">
        <span>
          Menampilkan <strong className="font-mono tabular-nums text-[#0F172A]">{startIdx}</strong>–
          <strong className="font-mono tabular-nums text-[#0F172A]">{endIdx}</strong> dari{' '}
          <strong className="font-mono tabular-nums text-[#0F172A]">{totalItems}</strong> baris
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span>Baris:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="bg-white border border-[#CBD5E1] rounded-[6px] px-2 py-1 text-xs font-mono text-[#0F172A] focus:outline-none focus:border-[#073E7F]"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / hal
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="px-2.5 py-1 rounded-[6px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] disabled:opacity-40 text-xs font-semibold text-[#0F172A] cursor-pointer disabled:cursor-not-allowed"
        >
          Sebelumnya
        </button>
        <span className="px-2.5 py-1 font-mono tabular-nums font-semibold text-[#0F172A]">
          Hal {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="px-2.5 py-1 rounded-[6px] border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] disabled:opacity-40 text-xs font-semibold text-[#0F172A] cursor-pointer disabled:cursor-not-allowed"
        >
          Selanjutnya
        </button>
      </div>
    </div>
  );
};
