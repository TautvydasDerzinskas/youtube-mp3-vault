import * as Crypto from 'expo-crypto';

// Mirrors frontend/src/utils/gravatar.ts — Gravatar accepts a SHA-256 hash
// of the trimmed, lowercased email. Web uses the browser's crypto.subtle;
// React Native has no such built-in, so expo-crypto's native digest fills
// the same role here. https://docs.gravatar.com/general/hash/
export async function gravatarUrl(email: string, size = 128): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const hashHex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalized);
  return `https://www.gravatar.com/avatar/${hashHex}?s=${size}&d=404`;
}
