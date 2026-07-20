import axios from 'axios';
import { tokenStorage } from '../auth/tokenStorage';
import { showToast } from '../utils/toast';

const client = axios.create({
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use(async (config) => {
  const token = await tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
