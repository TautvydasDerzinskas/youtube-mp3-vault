// The self-hosted instance's real address on the LAN — resolved by the
// router's local DNS, fronted by the frontend's nginx (same /api proxy the
// web app already uses, see frontend/nginx.conf), so this works out of the
// box with no .env needed. Override via EXPO_PUBLIC_API_URL for local
// development against a backend run directly on your dev machine instead —
// see .env.example.
const DEFAULT_API_URL = 'https://youtubevault.mylan/api';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;
