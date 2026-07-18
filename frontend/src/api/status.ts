import client from './client';

export interface ServiceStatus {
  online: boolean;
}

export const statusApi = {
  get: async (): Promise<ServiceStatus> => {
    const { data } = await client.get<ServiceStatus>('/status');
    return data;
  },
};
