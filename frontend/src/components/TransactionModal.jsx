import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const COMMON_EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Rent & Housing',
  'Shopping',
  'Transportation',
  'Utilities & Bills',
  'Entertainment',
  'Healthcare',
  'Travel',
  'Education',
  'Miscellaneous'
];

const COMMON_INCOME_CATEGORIES = [
  'Salary',
  'Freelance / Consulting',
  'Investments / Dividends',
  'Rental Income',
  'Bonus',
  'Gifts',
  'Other Income'
];

export function TransactionModal({ isOpen, onClose, onSave, transaction = null }) {
  const isEdit = Boolean(transaction && transaction.id);

  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (transaction) {
      setType(transaction.type || 'expense');
      setAmount(transaction.amount ? String(transaction.amount) : '');
      setCategory(transaction.category || '');
      setDate(transaction.date ? transaction.date.split('T')[0] : new Date().toISOString().split('T')[0]);
      setNote(transaction.note || '');
    } else {
      setType('expense');
      setAmount('');
      setCategory(COMMON_EXPENSE_CATEGORIES[0]);
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
    }
    setError('');
  }, [transaction, isOpen]);

  const categoryPresets = type === 'expense' ? COMMON_EXPENSE_CATEGORIES : COMMON_INCOME_CATEGORIES;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a positive transaction amount');
      return;
    }

    const amountStr = String(amount).trim();
    if (amountStr.includes('.')) {
      const decimals = amountStr.split('.')[1];
      if (decimals && decimals.length > 2) {
        setError('Amount cannot have more than 2 decimal places');
        return;
      }
    }

    if (!category.trim()) {
      setError('Please select or specify a category');
      return;
    }

    try {
      setSubmitting(true);
      await onSave({
        type,
        amount: parsedAmount,
        category: category.trim(),
        date: new Date(date).toISOString(),
        note: note.trim()
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-auto">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-base">
              {isEdit ? 'Edit Transaction' : 'Record New Transaction'}
            </h3>
            <p className="text-xs text-slate-500">Track your cash inflows and outflows</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type Toggle: Income vs Expense */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Transaction Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('income');
                  if (!isEdit) setCategory(COMMON_INCOME_CATEGORIES[0]);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition ${
                  type === 'income'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" /> Income
              </button>

              <button
                type="button"
                onClick={() => {
                  setType('expense');
                  if (!isEdit) setCategory(COMMON_EXPENSE_CATEGORIES[0]);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition ${
                  type === 'expense'
                    ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                <ArrowDownRight className="h-4 w-4" /> Expense
              </button>
            </div>
          </div>

          {/* Amount (INR ₹) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Amount (INR ₹)
              </label>
              <span className="text-[11px] text-slate-400">Step: ₹50</span>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
              <input
                type="number"
                min="0"
                step="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-base"
                placeholder="500"
                required
              />
            </div>
            {/* Quick adjust chips */}
            <div className="flex items-center gap-1.5 mt-2">
              {[50, 100, 500, 1000].map((increment) => (
                <button
                  key={increment}
                  type="button"
                  onClick={() => {
                    const current = Number(amount) || 0;
                    setAmount(String(current + increment));
                  }}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium transition"
                  title={`Add ₹${increment}`}
                >
                  +₹{increment}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount('')}
                className="px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600 text-xs font-medium ml-auto transition"
                title="Clear amount"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Category
            </label>
            <div className="flex gap-2">
              <select
                value={categoryPresets.includes(category) ? category : 'custom'}
                onChange={(e) => {
                  if (e.target.value !== 'custom') setCategory(e.target.value);
                }}
                className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {categoryPresets.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="custom">-- Custom Category --</option>
              </select>
            </div>
            {!categoryPresets.includes(category) && (
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Type custom category name..."
                className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Note (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Flight tickets to Mumbai"
              maxLength={500}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Buttons */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              {submitting ? 'Saving...' : (
                <>
                  <Check className="h-4 w-4" /> {isEdit ? 'Save Changes' : 'Record Transaction'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
