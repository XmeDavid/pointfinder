"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/authStore";

export default function Home() {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();

  useEffect(() => {
    if (token) router.replace("/dashboard");
    else router.replace("/login");
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold mb-2">Loading...</h1>
        <p className="text-sm text-gray-600">Redirecting to admin panel</p>
      </div>
    </div>
  );
}
