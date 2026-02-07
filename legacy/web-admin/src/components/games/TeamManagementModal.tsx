"use client";

import { useState, useCallback } from "react";
import { X, Users, Plus, Edit, Trash2, Copy, Check, UserPlus } from "lucide-react";

interface Team {
  id: string;
  name: string;
  number: number;
  inviteCode: string;
  members: string[];
  leaderId?: string;
  createdAt: string;
}

interface TeamManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  teams: Team[];
  onTeamsUpdate: (teams: Team[]) => void;
}

export default function TeamManagementModal({
  isOpen,
  onClose,
  teams,
  onTeamsUpdate,
}: TeamManagementModalProps) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const generateInviteCode = useCallback(() => {
    // Generate a 6-character alphanumeric code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }, []);

  const handleCreateTeam = useCallback((name: string, count: number) => {
    const newTeams: Team[] = [];
    
    for (let i = 0; i < count; i++) {
      const teamNumber = teams.length + i + 1;
      const newTeam: Team = {
        id: crypto.randomUUID(),
        name: `${name} ${teamNumber}`,
        number: teamNumber,
        inviteCode: generateInviteCode(),
        members: [],
        createdAt: new Date().toISOString(),
      };
      newTeams.push(newTeam);
    }
    
    onTeamsUpdate([...teams, ...newTeams]);
    setShowCreateForm(false);
  }, [teams, onTeamsUpdate, generateInviteCode]);

  const handleUpdateTeam = useCallback((teamId: string, updates: Partial<Team>) => {
    const updatedTeams = teams.map(team => 
      team.id === teamId ? { ...team, ...updates } : team
    );
    onTeamsUpdate(updatedTeams);
    setEditingTeam(null);
  }, [teams, onTeamsUpdate]);

  const handleDeleteTeam = useCallback((teamId: string) => {
    if (confirm("Are you sure you want to delete this team? This action cannot be undone.")) {
      const updatedTeams = teams.filter(team => team.id !== teamId);
      onTeamsUpdate(updatedTeams);
      if (selectedTeam?.id === teamId) {
        setSelectedTeam(null);
      }
    }
  }, [teams, onTeamsUpdate, selectedTeam]);

  const handleCopyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-management-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 id="team-management-title" className="text-2xl font-bold text-gray-900">
              Manage Teams
            </h2>
            <p className="text-gray-600 mt-1">
              Create and manage teams for your game. Players will use invite codes to join teams.
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
          {/* Teams List Section */}
          <div className="w-96 border-r border-gray-200 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Teams</h3>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Teams
              </button>
            </div>

            {teams.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No teams created yet</p>
                <p className="text-sm text-gray-500 mt-1">
                  Click &quot;Add Teams&quot; to create teams for players to join
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedTeam?.id === team.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setSelectedTeam(team)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{team.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {team.members.length} members
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Code: {team.inviteCode}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCode(team.inviteCode);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title="Copy invite code"
                        >
                          {copiedCode === team.inviteCode ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTeam(team);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTeam(team.id);
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

          {/* Team Details Section */}
          <div className="flex-1 p-6 overflow-y-auto">
            {selectedTeam ? (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">{selectedTeam.name}</h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Team #{selectedTeam.number}
                  </span>
                </div>

                {/* Invite Code Section */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h4 className="font-medium text-gray-900 mb-2">Invite Code</h4>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 bg-white px-3 py-2 rounded border font-mono text-lg">
                      {selectedTeam.inviteCode}
                    </code>
                    <button
                      onClick={() => handleCopyCode(selectedTeam.inviteCode)}
                      className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      {copiedCode === selectedTeam.inviteCode ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    Share this code with players so they can join this team
                  </p>
                </div>

                {/* Team Members Section */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Team Members</h4>
                  {selectedTeam.members.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <UserPlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No members yet</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Players will appear here once they join using the invite code
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedTeam.members.map((member, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-blue-600">
                                {member.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium text-gray-900">{member}</span>
                            {selectedTeam.leaderId === member && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Leader
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Team Info */}
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Team Information</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p><strong>Created:</strong> {new Date(selectedTeam.createdAt).toLocaleDateString()}</p>
                    <p><strong>Members:</strong> {selectedTeam.members.length}</p>
                    <p><strong>Status:</strong> {selectedTeam.members.length > 0 ? "Active" : "Waiting for members"}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Team</h3>
                <p className="text-gray-600">
                  Choose a team from the list to view details and manage members
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Create Teams Modal */}
        {showCreateForm && (
          <CreateTeamsModal
            onCreate={handleCreateTeam}
            onCancel={() => setShowCreateForm(false)}
            existingCount={teams.length}
          />
        )}

        {/* Edit Team Modal */}
        {editingTeam && (
          <EditTeamModal
            team={editingTeam}
            onSave={(updates) => handleUpdateTeam(editingTeam.id, updates)}
            onCancel={() => setEditingTeam(null)}
          />
        )}
      </div>
    </div>
  );
}

// Create Teams Modal Component
interface CreateTeamsModalProps {
  onCreate: (name: string, count: number) => void;
  onCancel: () => void;
  existingCount: number;
}

function CreateTeamsModal({ onCreate, onCancel, existingCount }: CreateTeamsModalProps) {
  const [name, setName] = useState("Team");
  const [count, setCount] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && count > 0) {
      onCreate(name.trim(), count);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Teams</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Team Name Base
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Team, Squad, Group"
              />
              <p className="text-xs text-gray-500 mt-1">
                Teams will be named: {name} {existingCount + 1}, {name} {existingCount + 2}, etc.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Teams
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={count}
                onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

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
                Create {count} Team{count > 1 ? 's' : ''}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Edit Team Modal Component
interface EditTeamModalProps {
  team: Team;
  onSave: (updates: Partial<Team>) => void;
  onCancel: () => void;
}

function EditTeamModal({ team, onSave, onCancel }: EditTeamModalProps) {
  const [name, setName] = useState(team.name);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave({ name: name.trim() });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Team</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Team Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-600">
                <strong>Team Number:</strong> {team.number}
              </p>
              <p className="text-xs text-gray-600">
                <strong>Invite Code:</strong> {team.inviteCode}
              </p>
              <p className="text-xs text-gray-600">
                <strong>Members:</strong> {team.members.length}
              </p>
            </div>

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
