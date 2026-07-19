import axios from 'axios';
import { API_URL } from '../config';
import { tokenStorage } from '../auth/tokenStorage';

const client = axios.create({
  baseURL: API_URL,
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

export default client;
