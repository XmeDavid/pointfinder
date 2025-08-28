"use client";

import { useState } from "react";
import { Mail, Users, Calendar, Eye, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/apiClient";

interface Operator {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  gameCount: number;
  status: "active" | "pending" | "inactive";
}

interface OperatorsTableProps {
  operators: Operator[];
  onRefresh: () => void;
  onInviteOperator: () => void;
  onViewOperator: (operator: Operator) => void;
}

export default function OperatorsTable({ 
  operators, 
  onRefresh, 
  onInviteOperator,
  onViewOperator 
}: OperatorsTableProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleDeleteOperator = async (operatorId: string) => {
    if (!confirm("Are you sure you want to delete this operator? This action cannot be undone.")) {
      return;
    }

    setLoading(operatorId);
    try {
      await api.delete(`api/admin/operators/${operatorId}`);
      onRefresh();
    } catch (error) {
      console.error("Failed to delete operator:", error);
      alert("Failed to delete operator");
    } finally {
      setLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "inactive":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Operators</h3>
          <button 
            onClick={onInviteOperator}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Invite Operator
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Operator
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Games
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {operators.map((operator) => (
              <tr key={operator.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-sm font-medium text-white">
                          {operator.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{operator.name}</div>
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {operator.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(operator.status)}`}>
                    {operator.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-gray-400" />
                    {operator.gameCount} games
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {new Date(operator.createdAt).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onViewOperator(operator)}
                      className="text-blue-600 hover:text-blue-900 p-1 rounded"
                      title="View operator details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      className="text-red-600 hover:text-red-900 p-1 rounded disabled:opacity-50"
                      onClick={() => handleDeleteOperator(operator.id)}
                      disabled={loading === operator.id}
                      title="Delete operator"
                    >
                      {loading === operator.id ? (
                        <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {operators.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No operators yet</h3>
          <p className="text-gray-600 mb-6">Invite your first operator to start creating games</p>
          <button
            onClick={onInviteOperator}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
          >
            <UserPlus className="w-5 h-5" />
            Invite First Operator
          </button>
        </div>
      )}
    </div>
  );
}
