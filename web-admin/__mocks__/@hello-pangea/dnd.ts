// Manual mock for @hello-pangea/dnd to prevent jsdom hangs in tests.
// The real library installs DOM observers that never resolve in jsdom.
import { vi } from "vitest";
import React from "react";

export const DragDropContext = ({ children }: { children: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

export const Droppable = ({
  children,
}: {
  children: (
    provided: {
      innerRef: (el: HTMLElement | null) => void;
      droppableProps: Record<string, unknown>;
      placeholder: null;
    },
    snapshot: { isDraggingOver: boolean }
  ) => React.ReactNode;
}) =>
  children(
    { innerRef: () => {}, droppableProps: {}, placeholder: null },
    { isDraggingOver: false }
  ) as React.ReactElement;

export const Draggable = ({
  children,
}: {
  children: (
    provided: {
      innerRef: (el: HTMLElement | null) => void;
      draggableProps: Record<string, unknown>;
      dragHandleProps: null;
    },
    snapshot: { isDragging: boolean }
  ) => React.ReactNode;
}) =>
  children(
    { innerRef: () => {}, draggableProps: {}, dragHandleProps: null },
    { isDragging: false }
  ) as React.ReactElement;

export const arrayMove = vi.fn((arr: unknown[], from: number, to: number) => {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
});

export type DropResult = {
  draggableId: string;
  source: { index: number; droppableId: string };
  destination: { index: number; droppableId: string } | null;
  type: string;
  mode: string;
  reason: string;
  combine: null;
};

export type DraggableProvidedDragHandleProps = Record<string, unknown> | null;
export type DraggableProvidedDraggableProps = Record<string, unknown>;
