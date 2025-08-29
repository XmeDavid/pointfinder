"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewGamePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard where game creation is handled via modal
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}


