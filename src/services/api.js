import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  // In Electron, get token through window.electronAuth
  const token = await window.electronAuth.getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  response => response,
  error => {
    // Handle auth errors, network errors, etc.
    if (error.response?.status === 401) {
      // Handle unauthorized
      console.log('Unauthorized request - auth token may be invalid');
    }
    return Promise.reject(error);
  }
);

// User API endpoints
export const getUserProfile = () => api.get('/users/me');
export const syncUserProfile = () => api.post('/users/sync');
export const updateUserProfile = (userData) => api.put('/users/me/profile', userData);
export const updateUserPreferences = (preferences) => api.put('/users/me/preferences', { preferences });
export const getSubscriptionTier = () => api.get('/users/me/subscription-tier');

export default api; 