// Ported verbatim from the standalone qobuz_module prototype (not part of this repo) — its src/server/communityEndpoints.ts (itself
// ported from SpotiFLAC's community_endpoints.go).
//
// SpotiFLAC's Go binary keeps its community backend base URLs as AES-256-GCM
// ciphertext embedded in the compiled program (not plain strings), decrypted
// at runtime with a key derived from a hardcoded seed. This mirrors that exact
// scheme so the same (already-embedded-in-the-app) endpoints resolve here.
// This is the same secret the compiled desktop app already carries — not a
// bypass of anything, just the same decrypt happening in TypeScript.
import crypto from 'crypto';

export const communityDownloadPath = '/api/dl';

const communityURLSeedParts = ['spotif', 'lac:co', 'mmunity:url:v1'];
const communityURLAAD = Buffer.from('spotiflac|community|url|v1', 'utf8');

function bytes(values: number[]): Buffer {
  return Buffer.from(values);
}

const qobuzCommunityURLNonce = bytes([
  0x36, 0xf7, 0x2d, 0xdf, 0x93, 0xea, 0x36, 0x68, 0xb6, 0x66, 0xf0, 0x5a,
]);
const qobuzCommunityURLCiphertext = bytes([
  0x56, 0x5d, 0x00, 0xd6, 0x0b, 0x39, 0x8a, 0x14, 0xd3, 0x88, 0x30, 0x04, 0x58, 0x3d, 0x8f, 0x1b,
  0x09, 0x87, 0x02, 0xb3, 0x37, 0xf7, 0x09, 0xd3, 0xeb, 0x44, 0x72, 0x47, 0xc9, 0x44,
]);
const qobuzCommunityURLTag = bytes([
  0x40, 0x9f, 0xa0, 0xe8, 0x50, 0x4a, 0x7e, 0xee, 0x29, 0x7e, 0x29, 0x01, 0x6b, 0x05, 0x3a, 0xdc,
]);

const communityVerifyURLNonce = bytes([
  0x37, 0x68, 0x07, 0x7e, 0xe1, 0x02, 0x94, 0xd7, 0x24, 0xd7, 0xdc, 0x54,
]);
const communityVerifyURLCiphertext = bytes([
  0x01, 0x6d, 0xb0, 0x5f, 0x66, 0x08, 0xab, 0x6a, 0x99, 0x66, 0x5b, 0xfc, 0x70, 0x99, 0xe6, 0xdb,
  0x54, 0xa7, 0x9e, 0x20, 0xb9, 0x6b, 0xd3, 0xca, 0x42, 0xb4, 0xaf, 0xc5, 0x69,
]);
const communityVerifyURLTag = bytes([
  0x1d, 0x91, 0x11, 0xce, 0xf7, 0xe2, 0x18, 0x76, 0xe0, 0x5d, 0xb3, 0xc5, 0xee, 0x99, 0xe4, 0xf2,
]);

let cachedKey: Buffer | null = null;
function communityKey(): Buffer {
  if (!cachedKey) {
    const hash = crypto.createHash('sha256');
    for (const part of communityURLSeedParts) hash.update(part, 'utf8');
    cachedKey = hash.digest();
  }
  return cachedKey;
}

function decryptCommunityURL(nonce: Buffer, ciphertext: Buffer, tag: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', communityKey(), nonce);
  decipher.setAuthTag(tag);
  decipher.setAAD(communityURLAAD);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export function getQobuzCommunityDownloadURL(): string {
  return decryptCommunityURL(qobuzCommunityURLNonce, qobuzCommunityURLCiphertext, qobuzCommunityURLTag) + communityDownloadPath;
}

export function getCommunityVerifyURL(): string {
  return decryptCommunityURL(communityVerifyURLNonce, communityVerifyURLCiphertext, communityVerifyURLTag);
}
