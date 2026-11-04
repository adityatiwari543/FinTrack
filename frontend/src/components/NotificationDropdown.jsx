import React from 'react';
import { Bell, Check, AlertTriangle, X } from 'lucide-react';

export function NotificationDropdown({ notifications, unreadCount, onClose, onMarkAsRead, onRefresh }) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/10 z-50 overflow-hidden divide-y divide-slate-100">
        <div className="p-3.5 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-slate-800">Alerts & Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                {unreadCount} unread
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <div className="h-10 w-10 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                <Bell className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium text-slate-600">No notifications yet</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Expenses exceeding your alert threshold will trigger notifications automatically.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 transition flex items-start gap-3 ${
                  !item.isRead ? 'bg-amber-50/50' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className={`mt-0.5 rounded-lg p-1.5 ${
                  !item.isRead ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  <AlertTriangle className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 leading-snug">
                    {item.message}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.createdAt).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>

                    {!item.isRead && (
                      <button
                        onClick={() => onMarkAsRead(item.id)}
                        className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1 hover:underline"
                      >
                        <Check className="h-3 w-3" /> Mark read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-2.5 bg-slate-50 text-center">
          <p className="text-[11px] text-slate-500">
            Powered by asynchronous RabbitMQ events
          </p>
        </div>
      </div>
    </>
  );
}
