"use client";

import { useState, useEffect, useCallback } from 'react';
import { X, Tag, RefreshCw, AlertCircle, CheckCircle2, Smartphone, ExternalLink } from 'lucide-react';
import { api } from '@/lib/apiClient';

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

interface NFCTag {
  id: string;
  tagUuid: string;
  gameId: string;
  baseId: string;
  baseName: string;
  linkedAt: string;
  isActive: boolean;
}

interface NFCStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  gameName: string;
  bases: Base[];
  onUpdate?: () => void;
}

export default function NFCStatusModal({ 
  isOpen, 
  onClose, 
  gameId, 
  gameName, 
  bases, 
  onUpdate 
}: NFCStatusModalProps) {
  const [nfcTags, setNfcTags] = useState<NFCTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing NFC tags for this game
  const fetchNFCTags = useCallback(async () => {
    if (!isOpen || !gameId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const tags = await api.get(`api/nfc/games/${gameId}/tags`).json() as NFCTag[];
      setNfcTags(tags);
    } catch (err) {
      setError('Failed to load NFC tags status');
      console.error('Failed to fetch NFC tags:', err);
    } finally {
      setLoading(false);
    }
  }, [isOpen, gameId]);

  useEffect(() => {
    fetchNFCTags();
  }, [fetchNFCTags]);

  // Create a comprehensive status list of all bases
  const baseStatuses = bases.map(base => {
    const linkedTag = nfcTags.find(tag => tag.baseId === base.id);
    return {
      ...base,
      linkedTag,
      isLinked: !!linkedTag,
      tagUuid: linkedTag?.tagUuid || null,
      linkedAt: linkedTag?.linkedAt || null,
      isActive: linkedTag?.isActive || false,
    };
  });

  const linkedCount = baseStatuses.filter(base => base.isLinked).length;
  const totalBases = bases.length;
  const percentageLinked = totalBases > 0 ? Math.round((linkedCount / totalBases) * 100) : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-600" />
              NFC Tag Status
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              View NFC tag linking status for game: <strong>{gameName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-12rem)]">
          {/* Error Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Overall Status Card */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Overall NFC Status</h3>
              <button
                onClick={fetchNFCTags}
                disabled={loading}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-3 py-1 rounded-lg hover:bg-white/50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-gray-600">Linked Bases</span>
                </div>
                <div className="text-2xl font-bold text-green-600">{linkedCount}</div>
              </div>
              
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-gray-600">Total Bases</span>
                </div>
                <div className="text-2xl font-bold text-blue-600">{totalBases}</div>
              </div>
              
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ExternalLink className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-medium text-gray-600">Completion</span>
                </div>
                <div className="text-2xl font-bold text-purple-600">{percentageLinked}%</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>NFC Linking Progress</span>
                <span>{linkedCount} of {totalBases} bases</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${percentageLinked}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Instructions Card */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Smartphone className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-amber-800 mb-1">How to Link NFC Tags</h4>
                <p className="text-sm text-amber-700">
                  NFC tags must be linked using the mobile app by operators with NFC-enabled devices. 
                  Once linked, the status will be updated here automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Base Status Table */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Base NFC Status
            </h3>

            {loading && baseStatuses.length === 0 ? (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" />
                <p className="text-gray-600">Loading NFC status...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Base Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        NFC Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tag UUID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Linked Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {baseStatuses.map((base) => (
                      <tr key={base.id} className={`hover:bg-gray-50 ${!base.isLinked ? 'bg-red-50' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${base.isLinked ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className="text-sm font-medium text-gray-900">{base.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            base.isLinked 
                              ? base.isActive 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {base.isLinked 
                              ? base.isActive 
                                ? 'Active' 
                                : 'Inactive'
                              : 'Not Linked'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {base.tagUuid ? (
                            <div className="flex items-center gap-2">
                              <Tag className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-mono text-gray-900">{base.tagUuid}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {base.linkedAt ? new Date(base.linkedAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <div>{base.latitude.toFixed(6)}, {base.longitude.toFixed(6)}</div>
                            {base.isLocationDependent && (
                              <span className="text-xs text-blue-600">Location Required</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Summary at bottom */}
          {baseStatuses.length > 0 && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Ready for game: </span>
                  <span className={`font-bold ${linkedCount === totalBases ? 'text-green-600' : 'text-red-600'}`}>
                    {linkedCount === totalBases ? 'Yes' : `No (${totalBases - linkedCount} bases need NFC tags)`}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Last updated: </span>
                  <span className="text-gray-600">{new Date().toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}