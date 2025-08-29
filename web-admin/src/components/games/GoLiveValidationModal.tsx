"use client";

import { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Play, Tag, Users, FileText, MapPin, ExternalLink } from 'lucide-react';

interface Base {
  id: string;
  name: string;
  nfcLinked: boolean;
}

interface Team {
  id: string;
  name: string;
  members: string[];
}

interface Enigma {
  id: string;
  title: string;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  category: 'bases' | 'teams' | 'enigmas' | 'nfc';
  title: string;
  description: string;
  action?: string;
  count?: number;
}

interface GoLiveValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  bases: Base[];
  teams: Team[];
  enigmas: Enigma[];
  isLoading?: boolean;
  gameName: string;
}

export default function GoLiveValidationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  bases, 
  teams, 
  enigmas, 
  isLoading = false,
  gameName 
}: GoLiveValidationModalProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Validate game readiness
  const validateGameReadiness = (): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];

    // Base validation
    if (bases.length === 0) {
      issues.push({
        type: 'error',
        category: 'bases',
        title: 'No bases created',
        description: 'At least one base is required to start the game.',
        action: 'Create bases in the Bases tab'
      });
    } else {
      const unlinkedBases = bases.filter(base => !base.nfcLinked);
      if (unlinkedBases.length > 0) {
        issues.push({
          type: 'error',
          category: 'nfc',
          title: 'NFC tags not linked',
          description: `${unlinkedBases.length} base(s) don't have NFC tags linked.`,
          action: 'Use mobile app to link NFC tags to bases',
          count: unlinkedBases.length
        });
      }
    }

    // Team validation
    if (teams.length === 0) {
      issues.push({
        type: 'error',
        category: 'teams',
        title: 'No teams created',
        description: 'At least one team is required to start the game.',
        action: 'Create teams in the Teams tab'
      });
    } else {
      const teamsWithoutMembers = teams.filter(team => team.members.length === 0);
      if (teamsWithoutMembers.length > 0) {
        issues.push({
          type: 'warning',
          category: 'teams',
          title: 'Teams without members',
          description: `${teamsWithoutMembers.length} team(s) have no members yet.`,
          action: 'Teams can join using invite codes during the game',
          count: teamsWithoutMembers.length
        });
      }
    }

    // Enigma validation
    if (enigmas.length === 0) {
      issues.push({
        type: 'warning',
        category: 'enigmas',
        title: 'No enigmas created',
        description: 'While not required, enigmas add challenges to the game.',
        action: 'Create enigmas in the Enigmas tab'
      });
    } else if (enigmas.length < bases.length) {
      issues.push({
        type: 'warning',
        category: 'enigmas',
        title: 'Fewer enigmas than bases',
        description: `You have ${enigmas.length} enigma(s) for ${bases.length} base(s).`,
        action: 'Consider creating more enigmas for variety'
      });
    }

    return issues;
  };

  const issues = validateGameReadiness();
  const errors = issues.filter(issue => issue.type === 'error');
  const warnings = issues.filter(issue => issue.type === 'warning');
  const canGoLive = errors.length === 0;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bases':
        return MapPin;
      case 'teams':
        return Users;
      case 'enigmas':
        return FileText;
      case 'nfc':
        return Tag;
      default:
        return AlertCircle;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Play className="w-5 h-5 text-green-600" />
              Go Live Validation
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Checking readiness for: <strong>{gameName}</strong>
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
          {/* Overall Status */}
          <div className={`rounded-lg p-4 mb-6 flex items-start gap-3 ${
            canGoLive ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            {canGoLive ? (
              <>
                <CheckCircle2 className="w-6 h-6 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-green-800 mb-1">Ready to Go Live! 🎉</h3>
                  <p className="text-sm text-green-700">
                    All required validation checks have passed. Your game is ready to start.
                  </p>
                  {warnings.length > 0 && (
                    <p className="text-sm text-green-700 mt-2">
                      There are {warnings.length} optional improvement(s) you might want to consider.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="w-6 h-6 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-red-800 mb-1">Cannot Go Live</h3>
                  <p className="text-sm text-red-700">
                    {errors.length} critical issue(s) must be resolved before starting the game.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Game Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <MapPin className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{bases.length}</p>
              <p className="text-sm text-gray-600">Bases</p>
              <p className="text-xs text-gray-500 mt-1">
                {bases.filter(b => b.nfcLinked).length} NFC linked
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <Users className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{teams.length}</p>
              <p className="text-sm text-gray-600">Teams</p>
              <p className="text-xs text-gray-500 mt-1">
                {teams.reduce((sum, t) => sum + t.members.length, 0)} total members
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <FileText className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{enigmas.length}</p>
              <p className="text-sm text-gray-600">Enigmas</p>
              <p className="text-xs text-gray-500 mt-1">Challenges created</p>
            </div>
          </div>

          {/* Issues List */}
          {issues.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  Validation Results ({issues.length} total)
                </h3>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {showDetails ? 'Hide Details' : 'Show Details'}
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              {/* Critical Errors */}
              {errors.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-red-800 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Critical Issues ({errors.length})
                  </h4>
                  <div className="space-y-3">
                    {errors.map((issue, index) => {
                      const Icon = getCategoryIcon(issue.category);
                      return (
                        <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <div className="flex items-start gap-3">
                            <Icon className="w-5 h-5 text-red-600 mt-0.5" />
                            <div className="flex-1">
                              <h5 className="font-medium text-red-800">{issue.title}</h5>
                              <p className="text-sm text-red-700 mt-1">{issue.description}</p>
                              {showDetails && issue.action && (
                                <p className="text-sm text-red-600 mt-2 font-medium">
                                  → {issue.action}
                                </p>
                              )}
                            </div>
                            {issue.count && (
                              <span className="bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full">
                                {issue.count}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-yellow-800 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Optional Improvements ({warnings.length})
                  </h4>
                  <div className="space-y-3">
                    {warnings.map((issue, index) => {
                      const Icon = getCategoryIcon(issue.category);
                      return (
                        <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-start gap-3">
                            <Icon className="w-5 h-5 text-yellow-600 mt-0.5" />
                            <div className="flex-1">
                              <h5 className="font-medium text-yellow-800">{issue.title}</h5>
                              <p className="text-sm text-yellow-700 mt-1">{issue.description}</p>
                              {showDetails && issue.action && (
                                <p className="text-sm text-yellow-600 mt-2 font-medium">
                                  → {issue.action}
                                </p>
                              )}
                            </div>
                            {issue.count && (
                              <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded-full">
                                {issue.count}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No Issues */}
          {issues.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Perfect Setup!</h3>
              <p className="text-gray-600">
                Your game configuration looks excellent and is ready to go live.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center text-sm text-gray-600">
            {canGoLive ? (
              <span className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                Ready to start
              </span>
            ) : (
              <span className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-4 h-4" />
                {errors.length} issue(s) to resolve
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!canGoLive || isLoading}
              className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                canGoLive && !isLoading
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-400 text-white cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Go Live
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}