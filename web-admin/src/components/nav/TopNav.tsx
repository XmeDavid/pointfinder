"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/authStore";
import {
  LogOut,
  LayoutDashboard,
  Users,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/operators", label: "Operators", icon: Users },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return (
    <div className="w-full border-b border-gray-200 bg-white shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold text-gray-900">
            Admin Panel
          </Link>
          <nav className="hidden sm:flex items-center gap-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "text-blue-600 font-medium"
                      : "text-gray-600 hover:text-gray-900"
                  }
                >
                  <div className="flex items-center gap-2">
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
        <button
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
          onClick={() => {
            clearAuth();
            router.replace("/login");
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}


