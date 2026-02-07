import type { User } from "@/types";
import apiClient from "./client";

export const usersApi = {
  list: async (): Promise<User[]> => {
    const { data } = await apiClient.get("/users");
    return data;
  },

  getMe: async (): Promise<User> => {
    const { data } = await apiClient.get("/users/me");
    return data;
  },

  getByIds: async (ids: string[]): Promise<User[]> => {
    if (ids.length === 0) return [];
    const { data } = await apiClient.get("/users");
    return (data as User[]).filter((u) => ids.includes(u.id));
  },

  listOperators: async (): Promise<User[]> => {
    const { data } = await apiClient.get("/users");
    return (data as User[]).filter((u) => u.role === "operator");
  },
};
