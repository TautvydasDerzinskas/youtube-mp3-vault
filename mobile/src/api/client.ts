import axios from 'axios';
import i18next from 'i18next';
import { tokenStorage } from '../auth/tokenStorage';
import { showToast } from '../utils/toast';

// Opt-out for the response interceptor's error toast below — for requests
// that are expected to sometimes fail as a normal, already-handled outcome
// (a background offline-sync retry, a playlist that got deleted while
// offline) rather than something the user needs to be told about right now.
declare module 'axios' {
  export interface AxiosRequestConfig {
    suppressErrorToast?: boolean;
  }
}

const client = axios.create({
  // Without this, a request to an address that's unreachable rather than
  // cleanly refused (e.g. a dead LAN IP/hostname no longer valid off the
  // home network) can sit awaiting a TCP-level connect timeout far longer
  // than any UI should wait — tens of seconds, platform-dependent — before
  // ever rejecting. Every JSON API call goes through this one instance (raw
  // file downloads in mobile/src/offline/downloader.ts don't), so one
  // default here covers login, manifests, etc. without needing every call
  // site to remember its own.
  timeout: 20_000,
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
    if (!error?.config?.suppressErrorToast) {
      if (status === 404) {
        showToast(i18next.t('network.notFound'));
      } else if (status >= 500 && status < 600) {
        showToast(i18next.t('network.serverError'));
      }
    }
    return Promise.reject(error);
  },
);

export default client;
