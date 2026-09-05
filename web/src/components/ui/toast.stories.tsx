import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";
import { useToast } from "@/hooks/useToast";

const meta: Meta<typeof Toaster> = { title: "Core/Toast", component: Toaster };
export default meta;
type Story = StoryObj<typeof Toaster>;

function Demo() {
  const toast = useToast();
  return (
    <div className="flex gap-2">
      <Button onClick={() => toast.success("Tag written")}>Success</Button>
      <Button variant="outline" onClick={() => toast.info("Syncing 2 actions…")}>Info</Button>
      <Button variant="destructive" onClick={() => toast.error("Could not reach the server")}>Error</Button>
      <Toaster />
    </div>
  );
}

export const Playground: Story = { render: () => <Demo /> };
