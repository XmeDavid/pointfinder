import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "./button";
import { ConfirmDeleteDialog } from "./confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

const meta: Meta<typeof Dialog> = { title: "Core/Dialog", component: Dialog };
export default meta;
type Story = StoryObj<typeof Dialog>;

export const Basic: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rewrite this tag?</DialogTitle>
              <DialogDescription>The old URL on the tag will be replaced. Players with the old link keep working.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => setOpen(false)}>Rewrite</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
};

export const ConfirmDelete: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>Delete team</Button>
        <ConfirmDeleteDialog
          open={open}
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
          title="Delete Falcons?"
          description="Their check-ins and answers are kept for the audit trail, but the team can no longer play."
        />
      </>
    );
  },
  parameters: { docs: { description: { story: "ConfirmDeleteDialog reads common.cancel and common.delete from the host app's i18n." } } },
};
