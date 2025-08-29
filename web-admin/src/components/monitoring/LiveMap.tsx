import { MapPin, Users, Navigation } from "lucide-react";

interface Team {
  id: string;
  name: string;
  number: number;
  inviteCode: string;
  members: string[];
  leaderId?: string;
  createdAt: string;
  lastLocation?: {
    latitude: number;
    longitude: number;
    timestamp: string;
  };
  progress: Array<{
    baseId: string;
    baseName: string;
    arrivedAt?: string;
    solvedAt?: string;
    completedAt?: string;
    score: number;
  }>;
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

interface LiveMapProps {
  bases: Base[];
  teams: Team[];
  gameStatus: string;
}

export default function LiveMap({ bases, teams, gameStatus }: LiveMapProps) {
  const activeTeams = teams.filter(team => 
    team.lastLocation && 
    new Date(team.lastLocation.timestamp).getTime() > Date.now() - 5 * 60 * 1000
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    return date.toLocaleTimeString();
  };

  return (
    <div className="space-y-6">
      {/* Map Placeholder */}
      <div className="bg-gray-100 rounded-lg p-8 text-center border-2 border-dashed border-gray-300">
        <Navigation className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Interactive Map</h3>
        <p className="text-gray-600 mb-4">
          {gameStatus === "live" 
            ? "Real-time team locations and base status will be displayed here"
            : "Map will be available when the game goes live"
          }
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="bg-white rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="font-medium">Bases</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">{bases.length}</span>
          </div>
          <div className="bg-white rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-green-600" />
              <span className="font-medium">Teams</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">{teams.length}</span>
          </div>
          <div className="bg-white rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Navigation className="w-4 h-4 text-purple-600" />
              <span className="font-medium">Active</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">{activeTeams.length}</span>
          </div>
          <div className="bg-white rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-yellow-600" />
              <span className="font-medium">Status</span>
            </div>
            <span className="text-sm font-medium text-gray-900 capitalize">{gameStatus}</span>
          </div>
        </div>
      </div>

      {/* Active Teams */}
      {gameStatus === "live" && activeTeams.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-3">Active Teams</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTeams.map((team) => (
              <div key={team.id} className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {team.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-900">{team.name}</h5>
                    <p className="text-sm text-gray-600">{team.members.length} members</p>
                  </div>
                </div>
                {team.lastLocation && (
                  <div className="text-sm text-gray-600">
                    <p>📍 {team.lastLocation.latitude.toFixed(4)}, {team.lastLocation.longitude.toFixed(4)}</p>
                    <p>🕒 {formatTime(team.lastLocation.timestamp)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Base Locations */}
      <div>
        <h4 className="text-lg font-medium text-gray-900 mb-3">Base Locations</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bases.map((base) => (
            <div key={base.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                                  <h5 className="font-medium text-gray-900">{base.name}</h5>
              </div>
              <div className="text-sm text-gray-600">
                <p>📍 {base.latitude.toFixed(4)}, {base.longitude.toFixed(4)}</p>
                <p>🎯 Base ID: {base.id.slice(0, 8)}...</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
