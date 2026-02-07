"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/apiClient";
import OperatorsTable from "@/components/operators/OperatorsTable";
import InviteOperatorModal from "@/components/operators/InviteOperatorModal";
import OperatorDetailsModal from "@/components/operators/OperatorDetailsModal";
import PendingInvitationsTable from "@/components/operators/PendingInvitationsTable";

interface Operator {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  gameCount: number;
  status: "active" | "pending" | "inactive";
}

interface Invitation {
  email: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: "pending" | "used" | "expired";
}

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const fetchOperators = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("api/admin/operators?limit=100").json() as { operators: Operator[], total: number, hasMore: boolean };
      setOperators(response.operators || []);
    } catch (err) {
      console.error("Failed to fetch operators:", err);
      setError("Failed to load operators. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchInvitations = async () => {
    setInvitationsLoading(true);
    try {
      const response = await api.get("api/admin/operators/invitations?limit=100").json() as { invitations: Invitation[], total: number, hasMore: boolean };
      setInvitations(response.invitations || []);
    } catch (err) {
      console.error("Failed to fetch invitations:", err);
    } finally {
      setInvitationsLoading(false);
    }
  };

  useEffect(() => {
    fetchOperators();
    fetchInvitations();
  }, []);

  const handleInviteSuccess = () => {
    fetchOperators();
    fetchInvitations();
  };

  const handleViewOperator = (operator: Operator) => {
    setSelectedOperator(operator);
    setShowDetailsModal(true);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading operators...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchOperators}
              className="mt-3 text-sm text-red-700 hover:text-red-800 underline"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Operator Management</h1>
          <p className="text-gray-600 mt-1">
            Manage operators who can create and run games
          </p>
        </div>

        <OperatorsTable
          operators={operators}
          onRefresh={fetchOperators}
          onInviteOperator={() => setShowInviteModal(true)}
          onViewOperator={handleViewOperator}
        />

        {invitationsLoading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading invitations...</p>
            </div>
          </div>
        ) : (
          <PendingInvitationsTable
            invitations={invitations}
            onRefresh={fetchInvitations}
          />
        )}
      </div>

      <InviteOperatorModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={handleInviteSuccess}
      />

      <OperatorDetailsModal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedOperator(null);
        }}
        operator={selectedOperator}
        onOperatorUpdate={fetchOperators}
      />
    </div>
  );
}
