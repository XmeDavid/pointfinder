import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi, type UpdateProfilePayload } from '@/lib/api/profile'
import { useAuthStore } from '@/lib/auth/store'
import { useNavigate } from 'react-router-dom'
import type { User } from '@/types'

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const setTokens = useAuthStore((s) => s.setTokens)
  const accessToken = useAuthStore((s) => s.accessToken)
  const refreshToken = useAuthStore((s) => s.refreshToken)

  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => profileApi.updateProfile(payload),
    onSuccess: (data) => {
      // Update the user in the auth store with the new data
      if (accessToken && refreshToken) {
        setTokens(accessToken, refreshToken, data.user as User)
      }
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] })
    },
  })
}

export function useChangePassword() {
  const refreshToken = useAuthStore((s) => s.refreshToken)

  return useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      profileApi.changePassword({
        ...payload,
        refreshToken: refreshToken ?? '',
      }),
  })
}

export function useDeleteAccount() {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => profileApi.deleteAccount(),
    onSuccess: () => {
      logout()
      navigate('/')
    },
  })
}
