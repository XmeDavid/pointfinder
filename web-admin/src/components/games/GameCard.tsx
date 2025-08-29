import { useState } from "react";
import { MapPin, Users, Calendar, Play, Pause, Settings, Eye } from "lucide-react";
import { api } from "@/lib/apiClient";
import Link from "next/link";

interface Game {
  id: string;
  name: string;
  status: "setup" | "live" | "finished";
  basesLinked: boolean;
  bases: Array<{
    id: string;
    name: string;
    description?: string;
    latitude: number;
    longitude: number;
    uuid: string;
    isLocationDependent: boolean;
    nfcLinked: boolean;
    enigmaId?: string;
  }>;
  teams: Array<{
    id: string;
    name: string;
  }>;
  createdAt: string;
}

interface GameCardProps {
  game: Game;
  onUpdate: () => void;
}

export default function GameCard({ game, onUpdate }: GameCardProps) {
  const [loading, setLoading] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live":
        return "bg-green-100 text-green-800";
      case "setup":
        return "bg-yellow-100 text-yellow-800";
      case "finished":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "live":
        return <Play className="w-4 h-4" />;
      case "setup":
        return <Settings className="w-4 h-4" />;
      case "finished":
        return <Pause className="w-4 h-4" />;
      default:
        return <Settings className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleGoLive = async () => {
    if (!game.basesLinked) {
      alert("All bases must be linked with NFC tags before going live");
      return;
    }
    
    setLoading(true);
    try {
      await api.post(`api/operator/games/${game.id}/status`, {
        json: { status: "live" }
      });
      onUpdate();
    } catch (error) {
      console.error("Failed to go live:", error);
      alert("Failed to start the game. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePauseGame = async () => {
    setLoading(true);
    try {
      await api.post(`api/operator/games/${game.id}/status`, {
        json: { status: "finished" }
      });
      onUpdate();
    } catch (error) {
      console.error("Failed to pause game:", error);
      alert("Failed to pause the game. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{game.name}</h3>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(game.status)}`}>
              {getStatusIcon(game.status)}
              {game.status.charAt(0).toUpperCase() + game.status.slice(1)}
            </span>
            {game.status === "setup" && !game.basesLinked && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                <MapPin className="w-3 h-3" />
                NFC Setup Required
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4" />
          <span>{game.bases.length} bases</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Users className="w-4 h-4" />
          <span>{game.teams.length} teams</span>
        </div>
      </div>

      {/* Created Date */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Calendar className="w-4 h-4" />
        <span>Created {formatDate(game.createdAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {game.status === "setup" && (
          <button
            onClick={handleGoLive}
            disabled={loading || !game.basesLinked}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4" />
            {loading ? "Starting..." : "Go Live"}
          </button>
        )}
        
        {game.status === "live" && (
          <button
            onClick={handlePauseGame}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-yellow-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Pause className="w-4 h-4" />
            {loading ? "Pausing..." : "End Game"}
          </button>
        )}

        <button
          onClick={() => window.location.href = `/games/${game.id}/monitor`}
          className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Eye className="w-4 h-4" />
          Monitor
        </button>

        <Link
          href={`/games/${game.id}/setup`}
          className="inline-flex items-center justify-center gap-2 bg-gray-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Setup
        </Link>
      </div>
    </div>
  );
}
