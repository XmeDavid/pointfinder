"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/authStore";
import {
  LogOut,
  Map as MapIcon,
  LayoutDashboard,
  Users,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/games/new", label: "New Game", icon: MapIcon },
  { href: "/teams", label: "Teams", icon: Users },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return (
    <div className="w-full border-b bg-background">
      <div className="max-w-6xl mx-auto flex items-center justify-between p-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold">
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
                      ? "text-foreground font-medium"
                      : "text-foreground/70 hover:text-foreground"
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
          className="text-sm text-foreground/80 hover:text-foreground flex items-center gap-2"
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


