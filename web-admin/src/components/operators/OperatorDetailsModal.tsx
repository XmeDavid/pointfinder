"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Mail, Calendar, Users, MapPin, Clock, Eye, Settings } from "lucide-react";
import { api } from "@/lib/apiClient";

interface Game {
  id: string;
  name: string;
  status: "setup" | "live" | "finished";
  createdAt: string;
  teamCount: number;
  baseCount: number;
}

interface Operator {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  status: "active" | "pending" | "inactive";
}

interface OperatorDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  operator: Operator | null;
  onOperatorUpdate?: () => void;
}

export default function OperatorDetailsModal({ isOpen, onClose, operator, onOperatorUpdate }: OperatorDetailsModalProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    if (isOpen && operator) {
      fetchOperatorGames();
    }
  }, [isOpen, operator, fetchOperatorGames]);

  const fetchOperatorGames = useCallback(async () => {
    if (!operator) return;
    
    setLoading(true);
    try {
      const gamesData = await api.get(`api/admin/operators/${operator.id}/games`).json() as Game[];
      setGames(gamesData);
    } catch (error) {
      console.error("Failed to fetch operator games:", error);
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [operator]);

  const handleStatusUpdate = async (newStatus: "active" | "inactive" | "pending") => {
    if (!operator) return;
    
    setStatusLoading(true);
    try {
      await api.patch(`api/admin/operators/${operator.id}`, {
        json: { status: newStatus }
      });
      
      // Update the operator object locally
      if (operator) {
        operator.status = newStatus;
      }
      
      // Notify parent component to refresh the operators list
      if (onOperatorUpdate) {
        onOperatorUpdate();
      }
    } catch (error) {
      console.error("Failed to update operator status:", error);
      alert("Failed to update operator status");
    } finally {
      setStatusLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "setup":
        return "bg-yellow-100 text-yellow-800";
      case "live":
        return "bg-green-100 text-green-800";
      case "finished":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (!isOpen || !operator) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Operator Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Operator Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-xl font-bold text-white">
                  {operator.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{operator.name}</h3>
                <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                  <div className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {operator.email}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    Joined {new Date(operator.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    operator.status === "active" ? "bg-green-100 text-green-800" :
                    operator.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                    "bg-gray-100 text-gray-800"
                  }`}>
                    {operator.status}
                  </span>
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-gray-400" />
                    <select
                      value={operator.status}
                      onChange={(e) => handleStatusUpdate(e.target.value as "active" | "inactive" | "pending")}
                      disabled={statusLoading}
                      className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                    >
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    {statusLoading && (
                      <div className="w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Games Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Games</h3>
              <div className="text-sm text-gray-500">
                {games.length} total games
              </div>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Loading games...</p>
              </div>
            ) : games.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {games.map((game) => (
                  <div key={game.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="font-medium text-gray-900">{game.name}</h4>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(game.status)}`}>
                        {game.status}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {game.teamCount} teams
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {game.baseCount} bases
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Created {new Date(game.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <button className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        View Game
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">No games yet</h4>
                <p className="text-gray-500">This operator hasn&apos;t created any games yet.</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
