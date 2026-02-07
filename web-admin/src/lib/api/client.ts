import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach access token
apiClient.interceptors.request.use((config) => {
  const authData = localStorage.getItem("scout-auth");
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      const token = parsed.state?.accessToken;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore parse errors
    }
  }
  return config;
});

// Response interceptor: handle 401 and refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const authData = localStorage.getItem("scout-auth");
        if (!authData) throw new Error("No auth data");

        const parsed = JSON.parse(authData);
        const refreshToken = parsed.state?.refreshToken;
        if (!refreshToken) throw new Error("No refresh token");

        // Call refresh endpoint directly (no interceptor to avoid loops)
        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } = response.data;

        // Update stored tokens
        const updatedState = {
          ...parsed,
          state: {
            ...parsed.state,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            user,
          },
        };
        localStorage.setItem("scout-auth", JSON.stringify(updatedState));

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch {
        // Refresh failed - clear auth and redirect to login
        localStorage.removeItem("scout-auth");
        window.location.href = "/login";
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
