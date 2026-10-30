"use client";

import { useState } from "react";
import Link from "next/link";
import { requestResetAction } from "./actions";


export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await requestResetAction(email);
    setLoading(false);
    setInfo(res.message);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800">Lupa Password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Masukkan alamat email akun Anda untuk mendapatkan tautan pemulihan kata sandi.
        </p>

        {info ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {info}
            </div>
            <Link
              href="/login"
              className="block text-center text-sm font-semibold text-emerald-600 hover:underline"
            >
              Kembali ke Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Email Akun</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@apotek.local"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Mengirim..." : "Kirim Tautan Reset"}
            </button>
            <div className="text-center">
              <Link href="/login" className="text-xs text-slate-500 hover:underline">
                Ingat password? Masuk
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
