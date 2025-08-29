"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/authStore";

export default function DebugPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const auth = useAuthStore();

  const testAuth = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/test-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Authentication Debug</h1>
        
        <div className="bg-white rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Current Auth State</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify({
              token: auth.token ? "***" : null,
              user: auth.user,
              isAuthenticated: auth.isAuthenticated()
            }, null, 2)}
          </pre>
        </div>

        <div className="bg-white rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Test Admin Login</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="password"
              />
            </div>
            <button
              onClick={testAuth}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {loading ? "Testing..." : "Test Login"}
            </button>
          </div>
        </div>

        {result && (
          <div className="bg-white rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Result</h2>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
