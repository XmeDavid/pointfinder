import ky from "ky";
import { useAuthStore } from "./authStore";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://dbvnfc-api.davidsbatista.com";

export const createApiClient = (getToken?: () => string | null) =>
  ky.create({
    prefixUrl: API_BASE_URL,
    headers: {
      "Content-Type": "application/json",
    },
    hooks: {
      beforeRequest: [
        (request) => {
          const token = getToken
            ? getToken()
            : typeof window !== "undefined"
            ? useAuthStore.getState().token
            : null;
          if (token) request.headers.set("Authorization", `Bearer ${token}`);
        },
      ],
    },
  });

export const api = createApiClient();


