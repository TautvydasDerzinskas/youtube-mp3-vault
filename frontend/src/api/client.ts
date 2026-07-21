import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
  // Lets the backend attribute login/logout audit log entries to the web
  // client — see backend/src/services/auditLog.ts's getClientPlatform.
  headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'web' },
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !window.location.pathname.startsWith('/login') &&
      !window.location.pathname.startsWith('/auth/callback')
    ) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
