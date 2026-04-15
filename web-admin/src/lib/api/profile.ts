import apiClient from './client'

export interface UpdateProfilePayload {
  name?: string
  email?: string
}

export interface UpdateProfileResponse {
  user: {
    id: string
    email: string
    name: string
    role: string
    createdAt: string
  }
  message: string | null
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
  refreshToken: string
}

export const profileApi = {
  updateProfile: async (payload: UpdateProfilePayload): Promise<UpdateProfileResponse> => {
    const { data } = await apiClient.put('/users/me', payload)
    return data
  },

  changePassword: async (payload: ChangePasswordPayload): Promise<{ message: string }> => {
    const { data } = await apiClient.post('/auth/change-password', payload)
    return data
  },

  deleteAccount: async (): Promise<void> => {
    await apiClient.delete('/users/me')
  },
}
