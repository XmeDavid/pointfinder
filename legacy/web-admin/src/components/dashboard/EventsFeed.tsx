export type EventItem = {
  id: string;
  type: string;
  teamId?: string;
  message: string;
  createdAt: string;
};

export default function EventsFeed({ events }: { events: EventItem[] }) {
  return (
    <div className="border rounded p-3 space-y-2 max-h-[300px] overflow-auto">
      {events.map((e) => (
        <div key={e.id} className="text-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-gray-500">{new Date(e.createdAt).toLocaleTimeString()}</span>
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{e.type}</span>
          </div>
          <div>{e.message}</div>
        </div>
      ))}
    </div>
  );
}


