"use client";

import { useState } from "react";
import { Mail, Calendar, Clock, X, RefreshCw, Copy, CheckCircle } from "lucide-react";
import { api } from "@/lib/apiClient";

interface Invitation {
  email: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: "pending" | "used" | "expired";
}

interface PendingInvitationsTableProps {
  invitations: Invitation[];
  onRefresh: () => void;
}

export default function PendingInvitationsTable({ invitations, onRefresh }: PendingInvitationsTableProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCancelInvitation = async (token: string, email: string) => {
    if (!confirm(`Are you sure you want to cancel the invitation for ${email}?`)) {
      return;
    }

    setLoading(token);
    try {
      await api.delete(`api/admin/operators/invitations/${token}`);
      onRefresh();
    } catch (error) {
      console.error("Failed to cancel invitation:", error);
      alert("Failed to cancel invitation");
    } finally {
      setLoading(null);
    }
  };

  const handleCopyLink = async (token: string) => {
    const inviteLink = `https://dbvnfc-games-web-neon.vercel.app/register?token=${token}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "used":
        return "bg-green-100 text-green-800";
      case "expired":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = expires.getTime() - now.getTime();
    
    if (diffMs <= 0) return "Expired";
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours >= 24) {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ${diffHours % 24}h remaining`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m remaining`;
    } else {
      return `${diffMinutes}m remaining`;
    }
  };

  if (invitations.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-8">
          <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No pending invitations</h3>
          <p className="text-gray-600">All invitations have been used or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Pending Invitations</h3>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expires
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invitations.map((invitation) => (
              <tr key={invitation.token} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <Mail className="w-4 h-4 text-gray-400 mr-2" />
                    <span className="text-sm font-medium text-gray-900">{invitation.email}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(invitation.status)}`}>
                    {invitation.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 text-gray-400 mr-1" />
                    {new Date(invitation.createdAt).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 text-gray-400 mr-1" />
                    {invitation.status === "pending" ? formatTimeRemaining(invitation.expiresAt) : 
                     invitation.status === "expired" ? "Expired" : "Used"}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    {invitation.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleCopyLink(invitation.token)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded"
                          title="Copy invitation link"
                        >
                          {copied === invitation.token ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleCancelInvitation(invitation.token, invitation.email)}
                          disabled={loading === invitation.token}
                          className="text-red-600 hover:text-red-900 p-1 rounded disabled:opacity-50"
                          title="Cancel invitation"
                        >
                          {loading === invitation.token ? (
                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}