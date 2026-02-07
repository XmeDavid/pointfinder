import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Card className="py-12">
      <CardContent className="text-center">
        <Icon className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-lg font-medium mb-1">{title}</h3>
        <p className="text-muted-foreground text-sm mb-4 max-w-md mx-auto">{description}</p>
        {actionLabel && onAction && (
          <Button onClick={onAction}>
            <Plus className="mr-2 h-4 w-4" />
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
