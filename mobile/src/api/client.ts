import axios from 'axios';
import i18next from 'i18next';
import { tokenStorage } from '../auth/tokenStorage';
import { showToast } from '../utils/toast';

const client = axios.create({
  // Lets the backend attribute login/logout audit log entries to the mobile
  // client — see backend/src/services/auditLog.ts's getClientPlatform.
  headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'mobile' },
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
      showToast(i18next.t('network.notFound'));
    } else if (status >= 500 && status < 600) {
      showToast(i18next.t('network.serverError'));
    }
    return Promise.reject(error);
  },
);

export default client;
