// Baked into the frontend image at build time from the mobile CI build — see
// the publish-frontend job in .github/workflows/docker-publish.yml and
// frontend/public/download/.gitkeep. Never an external/expiring link.
// Shared by MobileAppGate (auto-shown to phone browsers) and DownloadsPage
// (reachable from the nav on any device).
export const APK_URL = '/download/YoutubeVault.apk';
