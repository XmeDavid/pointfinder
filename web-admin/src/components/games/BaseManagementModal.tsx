"use client";

import { useState, useCallback } from "react";
import { X, MapPin, Plus, Edit, Trash2, Link, Unlink } from "lucide-react";
import dynamic from "next/dynamic";
import { Base } from "@/types";

// Dynamically import the map component to avoid SSR issues
const MapPicker = dynamic(() => import("../maps/MapPicker"), { ssr: false });

interface BaseManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  bases: Base[];
  onBasesUpdate: (bases: Base[]) => void;
}

export default function BaseManagementModal({
  isOpen,
  onClose,
  bases,
  onBasesUpdate,
}: BaseManagementModalProps) {
  const [selectedBase, setSelectedBase] = useState<Base | null>(null);
  const [editingBase, setEditingBase] = useState<Base | null>(null);

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    const newBase: Base = {
      id: crypto.randomUUID(),
      name: `Base ${bases.length + 1}`,
      description: "",
      latitude: lat,
      longitude: lng,
      uuid: crypto.randomUUID(),
      isLocationDependent: true,
      nfcLinked: false,
    };
    
    onBasesUpdate([...bases, newBase]);
    setSelectedBase(newBase);
  }, [bases, onBasesUpdate]);

  const handleUpdateBase = useCallback((baseId: string, updates: Partial<Base>) => {
    const updatedBases = bases.map(base => 
      base.id === baseId ? { ...base, ...updates } : base
    );
    onBasesUpdate(updatedBases);
    setEditingBase(null);
  }, [bases, onBasesUpdate]);

  const handleDeleteBase = useCallback((baseId: string) => {
    if (confirm("Are you sure you want to delete this base?")) {
      const updatedBases = bases.filter(base => base.id !== baseId);
      onBasesUpdate(updatedBases);
      if (selectedBase?.id === baseId) {
        setSelectedBase(null);
      }
    }
  }, [bases, onBasesUpdate, selectedBase]);

  const getNfcStatusColor = (linked: boolean) => {
    return linked ? "text-green-600" : "text-yellow-600";
  };

  const getNfcStatusIcon = (linked: boolean) => {
    return linked ? <Link className="w-4 h-4" /> : <Unlink className="w-4 h-4" />;
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="base-management-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 id="base-management-title" className="text-2xl font-bold text-gray-900">
              Manage Bases
            </h2>
            <p className="text-gray-600 mt-1">
              Create and manage bases for your game. Click on the map to add new bases.
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
          {/* Map Section */}
          <div className="flex-1 p-6">
            <div className="h-full rounded-lg border border-gray-200 overflow-hidden">
              <MapPicker
                onLocationSelect={handleLocationSelect}
                initialLocation={selectedBase ? { lat: selectedBase.latitude, lng: selectedBase.longitude } : undefined}
                height="400px"
              />
            </div>
          </div>

          {/* Base List Section */}
          <div className="w-96 border-l border-gray-200 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Bases</h3>
              <button
                onClick={() => {/* Open create mode */}}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Base
              </button>
            </div>

            {bases.length === 0 ? (
              <div className="text-center py-8">
                <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No bases created yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Click on the map or use the &quot;Add Base&quot; button to create your first base
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {bases.map((base) => (
                  <div
                    key={base.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedBase?.id === base.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setSelectedBase(base)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{base.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {base.latitude.toFixed(4)}, {base.longitude.toFixed(4)}
                        </p>
                        {base.description && (
                          <p className="text-sm text-gray-500 mt-1">{base.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <div className={`flex items-center gap-1 ${getNfcStatusColor(base.nfcLinked)}`}>
                          {getNfcStatusIcon(base.nfcLinked)}
                          <span className="text-xs">
                            {base.nfcLinked ? "Linked" : "Unlinked"}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBase(base);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBase(base.id);
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
        </div>

        {/* Base Edit Modal */}
        {editingBase && (
          <BaseEditModal
            base={editingBase}
            onSave={(updates) => handleUpdateBase(editingBase.id, updates)}
            onCancel={() => setEditingBase(null)}
          />
        )}
      </div>
    </div>
  );
}

// Base Edit Modal Component
interface BaseEditModalProps {
  base: Base;
  onSave: (updates: Partial<Base>) => void;
  onCancel: () => void;
}

function BaseEditModal({ base, onSave, onCancel }: BaseEditModalProps) {
  const [name, setName] = useState(base.name);
  const [description, setDescription] = useState(base.description || "");
  const [isLocationDependent, setIsLocationDependent] = useState(base.isLocationDependent);

  const handleSave = () => {
    onSave({
      name: name.trim(),
      description: description.trim(),
      isLocationDependent,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Base</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Base Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Describe what teams will find at this base..."
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
                  Location-dependent (requires physical presence)
                </span>
              </label>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-600">
                <strong>UUID:</strong> {base.uuid}
              </p>
              <p className="text-xs text-gray-600">
                <strong>Coordinates:</strong> {base.latitude.toFixed(6)}, {base.longitude.toFixed(6)}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
