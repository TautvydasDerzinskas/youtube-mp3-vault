import client from './client';

export interface ServiceStatus {
  online: boolean;
}

// Mirrors frontend/src/api/status.ts — "online" here means the *server's*
// own internet connectivity (see backend/src/services/connectivity.ts),
// not the phone's network state, which is what actually determines
// whether sync/generate-similar can do anything useful right now.
export const statusApi = {
  get: async (): Promise<ServiceStatus> => {
    const { data } = await client.get<ServiceStatus>('/status');
    return data;
  },
};
