import * as SecureStore from 'expo-secure-store';

// Not a credential, but reuses the same SecureStore-backed pattern as
// serverUrlStorage.ts rather than pulling in a second storage dependency.
const SHUFFLE_KEY = 'shuffle_mode';

export const shuffleStorage = {
  get: (): Promise<string | null> => SecureStore.getItemAsync(SHUFFLE_KEY),
  set: (value: boolean): Promise<void> => SecureStore.setItemAsync(SHUFFLE_KEY, String(value)),
};
