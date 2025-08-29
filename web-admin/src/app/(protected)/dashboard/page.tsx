"use client";

import { useState, useEffect } from "react";
import { Plus, Users, Shield, Eye, UserPlus } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import CreateGameModal from "@/components/games/CreateGameModal";
import GameCard from "@/components/games/GameCard";
import StatsOverview from "@/components/dashboard/StatsOverview";
import OperatorsTable from "@/components/operators/OperatorsTable";
import InviteOperatorModal from "@/components/operators/InviteOperatorModal";
import OperatorDetailsModal from "@/components/operators/OperatorDetailsModal";

interface Game {
  id: string;
  name: string;
  status: "setup" | "live" | "finished";
  basesLinked: boolean;
  bases: Array<{
    id: string;
    displayName: string;
    nfcTagUUID?: string;
  }>;
  teams: Array<{
    id: string;
    name: string;
  }>;
  createdAt: string;
}

interface Operator {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  gameCount: number;
  status: "active" | "pending" | "inactive";
}

export default function DashboardPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [showOperatorDetails, setShowOperatorDetails] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      
      if (user?.role === "admin") {
        // Admin: Fetch operators and games
        await Promise.all([
          fetchOperators(),
          fetchGames()
        ]);
      } else {
        // Operator: Only fetch games
        await fetchGames();
      }
    } catch (err: unknown) {
      console.error("Error fetching data:", err);
      const error = err as { response?: { status?: number }; message?: string };
      setError(`Failed to load data: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchGames() {
    const endpoint = user?.role === "admin" ? "api/games" : "api/operator/games";
    console.log("Fetching games from:", endpoint);
    
    const gamesData = await api.get(endpoint).json() as Game[];
    console.log("Games data:", gamesData);
    setGames(gamesData);
  }

  async function fetchOperators() {
    console.log("Fetching operators");
    const operatorsData = await api.get("api/admin/operators").json() as Operator[];
    console.log("Operators data:", operatorsData);
    setOperators(operatorsData);
  }

  const activeGames = games.filter(g => g.status === "live");
  const setupGames = games.filter(g => g.status === "setup");
  const finishedGames = games.filter(g => g.status === "finished");

  const activeOperators = operators.filter(o => o.status === "active");
  const pendingOperators = operators.filter(o => o.status === "pending");

  const handleViewOperator = (operator: Operator) => {
    setSelectedOperator(operator);
    setShowOperatorDetails(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {user?.role === "admin" ? "Admin Dashboard" : "Game Dashboard"}
              </h1>
              <p className="text-gray-600 mt-1">
                Welcome back, {user?.email} • {user?.role === "admin" ? "System Administrator" : "Game Operator"}
              </p>
            </div>
            {user?.role === "admin" ? (
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all transform hover:scale-105"
              >
                <UserPlus className="w-5 h-5" />
                Invite Operator
              </button>
            ) : (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all transform hover:scale-105"
              >
                <Plus className="w-5 h-5" />
                Create New Game
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        {user?.role === "admin" ? (
          <StatsOverview 
            totalGames={games.length}
            activeGames={activeGames.length}
            setupGames={setupGames.length}
            finishedGames={finishedGames.length}
            totalOperators={operators.length}
            activeOperators={activeOperators.length}
            pendingOperators={pendingOperators.length}
          />
        ) : (
          <StatsOverview 
            totalGames={games.length}
            activeGames={activeGames.length}
            setupGames={setupGames.length}
            finishedGames={finishedGames.length}
          />
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Admin View: Operators First */}
            {user?.role === "admin" && (
              <div className="mb-8">
                <OperatorsTable 
                  operators={operators} 
                  onRefresh={fetchData}
                  onInviteOperator={() => setShowInviteModal(true)}
                  onViewOperator={handleViewOperator}
                />
              </div>
            )}

            {/* Games Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">
                  {user?.role === "admin" ? "All Games" : "My Games"}
                </h2>
              </div>

              {/* Active Games */}
              {activeGames.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <h3 className="text-lg font-medium text-gray-900">Live Games</h3>
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {activeGames.length} active
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activeGames.map((game) => (
                      <GameCard 
                        key={game.id} 
                        game={game} 
                        onUpdate={fetchGames}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Setup Games */}
              {setupGames.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <h3 className="text-lg font-medium text-gray-900">Games in Setup</h3>
                    <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {setupGames.length} pending
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {setupGames.map((game) => (
                      <GameCard 
                        key={game.id} 
                        game={game} 
                        onUpdate={fetchGames}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Finished Games */}
              {finishedGames.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                    <h3 className="text-lg font-medium text-gray-900">Completed Games</h3>
                    <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {finishedGames.length} completed
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {finishedGames.map((game) => (
                      <GameCard 
                        key={game.id} 
                        game={game} 
                        onUpdate={fetchGames}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {games.length === 0 && (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No games yet</h3>
                  <p className="text-gray-600 mb-6">
                    {user?.role === "admin" 
                      ? "Operators will create games here once they&apos;re invited and active."
                      : "Create your first game to get started"
                    }
                  </p>
                  {user?.role !== "admin" && (
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
                    >
                      <Plus className="w-5 h-5" />
                      Create Your First Game
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateGameModal 
          onClose={() => setShowCreateModal(false)}
          onGameCreated={() => {
            setShowCreateModal(false);
            fetchGames();
          }}
        />
      )}

      {showInviteModal && (
        <InviteOperatorModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          onSuccess={fetchData}
        />
      )}

      {showOperatorDetails && selectedOperator && (
        <OperatorDetailsModal
          isOpen={showOperatorDetails}
          onClose={() => {
            setShowOperatorDetails(false);
            setSelectedOperator(null);
          }}
          operator={selectedOperator}
        />
      )}
    </div>
  );
}


