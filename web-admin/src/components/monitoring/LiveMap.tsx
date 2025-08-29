import { MapPin, Users, Navigation } from "lucide-react";
import dynamic from "next/dynamic";
import { Base, Team, TeamLocation } from "@/types";

// Dynamically import the map to avoid SSR issues
const InteractiveMap = dynamic(() => import("@/components/maps/InteractiveMap"), {
  ssr: false,
  loading: () => <div className="bg-gray-100 animate-pulse rounded-lg" style={{ height: "400px" }} />,
});


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

  // Convert team last locations to TeamLocation format
  const teamLocations: TeamLocation[] = teams
    .filter(team => team.lastLocation)
    .map(team => ({
      teamId: team.id,
      teamName: team.name,
      latitude: team.lastLocation!.latitude,
      longitude: team.lastLocation!.longitude,
      accuracy: 10, // Default accuracy
      deviceId: "unknown", // Could be enhanced with actual device tracking
      timestamp: team.lastLocation!.timestamp,
    }));

  return (
    <div className="space-y-6">
      {/* Map Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Bases</span>
          </div>
          <span className="text-2xl font-bold text-gray-900">{bases.length}</span>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-green-600" />
            <span className="font-medium">Teams</span>
          </div>
          <span className="text-2xl font-bold text-gray-900">{teams.length}</span>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Navigation className="w-4 h-4 text-purple-600" />
            <span className="font-medium">Active</span>
          </div>
          <span className="text-2xl font-bold text-gray-900">{activeTeams.length}</span>
        </div>
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-yellow-600" />
            <span className="font-medium">Status</span>
          </div>
          <span className="text-sm font-medium text-gray-900 capitalize">{gameStatus}</span>
        </div>
      </div>

      {/* Interactive Map */}
      <InteractiveMap
        bases={bases}
        teams={teams}
        teamLocations={teamLocations}
        height="400px"
        className="rounded-lg overflow-hidden border border-gray-200"
      />

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
