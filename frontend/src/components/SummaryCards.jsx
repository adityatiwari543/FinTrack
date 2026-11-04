import React from 'react';
import { ArrowUpRight, ArrowDownRight, Scale, TrendingUp, TrendingDown } from 'lucide-react';

export function SummaryCards({ summary, loading }) {
  const { totalIncome = 0, totalExpense = 0, balance = 0, month } = summary || {};

  const formatINR = (val) => {
    return Number(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const savingsRate = totalIncome > 0
    ? Math.max(0, Math.min(100, Math.round((balance / totalIncome) * 100)))
    : 0;

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-32 rounded-2xl bg-white p-6 shadow-sm border border-slate-200/80 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Total Income */}
      <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm border border-slate-200/80 transition hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Income</span>
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold tracking-tight text-slate-900">
            ₹{formatINR(totalIncome)}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-emerald-600 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" /> For {month}
          </p>
        </div>
      </div>

      {/* Total Expenses */}
      <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm border border-slate-200/80 transition hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Expenses</span>
          <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
            <ArrowDownRight className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold tracking-tight text-slate-900">
            ₹{formatINR(totalExpense)}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1">
            <TrendingDown className="h-3.5 w-3.5" /> Outflow in {month}
          </p>
        </div>
      </div>

      {/* Net Balance */}
      <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm border border-slate-200/80 transition hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net Balance</span>
          <div className={`p-2 rounded-xl ${balance >= 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
            <Scale className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className={`text-2xl font-bold tracking-tight ${balance >= 0 ? 'text-indigo-600' : 'text-amber-600'}`}>
            ₹{formatINR(balance)}
          </h3>
          <p className="mt-1 text-[11px] font-medium text-slate-500">
            Savings rate: <span className="font-semibold text-slate-700">{savingsRate}%</span>
          </p>
        </div>
      </div>
    </div>
  );
}
