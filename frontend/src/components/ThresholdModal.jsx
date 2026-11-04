import React, { useState } from 'react';
import { notificationApi } from '../api/notifications';
import { X, Sliders, Check, AlertCircle } from 'lucide-react';

export function ThresholdModal({ initialThreshold, onClose, onUpdated }) {
  const [threshold, setThreshold] = useState(initialThreshold || 10000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const num = Number(threshold);
    if (isNaN(num) || num < 0) {
      setError('Please enter a valid non-negative amount');
      return;
    }

    try {
      setSaving(true);
      await notificationApi.setThreshold(num);
      onUpdated(num);
    } catch (err) {
      setError(err.message || 'Failed to update alert threshold');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-base">Expense Alert Threshold</h3>
              <p className="text-xs text-slate-500">Trigger automatic notifications for large expenses</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Threshold Amount (INR ₹)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
              <input
                type="number"
                min="0"
                step="100"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="10000"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Whenever a single expense transaction exceeds ₹{Number(threshold || 0).toLocaleString('en-IN')}, an in-app notification is asynchronously generated via RabbitMQ.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            {[5000, 10000, 25000, 50000].map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setThreshold(quick)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition ${
                  Number(threshold) === quick
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                ₹{(quick / 1000)}k
              </button>
            ))}
          </div>

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
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              {saving ? 'Saving...' : (
                <>
                  <Check className="h-4 w-4" /> Save Threshold
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
