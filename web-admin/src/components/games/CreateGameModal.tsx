import { useState } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { api } from "@/lib/apiClient";

interface CreateGameModalProps {
  onClose: () => void;
  onGameCreated: () => void;
}

export default function CreateGameModal({ onClose, onGameCreated }: CreateGameModalProps) {
  const [name, setName] = useState("");
  const [rulesHtml, setRulesHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              disabled={loading}
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
    </div>
  );
}
