"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  show: (type: ToastType, message: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside <ToastProvider>");
  return v;
}

let _id = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((type: ToastType, message: string) => {
    const id = ++_id;
    setItems((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[300] flex flex-col gap-2 pointer-events-none">
        {items.map((t) => {
          const icon = t.type === "success" ? "✅" : t.type === "error" ? "❌" : "ℹ️";
          const borderClass =
            t.type === "success"
              ? "border-l-emerald-500"
              : t.type === "error"
              ? "border-l-red-500"
              : "border-l-blue-500";
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-lg bg-[#111827] border border-white/[0.06] ${borderClass} border-l-[3px] shadow-2xl text-sm min-w-[300px] animate-[toastIn_300ms_ease]`}
            >
              <span className="text-xl">{icon}</span>
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
      <style jsx global>{`
        @keyframes toastIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </Ctx.Provider>
  );
}
