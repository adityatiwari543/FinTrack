import React from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  Edit2,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  Receipt
} from 'lucide-react';

export function TransactionList({
  transactions = [],
  pagination = {},
  loading,
  filterType,
  filterCategory,
  onFilterTypeChange,
  onFilterCategoryChange,
  onPageChange,
  onEdit,
  onDelete
}) {
  const { total = 0, page = 1, totalPages = 1 } = pagination;

  const formatINR = (val) => {
    return Number(val || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2
    });
  };

  const formatDate = (isoString) => {
    try {
      return new Date(isoString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200/80 overflow-hidden">
      {/* Header & Filters */}
      <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Transaction History</h3>
          <p className="text-xs text-slate-500">
            Showing {transactions.length} of {total} transactions
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {['all', 'income', 'expense'].map((t) => (
              <button
                key={t}
                onClick={() => onFilterTypeChange(t === 'all' ? '' : t)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition ${
                  (filterType === t || (t === 'all' && !filterType))
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1 rounded-xl">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={filterCategory}
              onChange={(e) => onFilterCategoryChange(e.target.value)}
              placeholder="Filter category..."
              className="text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none w-28 sm:w-36"
            />
          </div>
        </div>
      </div>

      {/* Table / List */}
      {loading ? (
        <div className="p-8 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="py-16 text-center">
          <div className="h-12 w-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <Receipt className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-700">No transactions found</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Try adjusting your search filters or click "Record Transaction" to add an entry.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100">
                <th className="py-3 px-5">Type</th>
                <th className="py-3 px-5">Category & Note</th>
                <th className="py-3 px-5">Date</th>
                <th className="py-3 px-5 text-right">Amount</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => {
                const isIncome = tx.type === 'income';
                return (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold capitalize ${
                        isIncome
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                      }`}>
                        {isIncome ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {tx.type}
                      </span>
                    </td>

                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-slate-900">{tx.category}</p>
                      {tx.note && (
                        <p className="text-[11px] text-slate-400 truncate max-w-xs">{tx.note}</p>
                      )}
                    </td>

                    <td className="py-3.5 px-5 text-slate-500">
                      {formatDate(tx.date)}
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      <span className={`font-bold text-sm ${isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {isIncome ? '+' : '-'}₹{formatINR(tx.amount)}
                      </span>
                    </td>

                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onEdit(tx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                          title="Edit transaction"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(tx.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Delete transaction"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Page <strong className="text-slate-800">{page}</strong> of <strong className="text-slate-800">{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
