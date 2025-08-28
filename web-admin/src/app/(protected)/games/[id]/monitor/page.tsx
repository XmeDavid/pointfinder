"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { MapPin, Users, Trophy, Clock, RefreshCw, Eye, Activity } from "lucide-react";
import { api } from "@/lib/apiClient";
import LiveMap from "@/components/monitoring/LiveMap";
import TeamProgressTable from "@/components/monitoring/TeamProgressTable";
import EventsFeed from "@/components/monitoring/EventsFeed";

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

interface Game {
  id: string;
  name: string;
  status: "setup" | "live" | "finished";
  bases: Array<{
    id: string;
    displayName: string;
    latitude: number;
    longitude: number;
  }>;
}

interface Event {
  id: string;
  type: string;
  teamId: string;
  teamName: string;
  message: string;
  createdAt: string;
}

export default function GameMonitorPage() {
  const params = useParams();
  const gameId = params.id as string;
  
  const [game, setGame] = useState<Game | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchGameData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchGameData, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [gameId, autoRefresh]);

  async function fetchGameData() {
    try {
      setLoading(true);
      
      // Fetch game details
      const gameData = await api.get(`api/operator/games/${gameId}`).json() as Game;
      setGame(gameData);
      
      // Fetch teams with progress
      const teamsData = await api.get(`api/operator/monitor/games/${gameId}/teams`).json() as Team[];
      setTeams(teamsData);
      
      // Fetch recent events
      const eventsData = await api.get(`api/operator/monitor/games/${gameId}/events?limit=50`).json() as Event[];
      setEvents(eventsData);
      
    } catch (err) {
      setError("Failed to load game data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalTeams = teams.length;
  const activeTeams = teams.filter(t => t.lastLocation && 
    new Date(t.lastLocation.timestamp).getTime() > Date.now() - 5 * 60 * 1000).length; // Active in last 5 minutes
  const completedBases = teams.reduce((sum, team) => 
    sum + team.progress.filter(p => p.completedAt).length, 0);

  if (loading && !game) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game data...</p>
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Game not found"}</p>
          <button
            onClick={() => window.history.back()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => window.history.back()}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Eye className="w-5 h-5 text-gray-500" />
                </button>
                <h1 className="text-3xl font-bold text-gray-900">{game.name}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  game.status === "live" ? "bg-green-100 text-green-800" :
                  game.status === "finished" ? "bg-purple-100 text-purple-800" :
                  "bg-yellow-100 text-yellow-800"
                }`}>
                  {game.status.charAt(0).toUpperCase() + game.status.slice(1)}
                </span>
              </div>
              <p className="text-gray-600">Real-time monitoring and team progress</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  autoRefresh 
                    ? "bg-green-100 text-green-800" 
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${autoRefresh ? "animate-spin" : ""}`} />
                Auto-refresh {autoRefresh ? "ON" : "OFF"}
              </button>
              <button
                onClick={fetchGameData}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Now
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-blue-50">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Teams</p>
                <p className="text-2xl font-bold text-gray-900">{totalTeams}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-green-50">
                <Activity className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Teams</p>
                <p className="text-2xl font-bold text-gray-900">{activeTeams}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-purple-50">
                <MapPin className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Bases</p>
                <p className="text-2xl font-bold text-gray-900">{game.bases.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-yellow-50">
                <Trophy className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-gray-900">{completedBases}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Live Map */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Live Team Locations</h2>
              <LiveMap 
                bases={game.bases}
                teams={teams}
                gameStatus={game.status}
              />
            </div>
          </div>

          {/* Events Feed */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
              <EventsFeed events={events} />
            </div>
          </div>
        </div>

        {/* Team Progress Table */}
        <div className="mt-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Progress</h2>
            <TeamProgressTable teams={teams} bases={game.bases} />
          </div>
        </div>
      </div>
    </div>
  );
}
