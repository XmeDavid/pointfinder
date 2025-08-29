"use client";

import { useState } from "react";
import { Users, MapPin, CheckCircle, Clock, Award, Eye } from "lucide-react";

interface Team {
  id: string;
  name: string;
  number: number;
  inviteCode: string;
  members: string[];
  leaderId?: string;
  createdAt: string;
}

interface Base {
  id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  uuid: string;
  isLocationDependent: boolean;
  nfcLinked: boolean;
  enigmaId?: string;
}

interface TeamProgress {
  teamId: string;
  completedBases: string[];
  currentBase?: string;
  lastActivity: string;
  totalTime?: number; // in minutes
  score?: number;
}

interface TeamProgressTableProps {
  teams: Team[];
  bases: Base[];
  teamProgress: TeamProgress[];
  onViewTeam: (team: Team) => void;
}

export default function TeamProgressTable({
  teams,
  bases,
  teamProgress,
  onViewTeam,
}: TeamProgressTableProps) {
  const [sortBy, setSortBy] = useState<"name" | "progress" | "time" | "score">("progress");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const getTeamProgress = (teamId: string): TeamProgress | undefined => {
    return teamProgress.find(progress => progress.teamId === teamId);
  };

  const getProgressPercentage = (teamId: string): number => {
    const progress = getTeamProgress(teamId);
    if (!progress) return 0;
    return Math.round((progress.completedBases.length / bases.length) * 100);
  };

  const getTeamStatus = (teamId: string): "active" | "completed" | "waiting" => {
    const progress = getTeamProgress(teamId);
    if (!progress) return "waiting";
    if (progress.completedBases.length === bases.length) return "completed";
    return "active";
  };

  const getStatusIcon = (status: "active" | "completed" | "waiting") => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "active":
        return <Clock className="w-4 h-4 text-blue-600" />;
      case "waiting":
        return <Users className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: "active" | "completed" | "waiting") => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "active":
        return "bg-blue-100 text-blue-800";
      case "waiting":
        return "bg-gray-100 text-gray-800";
    }
  };

  const sortedTeams = [...teams].sort((a, b) => {
    let aValue: number | string;
    let bValue: number | string;

    switch (sortBy) {
      case "name":
        aValue = a.name;
        bValue = b.name;
        break;
      case "progress":
        aValue = getProgressPercentage(a.id);
        bValue = getProgressPercentage(b.id);
        break;
      case "time":
        const aProgress = getTeamProgress(a.id);
        const bProgress = getTeamProgress(b.id);
        aValue = aProgress?.totalTime || 0;
        bValue = bProgress?.totalTime || 0;
        break;
      case "score":
        const aScore = getTeamProgress(a.id)?.score || 0;
        const bScore = getTeamProgress(b.id)?.score || 0;
        aValue = aScore;
        bValue = bScore;
        break;
      default:
        aValue = 0;
        bValue = 0;
    }

    if (sortOrder === "asc") {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const handleSort = (column: "name" | "progress" | "time" | "score") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  const formatTime = (minutes?: number): string => {
    if (!minutes) return "N/A";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatLastActivity = (timestamp: string): string => {
    const now = new Date();
    const activity = new Date(timestamp);
    const diffMs = now.getTime() - activity.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Team Progress</h3>
        <p className="text-sm text-gray-600 mt-1">
          Track team progress and completion status
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  onClick={() => handleSort("name")}
                  className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                >
                  Team
                  {sortBy === "name" && (
                    <span className="text-blue-600">
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  onClick={() => handleSort("progress")}
                  className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                >
                  Progress
                  {sortBy === "progress" && (
                    <span className="text-blue-600">
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  onClick={() => handleSort("time")}
                  className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                >
                  Time
                  {sortBy === "time" && (
                    <span className="text-blue-600">
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button
                  onClick={() => handleSort("score")}
                  className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                >
                  Score
                  {sortBy === "score" && (
                    <span className="text-blue-600">
                      {sortOrder === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Activity
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedTeams.map((team) => {
              const progress = getTeamProgress(team.id);
              const progressPercentage = getProgressPercentage(team.id);
              const status = getTeamStatus(team.id);
              const completedBases = progress?.completedBases.length || 0;

              return (
                <tr key={team.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-blue-600">
                            #{team.number}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {team.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {team.members.length} members
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-1 mr-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progressPercentage}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-900 font-medium">
                        {completedBases}/{bases.length}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {progressPercentage}% complete
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatTime(progress?.totalTime)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center gap-1">
                      <Award className="w-4 h-4 text-yellow-500" />
                      {progress?.score || 0} pts
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                      {getStatusIcon(status)}
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {progress?.lastActivity ? formatLastActivity(progress.lastActivity) : "Never"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => onViewTeam(team)}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {teams.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No teams found</p>
          <p className="text-sm text-gray-500 mt-1">
            Teams will appear here once they join the game
          </p>
        </div>
      )}
    </div>
  );
}
