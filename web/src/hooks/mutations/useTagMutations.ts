import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tagsApi } from '@/lib/api/tags'
import type { CreateTagDto, UpdateTagDto } from '@/lib/api/tags'

export function useCreateTag(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: CreateTagDto) => tagsApi.createTag(gameId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', gameId] }),
  })
}

export function useUpdateTag(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tagId, dto }: { tagId: string; dto: UpdateTagDto }) =>
      tagsApi.updateTag(gameId, tagId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', gameId] }),
  })
}

export function useDeleteTag(gameId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) => tagsApi.deleteTag(gameId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', gameId] }),
  })
}
