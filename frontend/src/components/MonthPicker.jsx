import React from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

export function MonthPicker({ currentMonth, onMonthChange }) {
  const [yearStr, monthStr] = currentMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const handlePrev = () => {
    let newYear = year;
    let newMonth = month - 1;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    const formatted = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    onMonthChange(formatted);
  };

  const handleNext = () => {
    let newYear = year;
    let newMonth = month + 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    const formatted = `${newYear}-${String(newMonth).padStart(2, '0')}`;
    onMonthChange(formatted);
  };

  const dateObj = new Date(Date.UTC(year, month - 1, 1));
  const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
      <Calendar className="h-4 w-4 text-emerald-600 shrink-0" />
      <button
        onClick={handlePrev}
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        title="Previous Month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="relative">
        <input
          type="month"
          value={currentMonth}
          onChange={(e) => e.target.value && onMonthChange(e.target.value)}
          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
        />
        <span className="text-xs font-semibold text-slate-800 cursor-pointer select-none">
          {monthLabel}
        </span>
      </div>

      <button
        onClick={handleNext}
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
        title="Next Month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
