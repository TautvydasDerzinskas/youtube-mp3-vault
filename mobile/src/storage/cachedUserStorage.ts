import * as SecureStore from 'expo-secure-store';
import { User } from '../api/auth';

// Same SecureStore-backed pattern as tokenStorage/serverUrlStorage — the
// last-known /auth/me response, kept so AuthContext's bootstrap can still
// populate `user` (and thus reach the authenticated app shell) when the
// server can't be reached at launch, rather than forcing a logout purely
// because of a network error. See AuthContext.tsx's bootstrap effect.
const CACHED_USER_KEY = 'cached_user';

interface CachedUser {
  user: User;
  lastfmScrobblingAvailable: boolean;
  lastfmDiscoverAvailable: boolean;
  allowedHqProviders: string[];
}

export const cachedUserStorage = {
  get: async (): Promise<CachedUser | null> => {
    const raw = await SecureStore.getItemAsync(CACHED_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedUser;
    } catch {
      return null;
    }
  },
  set: (data: CachedUser): Promise<void> => SecureStore.setItemAsync(CACHED_USER_KEY, JSON.stringify(data)),
  clear: (): Promise<void> => SecureStore.deleteItemAsync(CACHED_USER_KEY),
};
