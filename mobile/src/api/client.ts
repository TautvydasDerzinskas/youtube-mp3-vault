import axios from 'axios';
import { tokenStorage } from '../auth/tokenStorage';
import { showToast } from '../utils/toast';

// baseURL isn't known at import time — ServerConfigContext sets
// client.defaults.baseURL once the saved (or dev-override) server address
// is loaded, before this client is used for any real request.
const client = axios.create({
  headers: { 'Content-Type': 'application/json' },
});

// No browser cookie jar on native, so every request carries the JWT
// explicitly instead — see backend/src/middleware/auth.ts's Bearer-token
// fallback, added specifically for this.
client.interceptors.request.use(async (config) => {
  const token = await tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Surfaces a toast for the two failure modes that mean "the saved server
// address is wrong or the backend is broken", as opposed to expected
// request-specific failures (e.g. 401 on bad login credentials) which
// screens already handle inline.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 404) {
      showToast('Service not found at this server address (404). Check the saved address.');
    } else if (status >= 500 && status < 600) {
      showToast('The server ran into an error. Please try again shortly.');
    }
    return Promise.reject(error);
  },
);

export default client;
