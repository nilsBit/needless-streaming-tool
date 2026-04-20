import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'error-action';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
  details?: string;
}

export interface ErrorActionParams {
  message: string;
  action?: ToastAction;
  details?: string;
}

interface ToastContextType {
  toasts: ToastItem[];
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    errorAction: (params: ErrorActionParams) => void;
  };
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  toast: { success: () => {}, error: () => {}, info: () => {}, errorAction: () => {} },
});

const MAX_TOASTS = 3;
const TOAST_DURATION = 4000;
const TOAST_DURATION_ACTION = 8000; // longer so the user has time to click the action

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const pushToast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = ++idRef.current;
    const duration = item.type === 'error-action' ? TOAST_DURATION_ACTION : TOAST_DURATION;
    setToasts((prev) => {
      const next = [...prev, { ...item, id }];
      return next.slice(-MAX_TOASTS);
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const toast = {
    success: useCallback((msg: string) => pushToast({ message: msg, type: 'success' }), [pushToast]),
    error: useCallback((msg: string) => pushToast({ message: msg, type: 'error' }), [pushToast]),
    info: useCallback((msg: string) => pushToast({ message: msg, type: 'info' }), [pushToast]),
    errorAction: useCallback((params: ErrorActionParams) => pushToast({
      message: params.message,
      type: 'error-action',
      action: params.action,
      details: params.details,
    }), [pushToast]),
  };

  return (
    <ToastContext.Provider value={{ toasts, toast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
