import { useOperatorPresenceStore } from "@/hooks/useOperatorPresence";

const MAX_VISIBLE = 4;

export function OperatorPresence() {
  const operators = useOperatorPresenceStore((s) => s.operators);

  if (operators.length === 0) return null;

  const visible = operators.slice(0, MAX_VISIBLE);
  const overflow = operators.length - MAX_VISIBLE;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((op) => (
        <div
          key={op.id}
          title={op.name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground text-xs font-medium"
        >
          {op.initials}
        </div>
      ))}
      {overflow > 0 && (
        <div
          title={operators.slice(MAX_VISIBLE).map((op) => op.name).join(", ")}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground text-xs font-medium"
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
