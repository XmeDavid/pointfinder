"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { api } from "@/lib/apiClient";

interface Game {
  id: string;
  name: string;
  status: "setup" | "live" | "finished";
  rulesHtml?: string;
  bases: Array<{
    id: string;
    displayName: string;
    latitude: number;
    longitude: number;
  }>;
  teams: Array<{
    id: string;
    name: string;
  }>;
  createdAt: string;
}

export default function GameEditPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;
  
  const [game, setGame] = useState<Game | null>(null);
  const [name, setName] = useState("");
  const [rulesHtml, setRulesHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGame();
  }, [gameId]);

  async function fetchGame() {
    try {
      setLoading(true);
      const gameData = await api.get(`api/operator/games/${gameId}`).json() as Game;
      setGame(gameData);
      setName(gameData.name);
      setRulesHtml(gameData.rulesHtml || "");
    } catch (err) {
      setError("Failed to load game");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!game) return;
    
    setSaving(true);
    setError(null);
    
    try {
      await api.patch(`api/operator/games/${gameId}`, {
        json: {
          name: name.trim(),
          rulesHtml: rulesHtml.trim(),
        },
      });
      
      router.push(`/games/${gameId}/monitor`);
    } catch (err) {
      setError("Failed to save changes");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game...</p>
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Edit Game</h1>
                <p className="text-gray-600">Update game details and rules</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                game.status === "live" ? "bg-green-100 text-green-800" :
                game.status === "finished" ? "bg-purple-100 text-purple-800" :
                "bg-yellow-100 text-yellow-800"
              }`}>
                {game.status.charAt(0).toUpperCase() + game.status.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="space-y-6">
            {/* Game Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Game Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="e.g., Night Quest 2025"
                required
              />
            </div>

            {/* Game Rules */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Game Rules
              </label>
              <div className="border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
                <div className="flex border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setRulesHtml(rulesHtml + "<p><strong>New paragraph</strong></p>")}
                    className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-r border-gray-200"
                  >
                    Bold
                  </button>
                  <button
                    type="button"
                    onClick={() => setRulesHtml(rulesHtml + "<p><em>Italic text</em></p>")}
                    className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-r border-gray-200"
                  >
                    Italic
                  </button>
                  <button
                    type="button"
                    onClick={() => setRulesHtml(rulesHtml + "<ul><li>List item</li></ul>")}
                    className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  >
                    List
                  </button>
                </div>
                <textarea
                  value={rulesHtml}
                  onChange={(e) => setRulesHtml(e.target.value)}
                  className="w-full p-4 min-h-[300px] resize-none focus:outline-none"
                  placeholder="Enter game rules, objectives, and instructions for teams..."
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">
                You can use HTML tags for formatting. Basic tags: &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;ul&gt;, &lt;li&gt;
              </p>
            </div>

            {/* Game Stats */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{game.bases.length}</div>
                <div className="text-sm text-gray-600">Bases</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{game.teams.length}</div>
                <div className="text-sm text-gray-600">Teams</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {new Date(game.createdAt).toLocaleDateString()}
                </div>
                <div className="text-sm text-gray-600">Created</div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
