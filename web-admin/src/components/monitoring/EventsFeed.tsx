import { MapPin, Users, Trophy, Clock, Zap, CheckCircle, AlertCircle } from "lucide-react";

interface Event {
  id: string;
  type: string;
  teamId: string;
  teamName: string;
  message: string;
  createdAt: string;
}

interface EventsFeedProps {
  events: Event[];
}

export default function EventsFeed({ events }: EventsFeedProps) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case "tap":
      case "arrived":
        return <MapPin className="w-4 h-4 text-blue-600" />;
      case "completed":
      case "solve":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "locationPing":
        return <Zap className="w-4 h-4 text-yellow-600" />;
      case "error":
      case "warning":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "tap":
      case "arrived":
        return "bg-blue-50 border-blue-200";
      case "completed":
      case "solve":
        return "bg-green-50 border-green-200";
      case "locationPing":
        return "bg-yellow-50 border-yellow-200";
      case "error":
      case "warning":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {events.map((event) => (
        <div
          key={event.id}
          className={`p-3 rounded-lg border ${getEventColor(event.type)} transition-all hover:shadow-sm`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {getEventIcon(event.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {event.teamName}
                </p>
                <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                  {formatTime(event.createdAt)}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {event.message}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white bg-opacity-50 text-gray-600">
                  {event.type}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
