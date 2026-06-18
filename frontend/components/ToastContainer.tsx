'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToast, ToastType } from '@/lib/toast-context';

const config: Record<ToastType, { icon: React.ComponentType<{ className?: string }>; border: string; iconColor: string; bg: string }> = {
  success: {
    icon: CheckCircle,
    border: 'border-l-green-500',
    iconColor: 'text-green-500',
    bg: 'bg-white',
  },
  error: {
    icon: XCircle,
    border: 'border-l-red-500',
    iconColor: 'text-red-500',
    bg: 'bg-white',
  },
  info: {
    icon: Info,
    border: 'border-l-blue-500',
    iconColor: 'text-blue-500',
    bg: 'bg-white',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-l-yellow-500',
    iconColor: 'text-yellow-500',
    bg: 'bg-white',
  },
};

function ToastItem({ id, message, type }: { id: string; message: string; type: ToastType }) {
  const { removeToast } = useToast();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Trigger enter animation on next frame
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => removeToast(id), 200);
  };

  const { icon: Icon, border, iconColor, bg } = config[type];

  return (
    <div
      className={`
        flex items-start gap-3 pl-4 pr-3 py-3 rounded-lg shadow-lg border border-slate-200 border-l-4
        ${border} ${bg}
        transition-all duration-200 ease-out
        ${visible && !exiting ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}
      `}
      role="alert"
    >
      <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
      <p className="flex-1 text-sm text-slate-700 leading-snug">{message}</p>
      <button
        onClick={handleClose}
        className="flex-shrink-0 p-1 rounded-md hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} id={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  );
}
