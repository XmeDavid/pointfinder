import { Trophy, Play, Settings, Clock } from "lucide-react";

interface StatsOverviewProps {
  totalGames: number;
  activeGames: number;
  setupGames: number;
  finishedGames: number;
}

export default function StatsOverview({ 
  totalGames, 
  activeGames, 
  setupGames, 
  finishedGames 
}: StatsOverviewProps) {
  const stats = [
    {
      name: "Total Games",
      value: totalGames,
      icon: Trophy,
      color: "bg-blue-500",
      textColor: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      name: "Live Games",
      value: activeGames,
      icon: Play,
      color: "bg-green-500",
      textColor: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      name: "In Setup",
      value: setupGames,
      icon: Settings,
      color: "bg-yellow-500",
      textColor: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      name: "Completed",
      value: finishedGames,
      icon: Clock,
      color: "bg-purple-500",
      textColor: "text-purple-600",
      bgColor: "bg-purple-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.name}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
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
