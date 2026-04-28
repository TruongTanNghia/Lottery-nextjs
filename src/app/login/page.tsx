"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Đang tải...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const j = await res.json();
      if (res.ok && j.status === "success") {
        const from = params.get("from") || "/";
        router.push(from);
        router.refresh();
      } else {
        setError(j.detail ?? "Đăng nhập thất bại");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(ellipse 800px 600px at 30% 20%, rgba(59,130,246,0.08), transparent 60%), radial-gradient(ellipse 600px 400px at 70% 80%, rgba(139,92,246,0.06), transparent 60%), #0a0e17",
      }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2 drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]">🎯</div>
          <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-br from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Lottery Limit Manager
          </h1>
          <p className="text-xs uppercase tracking-wider text-slate-500 mt-1">
            Quản Lý Hạn Mức Lô 3 Miền
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-[#111827] border border-white/[0.06] p-6 md:p-8 space-y-4 shadow-2xl"
        >
          <h2 className="text-base font-bold mb-1">Đăng nhập</h2>
          <p className="text-xs text-slate-400 mb-4">Nhập tài khoản admin để truy cập.</p>

          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1 block">Tài khoản</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              placeholder="admin"
              className="w-full px-3 py-2.5 rounded-lg bg-[#0f1623] border border-[#1f2937] text-slate-100 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1 block">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••"
              className="w-full px-3 py-2.5 rounded-lg bg-[#0f1623] border border-[#1f2937] text-slate-100 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white font-semibold text-sm shadow-[0_2px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_4px_20px_rgba(59,130,246,0.5)] disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
          >
            {loading ? "⏳ Đang đăng nhập..." : "Đăng nhập"}
          </button>

          <p className="text-[0.65rem] text-slate-500 text-center pt-2">
            Session 30 ngày — Logout bất kỳ lúc nào ở header.
          </p>
        </form>
      </div>
    </div>
  );
}
