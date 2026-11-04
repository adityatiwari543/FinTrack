import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { notificationApi } from '../api/notifications';
import { NotificationDropdown } from './NotificationDropdown';
import { ThresholdModal } from './ThresholdModal';
import { Wallet, Bell, Sliders, LogOut, User as UserIcon } from 'lucide-react';

export function Navbar({ onRefreshNeeded }) {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isThresholdOpen, setIsThresholdOpen] = useState(false);
  const [currentThreshold, setCurrentThreshold] = useState(10000);

  const fetchNotifications = async () => {
    try {
      const data = await notificationApi.getNotifications();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      // silently handle
    }
  };

  const fetchThreshold = async () => {
    try {
      const data = await notificationApi.getThreshold();
      setCurrentThreshold(data.threshold || 10000);
    } catch (err) {
      // silently handle
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      fetchThreshold();
      const interval = setInterval(fetchNotifications, 10000); // 10s poll for async alerts
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleMarkAsRead = async (id) => {
    try {
      await notificationApi.markAsRead(id);
      fetchNotifications();
    } catch (err) {
      console.error('Error marking as read', err);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shadow-emerald-500/20">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">FinTrack</span>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                Microservices
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">Personal Finance & Real-time Alerting</p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Threshold config button */}
          <button
            onClick={() => setIsThresholdOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            title="Configure expense alert threshold"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Alert Threshold:</span>
            <span className="font-semibold text-slate-900">₹{Number(currentThreshold).toLocaleString('en-IN')}</span>
          </button>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <NotificationDropdown
                notifications={notifications}
                unreadCount={unreadCount}
                onClose={() => setIsNotifOpen(false)}
                onMarkAsRead={handleMarkAsRead}
                onRefresh={fetchNotifications}
              />
            )}
          </div>

          {/* User profile & logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-semibold text-xs">
              {user?.name?.charAt(0).toUpperCase() || <UserIcon className="h-4 w-4" />}
            </div>
            <div className="hidden lg:block text-left text-xs">
              <p className="font-semibold text-slate-800 leading-tight">{user?.name}</p>
              <p className="text-slate-500 truncate max-w-[120px]">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>

    {isThresholdOpen && (
      <ThresholdModal
        initialThreshold={currentThreshold}
        onClose={() => setIsThresholdOpen(false)}
        onUpdated={(val) => {
          setCurrentThreshold(val);
          setIsThresholdOpen(false);
        }}
      />
    )}
  </>
  );
}
