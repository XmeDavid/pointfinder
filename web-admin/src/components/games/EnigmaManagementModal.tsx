"use client";

import { useState, useCallback } from "react";
import { X, Plus, Edit, Trash2, MapPin, Unlink, Image, Video, Youtube, FileText } from "lucide-react";
import NextImage from "next/image";

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

interface EnigmaManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  enigmas: Enigma[];
  bases: Base[];
  onEnigmasUpdate: (enigmas: Enigma[]) => void;
}

export default function EnigmaManagementModal({
  isOpen,
  onClose,
  enigmas,
  bases,
  onEnigmasUpdate,
}: EnigmaManagementModalProps) {
  const [selectedEnigma, setSelectedEnigma] = useState<Enigma | null>(null);
  const [editingEnigma, setEditingEnigma] = useState<Enigma | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreateEnigma = useCallback((enigmaData: Omit<Enigma, "id" | "createdAt">) => {
    const newEnigma: Enigma = {
      ...enigmaData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    
    onEnigmasUpdate([...enigmas, newEnigma]);
    setSelectedEnigma(newEnigma);
    setShowCreateForm(false);
  }, [enigmas, onEnigmasUpdate]);

  const handleUpdateEnigma = useCallback((enigmaId: string, updates: Partial<Enigma>) => {
    const updatedEnigmas = enigmas.map(enigma => 
      enigma.id === enigmaId ? { ...enigma, ...updates } : enigma
    );
    onEnigmasUpdate(updatedEnigmas);
    setEditingEnigma(null);
  }, [enigmas, onEnigmasUpdate]);

  const handleDeleteEnigma = useCallback((enigmaId: string) => {
    if (confirm("Are you sure you want to delete this enigma? This action cannot be undone.")) {
      const updatedEnigmas = enigmas.filter(enigma => enigma.id !== enigmaId);
      onEnigmasUpdate(updatedEnigmas);
      if (selectedEnigma?.id === enigmaId) {
        setSelectedEnigma(null);
      }
    }
  }, [enigmas, onEnigmasUpdate, selectedEnigma]);

  const getMediaIcon = (mediaType?: string) => {
    switch (mediaType) {
      case "image":
        return <Image className="w-4 h-4" />;
      case "video":
        return <Video className="w-4 h-4" />;
      case "youtube":
        return <Youtube className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getMediaColor = (mediaType?: string) => {
    switch (mediaType) {
      case "image":
        return "text-blue-600";
      case "video":
        return "text-purple-600";
      case "youtube":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="enigma-management-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 id="enigma-management-title" className="text-2xl font-bold text-gray-900">
              Manage Enigmas
            </h2>
            <p className="text-gray-600 mt-1">
              Create and manage challenges for your game. Enigmas can be location-dependent or independent.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex h-[calc(90vh-120px)]">
          {/* Enigmas List Section */}
          <div className="w-96 border-r border-gray-200 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Enigmas</h3>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Enigma
              </button>
            </div>

            {enigmas.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No enigmas created yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Click &quot;Add Enigma&quot; to create challenges for teams
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {enigmas.map((enigma) => (
                  <div
                    key={enigma.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedEnigma?.id === enigma.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setSelectedEnigma(enigma)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`${getMediaColor(enigma.mediaType)}`}>
                            {getMediaIcon(enigma.mediaType)}
                          </div>
                          <h4 className="font-medium text-gray-900">{enigma.title}</h4>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {enigma.content.length > 100 
                            ? `${enigma.content.substring(0, 100)}...` 
                            : enigma.content
                          }
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                            {enigma.points} pts
                          </span>
                          {enigma.isLocationDependent ? (
                            <span className="inline-flex items-center gap-1 text-green-600">
                              <MapPin className="w-3 h-3" />
                              {enigma.baseName || "Location-dependent"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-600">
                              <Unlink className="w-3 h-3" />
                              Independent
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingEnigma(enigma);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEnigma(enigma.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enigma Details Section */}
          <div className="flex-1 p-6 overflow-y-auto">
            {selectedEnigma ? (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`${getMediaColor(selectedEnigma.mediaType)}`}>
                      {getMediaIcon(selectedEnigma.mediaType)}
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">{selectedEnigma.title}</h3>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {selectedEnigma.points} points
                  </span>
                </div>

                {/* Content Section */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h4 className="font-medium text-gray-900 mb-2">Challenge Content</h4>
                  <div className="prose prose-sm max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: selectedEnigma.content }} />
                  </div>
                </div>

                {/* Media Section */}
                {selectedEnigma.mediaUrl && (
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-2">Media</h4>
                    <div className="bg-gray-50 rounded-lg p-4">
                      {selectedEnigma.mediaType === "image" && (
                        <NextImage 
                          src={selectedEnigma.mediaUrl} 
                          alt={`Media for enigma: ${selectedEnigma.title}`}
                          width={800}
                          height={600}
                          className="max-w-full h-auto rounded-lg"
                        />
                      )}
                      {selectedEnigma.mediaType === "video" && (
                        <video 
                          controls 
                          className="max-w-full h-auto rounded-lg"
                        >
                          <source src={selectedEnigma.mediaUrl} type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      )}
                      {selectedEnigma.mediaType === "youtube" && (
                        <div className="aspect-video">
                          <iframe
                            src={selectedEnigma.mediaUrl}
                            title="YouTube video"
                            className="w-full h-full rounded-lg"
                            allowFullScreen
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Answer Section */}
                <div className="bg-yellow-50 rounded-lg p-4 mb-6">
                  <h4 className="font-medium text-gray-900 mb-2">Answer</h4>
                  <p className="text-sm text-gray-700">{selectedEnigma.answer}</p>
                </div>

                {/* Assignment Section */}
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <h4 className="font-medium text-gray-900 mb-2">Assignment</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>
                      <strong>Type:</strong> {selectedEnigma.isLocationDependent ? "Location-dependent" : "Independent"}
                    </p>
                    {selectedEnigma.isLocationDependent && selectedEnigma.baseName && (
                      <p>
                        <strong>Assigned to:</strong> {selectedEnigma.baseName}
                      </p>
                    )}
                    <p>
                      <strong>Points:</strong> {selectedEnigma.points}
                    </p>
                  </div>
                </div>

                {/* Enigma Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Enigma Information</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p><strong>Created:</strong> {new Date(selectedEnigma.createdAt).toLocaleDateString()}</p>
                    <p><strong>ID:</strong> {selectedEnigma.id}</p>
                    {selectedEnigma.mediaType && (
                      <p><strong>Media Type:</strong> {selectedEnigma.mediaType}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Enigma</h3>
                <p className="text-gray-600">
                  Choose an enigma from the list to view details and manage content
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Create Enigma Modal */}
        {showCreateForm && (
          <CreateEnigmaModal
            onCreate={handleCreateEnigma}
            onCancel={() => setShowCreateForm(false)}
            bases={bases}
          />
        )}

        {/* Edit Enigma Modal */}
        {editingEnigma && (
          <EditEnigmaModal
            enigma={editingEnigma}
            bases={bases}
            onSave={(updates) => handleUpdateEnigma(editingEnigma.id, updates)}
            onCancel={() => setEditingEnigma(null)}
          />
        )}
      </div>
    </div>
  );
}

// Create Enigma Modal Component
interface CreateEnigmaModalProps {
  onCreate: (enigma: Omit<Enigma, "id" | "createdAt">) => void;
  onCancel: () => void;
  bases: Base[];
}

function CreateEnigmaModal({ onCreate, onCancel, bases }: CreateEnigmaModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [answer, setAnswer] = useState("");
  const [points, setPoints] = useState(10);
  const [isLocationDependent, setIsLocationDependent] = useState(false);
  const [selectedBaseId, setSelectedBaseId] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video" | "youtube" | undefined>(undefined);
  const [mediaUrl, setMediaUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && content.trim() && answer.trim()) {
      onCreate({
        title: title.trim(),
        content: content.trim(),
        answer: answer.trim(),
        points,
        isLocationDependent,
        baseId: isLocationDependent ? selectedBaseId : undefined,
        baseName: isLocationDependent && selectedBaseId 
          ? bases.find(b => b.id === selectedBaseId)?.name 
          : undefined,
        mediaType,
        mediaUrl: mediaUrl.trim() || undefined,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Enigma</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter enigma title..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content *
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter the challenge content (supports HTML)..."
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                You can use HTML tags for formatting (e.g., &lt;strong&gt;, &lt;em&gt;, &lt;br&gt;)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Answer *
              </label>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter the correct answer..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Points
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={points}
                onChange={(e) => setPoints(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={isLocationDependent}
                  onChange={(e) => setIsLocationDependent(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Location-dependent (must be solved at specific base)
                </span>
              </label>
            </div>

            {isLocationDependent && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to Base
                </label>
                <select
                  value={selectedBaseId}
                  onChange={(e) => setSelectedBaseId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select a base...</option>
                  {bases.map((base) => (
                    <option key={base.id} value={base.id}>
                      {base.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Media Type (Optional)
              </label>
              <select
                value={mediaType || ""}
                onChange={(e) => setMediaType(e.target.value as "image" | "video" | "youtube" | undefined || undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No media</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>

            {mediaType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Media URL *
                </label>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={
                    mediaType === "youtube" 
                      ? "https://www.youtube.com/watch?v=..." 
                      : "https://example.com/media.jpg"
                  }
                  required
                />
                {mediaType === "youtube" && mediaUrl && (
                  <p className="text-xs text-gray-500 mt-1">
                    YouTube URL will be automatically converted to embed format
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Enigma
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Edit Enigma Modal Component
interface EditEnigmaModalProps {
  enigma: Enigma;
  bases: Base[];
  onSave: (updates: Partial<Enigma>) => void;
  onCancel: () => void;
}

function EditEnigmaModal({ enigma, bases, onSave, onCancel }: EditEnigmaModalProps) {
  const [title, setTitle] = useState(enigma.title);
  const [content, setContent] = useState(enigma.content);
  const [answer, setAnswer] = useState(enigma.answer);
  const [points, setPoints] = useState(enigma.points);
  const [isLocationDependent, setIsLocationDependent] = useState(enigma.isLocationDependent);
  const [selectedBaseId, setSelectedBaseId] = useState(enigma.baseId || "");
  const [mediaType, setMediaType] = useState<"image" | "video" | "youtube" | undefined>(enigma.mediaType);
  const [mediaUrl, setMediaUrl] = useState(enigma.mediaUrl || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && content.trim() && answer.trim()) {
      onSave({
        title: title.trim(),
        content: content.trim(),
        answer: answer.trim(),
        points,
        isLocationDependent,
        baseId: isLocationDependent ? selectedBaseId : undefined,
        baseName: isLocationDependent && selectedBaseId 
          ? bases.find(b => b.id === selectedBaseId)?.name 
          : undefined,
        mediaType,
        mediaUrl: mediaUrl.trim() || undefined,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Enigma</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content *
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Answer *
              </label>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Points
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={points}
                onChange={(e) => setPoints(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={isLocationDependent}
                  onChange={(e) => setIsLocationDependent(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Location-dependent (must be solved at specific base)
                </span>
              </label>
            </div>

            {isLocationDependent && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to Base
                </label>
                <select
                  value={selectedBaseId}
                  onChange={(e) => setSelectedBaseId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select a base...</option>
                  {bases.map((base) => (
                    <option key={base.id} value={base.id}>
                      {base.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Media Type (Optional)
              </label>
              <select
                value={mediaType || ""}
                onChange={(e) => setMediaType(e.target.value as "image" | "video" | "youtube" | undefined || undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No media</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>

            {mediaType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Media URL *
                </label>
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
