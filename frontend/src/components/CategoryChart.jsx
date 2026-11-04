import React from 'react';
import { PieChart, Tag } from 'lucide-react';

const CATEGORY_COLORS = [
  'bg-emerald-500',
  'bg-indigo-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500'
];

export function CategoryChart({ categories = [], totalExpense = 0, loading }) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200/80 animate-pulse h-80" />
    );
  }

  const formatINR = (val) => {
    return Number(val || 0).toLocaleString('en-IN');
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200/80">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <PieChart className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Expense Breakdown by Category</h3>
            <p className="text-xs text-slate-500">Distribution of monthly expenditures</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
          {categories.length} Categories
        </span>
      </div>

      {categories.length === 0 ? (
        <div className="py-12 text-center">
          <div className="h-10 w-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
            <Tag className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium text-slate-600">No expense data for this month</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Add an expense transaction to view category insights.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Multi-segment visual bar */}
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
            {categories.map((cat, idx) => (
              <div
                key={cat.category}
                style={{ width: `${Math.max(cat.percentage, 2)}%` }}
                className={`${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} transition-all duration-500 hover:opacity-80`}
                title={`${cat.category}: ₹${formatINR(cat.amount)} (${cat.percentage}%)`}
              />
            ))}
          </div>

          {/* Category detail list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {categories.map((cat, idx) => {
              const colorClass = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
              return (
                <div
                  key={cat.category}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-3 w-3 rounded-full shrink-0 ${colorClass}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {cat.category}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {cat.count} {cat.count === 1 ? 'transaction' : 'transactions'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-slate-900">
                      ₹{formatINR(cat.amount)}
                    </p>
                    <p className="text-[10px] font-semibold text-emerald-600">
                      {cat.percentage}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
