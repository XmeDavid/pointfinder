import { useState } from "react";
import { X, Save, Loader2, MapPin } from "lucide-react";
import { api } from "@/lib/apiClient";
import BaseManagementModal from "./BaseManagementModal";

interface CreateGameModalProps {
  onClose: () => void;
  onGameCreated: () => void;
}

export default function CreateGameModal({ onClose, onGameCreated }: CreateGameModalProps) {
  const [name, setName] = useState("");
  const [rulesHtml, setRulesHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bases, setBases] = useState<Array<{
    id: string;
    name: string;
    description?: string;
    latitude: number;
    longitude: number;
    uuid: string;
    isLocationDependent: boolean;
    nfcLinked: boolean;
    enigmaId?: string;
  }>>([]);
  const [showBaseManagement, setShowBaseManagement] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Game name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post("api/operator/games", {
        json: {
          name: name.trim(),
          rulesHtml: rulesHtml.trim() || "<p>Game rules will be added here.</p>",
          bases: bases, // Include bases in the creation
        },
      });
      
      onGameCreated();
    } catch (err) {
      console.error("Failed to create game:", err);
      setError("Failed to create game. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Create New Game</h2>
            <p className="text-gray-600 mt-1">Set up a new adventure game for teams</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
              placeholder="e.g., Night Quest 2025, Scout Adventure"
              required
            />
          </div>

          {/* Base Management */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Bases *
              </label>
              <button
                type="button"
                onClick={() => setShowBaseManagement(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <MapPin className="w-4 h-4" />
                Manage Bases ({bases.length})
              </button>
            </div>
            
            {bases.length === 0 ? (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No bases created yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Click "Manage Bases" to create bases for your game
                </p>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {bases.map((base) => (
                    <div key={base.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-900">{base.name}</h4>
                        <p className="text-sm text-gray-600">
                          {base.latitude.toFixed(4)}, {base.longitude.toFixed(4)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          base.nfcLinked 
                            ? "bg-green-100 text-green-800" 
                            : "bg-yellow-100 text-yellow-800"
                        }`}>
                          {base.nfcLinked ? "Linked" : "Unlinked"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                className="w-full p-4 min-h-[200px] resize-none focus:outline-none"
                placeholder="Enter game rules, objectives, and instructions for teams..."
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">
              You can use HTML tags for formatting. Basic tags: &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;ul&gt;, &lt;li&gt;
            </p>
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
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || bases.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Create Game
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Base Management Modal */}
      {showBaseManagement && (
        <BaseManagementModal
          isOpen={showBaseManagement}
          onClose={() => setShowBaseManagement(false)}
          gameId="new"
          bases={bases}
          onBasesUpdate={setBases}
        />
      )}
    </div>
  );
}
