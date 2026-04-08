/**
 * useGameTagsMap — resolves game tag IDs to Tag objects.
 *
 * Fetches via GET /api/games/{gameId}/tags and returns a stable
 * Map<string, Tag> so consumers can do O(1) lookups of tagId → Tag.
 *
 * Uses React Query with the ["tags", gameId] key so that mutations in
 * ManageTagsDialog (create/update/delete) can invalidate it and all
 * consumers re-render automatically.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { tagsApi } from "@/lib/api/tags";
import type { Tag } from "@/types";

export function useGameTagsMap(gameId: string | undefined): {
  tagsMap: Map<string, Tag>;
  tags: Tag[];
  isLoading: boolean;
} {
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags", gameId],
    queryFn: () => tagsApi.listByGame(gameId!),
    enabled: !!gameId,
    staleTime: 30_000,
  });

  const tagsMap = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );

  return { tagsMap, tags, isLoading };
}
