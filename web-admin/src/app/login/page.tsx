"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useAuthStore } from "@/lib/authStore";
import { api } from "@/lib/apiClient";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError("Invalid credentials");
      return;
    }
    setLoading(true);
    try {
      const res = (await api.post("api/auth/login", { json: { email, password } }).json()) as {
        token: string;
        user: { id: string; email: string; role: string };
      };
      const token = res?.token;
      const user = res?.user;
      if (!token) throw new Error("No token received");
      setAuth(token, { id: user?.id ?? "admin", email: user?.email, role: user?.role as "admin" | "operator" | "viewer" });
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError((err as Error)?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-background border rounded-lg p-6 space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold">Admin Login</h1>
          <p className="text-sm text-foreground/70">Use your admin credentials</p>
        </div>
        <div className="space-y-1">
          <label className="text-sm">Email</label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2 bg-transparent"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm">Password</label>
          <input
            type="password"
            className="w-full border rounded px-3 py-2 bg-transparent"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-foreground text-background rounded py-2 disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}


