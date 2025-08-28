import { MapPin, CheckCircle, Clock, XCircle, Users, Trophy } from "lucide-react";

interface Team {
  id: string;
  name: string;
  members: string[];
  leaderDeviceId: string;
  lastLocation?: {
    latitude: number;
    longitude: number;
    timestamp: string;
  };
  progress: Array<{
    baseId: string;
    baseName: string;
    arrivedAt?: string;
    solvedAt?: string;
    completedAt?: string;
    score: number;
  }>;
}

interface Base {
  id: string;
  displayName: string;
  latitude: number;
  longitude: number;
}

interface TeamProgressTableProps {
  teams: Team[];
  bases: Base[];
}

export default function TeamProgressTable({ teams, bases }: TeamProgressTableProps) {
  const getProgressStatus = (progress: Team["progress"][0]) => {
    if (progress.completedAt) return "completed";
    if (progress.solvedAt) return "solved";
    if (progress.arrivedAt) return "arrived";
    return "not-started";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "solved":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case "arrived":
        return <MapPin className="w-4 h-4 text-blue-600" />;
      case "not-started":
        return <XCircle className="w-4 h-4 text-gray-400" />;
      default:
        return <XCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "solved":
        return "bg-yellow-100 text-yellow-800";
      case "arrived":
        return "bg-blue-100 text-blue-800";
      case "not-started":
        return "bg-gray-100 text-gray-500";
      default:
        return "bg-gray-100 text-gray-500";
    }
  };

  const calculateTeamScore = (team: Team) => {
    return team.progress.reduce((sum, p) => sum + p.score, 0);
  };

  const calculateTeamProgress = (team: Team) => {
    const completed = team.progress.filter(p => p.completedAt).length;
    return Math.round((completed / bases.length) * 100);
  };

  const isTeamActive = (team: Team) => {
    if (!team.lastLocation) return false;
    const lastSeen = new Date(team.lastLocation.timestamp).getTime();
    return Date.now() - lastSeen < 5 * 60 * 1000; // Active in last 5 minutes
  };

  if (teams.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">No teams have joined yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Team
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Members
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Progress
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Score
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            {bases.map((base) => (
              <th key={base.id} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                {base.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {teams.map((team) => {
            const teamScore = calculateTeamScore(team);
            const teamProgress = calculateTeamProgress(team);
            const isActive = isTeamActive(team);

            return (
              <tr key={team.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-8 w-8">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-sm font-medium text-white">
                          {team.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{team.name}</div>
                      <div className="text-sm text-gray-500">Leader: {team.leaderDeviceId.slice(0, 8)}...</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {team.members.length} members
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 mr-3">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${teamProgress}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-900">{teamProgress}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Trophy className="w-4 h-4 text-yellow-600 mr-1" />
                    <span className="text-sm font-medium text-gray-900">{teamScore}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                  }`}>
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                {bases.map((base) => {
                  const progress = team.progress.find(p => p.baseId === base.id);
                  const status = progress ? getProgressStatus(progress) : "not-started";
                  
                  return (
                    <td key={base.id} className="px-3 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center">
                        {getStatusIcon(status)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
