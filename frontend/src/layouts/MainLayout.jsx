import React from 'react';

export function MainLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {children}
    </div>
  );
}
