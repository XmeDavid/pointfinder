"use client";

import { Users, Shield, Play, Settings, CheckCircle, Clock } from "lucide-react";

interface StatsOverviewProps {
  totalGames: number;
  activeGames: number;
  setupGames: number;
  finishedGames: number;
  totalOperators?: number;
  activeOperators?: number;
  pendingOperators?: number;
}

export default function StatsOverview({
  totalGames,
  activeGames,
  setupGames,
  finishedGames,
  totalOperators,
  activeOperators,
  pendingOperators,
}: StatsOverviewProps) {
  const stats = [
    {
      name: "Total Games",
      value: totalGames,
      icon: Shield,
      color: "bg-blue-500",
      textColor: "text-blue-600",
    },
    {
      name: "Live Games",
      value: activeGames,
      icon: Play,
      color: "bg-green-500",
      textColor: "text-green-600",
    },
    {
      name: "In Setup",
      value: setupGames,
      icon: Settings,
      color: "bg-yellow-500",
      textColor: "text-yellow-600",
    },
    {
      name: "Completed",
      value: finishedGames,
      icon: CheckCircle,
      color: "bg-purple-500",
      textColor: "text-purple-600",
    },
  ];

  // Add operator stats if provided (admin view)
  if (totalOperators !== undefined) {
    stats.unshift(
      {
        name: "Total Operators",
        value: totalOperators,
        icon: Users,
        color: "bg-indigo-500",
        textColor: "text-indigo-600",
      },
      {
        name: "Active Operators",
        value: activeOperators || 0,
        icon: Users,
        color: "bg-emerald-500",
        textColor: "text-emerald-600",
      },
      {
        name: "Pending Invites",
        value: pendingOperators || 0,
        icon: Clock,
        color: "bg-orange-500",
        textColor: "text-orange-600",
      }
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6 mb-8">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.name}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center">
              <div className={`p-2 rounded-lg ${stat.color} bg-opacity-10`}>
                <Icon className={`w-6 h-6 ${stat.textColor}`} />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
