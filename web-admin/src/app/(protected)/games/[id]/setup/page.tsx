"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Users, Settings, Play, FileText } from "lucide-react";
import { api } from "@/lib/apiClient";
import BaseManagementModal from "@/components/games/BaseManagementModal";
import TeamManagementModal from "@/components/games/TeamManagementModal";
import EnigmaManagementModal from "@/components/games/EnigmaManagementModal";

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

interface Team {
  id: string;
  name: string;
  number: number;
  inviteCode: string;
  members: string[];
  leaderId?: string;
}

interface Enigma {
  id: string;
  title: string;
  content: string;
  answer: string;
  points: number;
  isLocationDependent: boolean;
  baseId?: string;
  baseName?: string;
  mediaType?: "image" | "video" | "youtube";
  mediaUrl?: string;
  createdAt: string;
}

interface Game {
  id: string;
  name: string;
  status: "setup" | "ready" | "live" | "finished";
  rulesHtml?: string;
  bases: Base[];
  teams: Team[];
  enigmas: Enigma[];
  createdAt: string;
}

export default function GameSetupPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;
  
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBaseManagement, setShowBaseManagement] = useState(false);
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showEnigmaManagement, setShowEnigmaManagement] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "bases" | "teams" | "enigmas" | "settings">("overview");

  const fetchGame = useCallback(async () => {
    try {
      setLoading(true);
      const gameData = await api.get(`api/operator/games/${gameId}`).json() as Game;
      setGame(gameData);
    } catch (err) {
      setError("Failed to load game");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  async function handleGoLive() {
    if (!game) return;
    
    // Check if all bases are linked
    const unlinkedBases = game.bases.filter(base => !base.nfcLinked);
    if (unlinkedBases.length > 0) {
      alert(`Cannot go live: ${unlinkedBases.length} bases are not linked to NFC tags. Please complete NFC setup first.`);
      return;
    }

    // Check if teams exist
    if (game.teams.length === 0) {
      alert("Cannot go live: No teams have been created. Please create at least one team first.");
      return;
    }

    setSaving(true);
    try {
      await api.patch(`api/operator/games/${gameId}`, {
        json: { status: "live" }
      });
      
      router.push(`/games/${gameId}/monitor`);
    } catch (err) {
      setError("Failed to start game");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const linkedBasesCount = game?.bases.filter(base => base.nfcLinked).length || 0;
  const totalBasesCount = game?.bases.length || 0;
  const totalTeamsCount = game?.teams.length || 0;
  const totalEnigmasCount = game?.enigmas.length || 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game setup...</p>
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
            onClick={() => router.back()}
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
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{game.name}</h1>
                <p className="text-gray-600">Game Setup & Configuration</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                game.status === "live" ? "bg-green-100 text-green-800" :
                game.status === "finished" ? "bg-purple-100 text-purple-800" :
                game.status === "ready" ? "bg-blue-100 text-blue-800" :
                "bg-yellow-100 text-yellow-800"
              }`}>
                {game.status.charAt(0).toUpperCase() + game.status.slice(1)}
              </span>
              {game.status === "ready" && (
                <button
                  onClick={handleGoLive}
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  {saving ? "Starting..." : "Go Live"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: "overview", label: "Overview", icon: Settings },
              { id: "bases", label: "Bases", icon: MapPin },
              { id: "teams", label: "Teams", icon: Users },
              { id: "enigmas", label: "Enigmas", icon: FileText },
              { id: "settings", label: "Settings", icon: Settings },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as "overview" | "bases" | "teams" | "enigmas" | "settings")}
                  className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                    isActive
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Status Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <div className="p-3 rounded-lg bg-blue-50">
                    <MapPin className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Bases</p>
                    <p className="text-2xl font-bold text-gray-900">{totalBasesCount}</p>
                    <p className="text-sm text-gray-500">
                      {linkedBasesCount} linked to NFC
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <div className="p-3 rounded-lg bg-green-50">
                    <Users className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Teams</p>
                    <p className="text-2xl font-bold text-gray-900">{totalTeamsCount}</p>
                    <p className="text-sm text-gray-500">
                      Ready to join
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <div className="p-3 rounded-lg bg-purple-50">
                    <FileText className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Enigmas</p>
                    <p className="text-2xl font-bold text-gray-900">{totalEnigmasCount}</p>
                    <p className="text-sm text-gray-500">
                      Challenges created
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <div className="p-3 rounded-lg bg-purple-50">
                    <Settings className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Status</p>
                    <p className="text-2xl font-bold text-gray-900 capitalize">{game.status}</p>
                    <p className="text-sm text-gray-500">
                      {game.status === "ready" ? "Ready to go live" : "Setup in progress"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Setup Checklist */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Setup Checklist</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    totalBasesCount > 0 ? "bg-green-100" : "bg-gray-100"
                  }`}>
                    {totalBasesCount > 0 ? (
                      <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                    ) : (
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    )}
                  </div>
                  <span className={totalBasesCount > 0 ? "text-gray-900" : "text-gray-500"}>
                    Create bases ({totalBasesCount} created)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    linkedBasesCount === totalBasesCount && totalBasesCount > 0 ? "bg-green-100" : "bg-gray-100"
                  }`}>
                    {linkedBasesCount === totalBasesCount && totalBasesCount > 0 ? (
                      <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                    ) : (
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    )}
                  </div>
                  <span className={linkedBasesCount === totalBasesCount && totalBasesCount > 0 ? "text-gray-900" : "text-gray-500"}>
                    Link bases to NFC tags ({linkedBasesCount}/{totalBasesCount} linked)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    totalTeamsCount > 0 ? "bg-green-100" : "bg-gray-100"
                  }`}>
                    {totalTeamsCount > 0 ? (
                      <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                    ) : (
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    )}
                  </div>
                  <span className={totalTeamsCount > 0 ? "text-gray-900" : "text-gray-500"}>
                    Create teams ({totalTeamsCount} created)
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    totalEnigmasCount > 0 ? "bg-green-100" : "bg-gray-100"
                  }`}>
                    {totalEnigmasCount > 0 ? (
                      <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                    ) : (
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    )}
                  </div>
                  <span className={totalEnigmasCount > 0 ? "text-gray-900" : "text-gray-500"}>
                    Create enigmas ({totalEnigmasCount} created)
                  </span>
                </div>
              </div>

              {game.status === "ready" && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 font-medium">✅ Game is ready to go live!</p>
                  <p className="text-green-700 text-sm mt-1">
                    All setup requirements have been completed. You can now start the game.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "bases" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Base Management</h3>
              <button
                onClick={() => setShowBaseManagement(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <MapPin className="w-4 h-4" />
                Manage Bases
              </button>
            </div>

            {game.bases.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No bases created yet</h3>
                <p className="text-gray-600 mb-6">
                  Create bases for your game by clicking &quot;Manage Bases&quot;
                </p>
                <button
                  onClick={() => setShowBaseManagement(true)}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  <MapPin className="w-5 h-5" />
                  Create First Base
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {game.bases.map((base) => (
                  <div key={base.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">{base.name}</h4>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        base.nfcLinked 
                          ? "bg-green-100 text-green-800" 
                          : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {base.nfcLinked ? "Linked" : "Unlinked"}
                      </span>
                    </div>
                    
                    {base.description && (
                      <p className="text-sm text-gray-600 mb-3">{base.description}</p>
                    )}
                    
                    <div className="space-y-2 text-sm text-gray-500">
                      <p>📍 {base.latitude.toFixed(4)}, {base.longitude.toFixed(4)}</p>
                      <p>🔑 UUID: {base.uuid.slice(0, 8)}...</p>
                      {base.isLocationDependent && (
                        <p>📍 Location-dependent</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "teams" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Team Management</h3>
              <button
                onClick={() => setShowTeamManagement(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <Users className="w-4 h-4" />
                Manage Teams
              </button>
            </div>

            {game.teams.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No teams created yet</h3>
                <p className="text-gray-600 mb-6">
                  Create teams for players to join your game
                </p>
                <button
                  onClick={() => setShowTeamManagement(true)}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  <Users className="w-5 h-5" />
                  Create First Team
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {game.teams.map((team) => (
                  <div key={team.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">{team.name}</h4>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        #{team.number}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-500">
                      <p>👥 {team.members.length} members</p>
                      <p>🔑 Code: {team.inviteCode}</p>
                      {team.leaderId && (
                        <p>👑 Leader assigned</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "enigmas" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Enigma Management</h3>
              <button
                onClick={() => setShowEnigmaManagement(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Manage Enigmas
              </button>
            </div>

            {game.enigmas.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No enigmas created yet</h3>
                <p className="text-gray-600 mb-6">
                  Create enigmas for teams to solve during the game
                </p>
                <button
                  onClick={() => setShowEnigmaManagement(true)}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  <FileText className="w-5 h-5" />
                  Create First Enigma
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {game.enigmas.map((enigma) => (
                  <div key={enigma.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">{enigma.title}</h4>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {enigma.points} pts
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-3">
                      {enigma.content.length > 100 
                        ? `${enigma.content.substring(0, 100)}...` 
                        : enigma.content
                      }
                    </p>
                    
                    <div className="space-y-2 text-sm text-gray-500">
                      <p>🔑 Answer: {enigma.answer}</p>
                      {enigma.isLocationDependent ? (
                        <p>📍 {enigma.baseName || "Location-dependent"}</p>
                      ) : (
                        <p>🌐 Independent</p>
                      )}
                      {enigma.mediaType && (
                        <p>📎 {enigma.mediaType} media</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">Game Settings</h3>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="text-gray-600">Game settings will be implemented here.</p>
            </div>
          </div>
        )}
      </div>

      {/* Base Management Modal */}
      {showBaseManagement && (
        <BaseManagementModal
          isOpen={showBaseManagement}
          onClose={() => setShowBaseManagement(false)}
          gameId={gameId}
          bases={game.bases}
          onBasesUpdate={(newBases) => {
            setGame(prev => prev ? { ...prev, bases: newBases } : null);
          }}
        />
      )}

      {/* Team Management Modal */}
      {showTeamManagement && (
        <TeamManagementModal
          isOpen={showTeamManagement}
          onClose={() => setShowTeamManagement(false)}
          gameId={gameId}
          teams={game.teams}
          onTeamsUpdate={(newTeams) => {
            setGame(prev => prev ? { ...prev, teams: newTeams } : null);
          }}
        />
      )}

      {/* Enigma Management Modal */}
      {showEnigmaManagement && (
        <EnigmaManagementModal
          isOpen={showEnigmaManagement}
          onClose={() => setShowEnigmaManagement(false)}
          gameId={gameId}
          enigmas={game.enigmas}
          bases={game.bases}
          onEnigmasUpdate={(newEnigmas) => {
            setGame(prev => prev ? { ...prev, enigmas: newEnigmas } : null);
          }}
        />
      )}
    </div>
  );
}
