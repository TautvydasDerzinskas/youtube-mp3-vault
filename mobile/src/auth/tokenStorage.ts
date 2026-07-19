import * as SecureStore from 'expo-secure-store';

// Keystore-backed on Android (see app.json's expo-secure-store plugin) —
// appropriate for a credential, unlike plain AsyncStorage which is
// unencrypted on-device.
const TOKEN_KEY = 'auth_token';

export const tokenStorage = {
  get: (): Promise<string | null> => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string): Promise<void> => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: (): Promise<void> => SecureStore.deleteItemAsync(TOKEN_KEY),
};
