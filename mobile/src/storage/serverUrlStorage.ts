import * as SecureStore from 'expo-secure-store';

// Not a credential, but reuses the same SecureStore-backed pattern as
// tokenStorage.ts rather than pulling in a second storage dependency.
const SERVER_URL_KEY = 'server_url';

export const serverUrlStorage = {
  get: (): Promise<string | null> => SecureStore.getItemAsync(SERVER_URL_KEY),
  set: (url: string): Promise<void> => SecureStore.setItemAsync(SERVER_URL_KEY, url),
  clear: (): Promise<void> => SecureStore.deleteItemAsync(SERVER_URL_KEY),
};
