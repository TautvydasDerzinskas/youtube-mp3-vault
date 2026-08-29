// Points straight at the latest GitHub Release's asset rather than a file
// baked into this image — GitHub's "latest" redirect resolves to whichever
// release was most recently published, and the mobile CI workflow always
// uploads the APK under this same fixed filename (see the "Rename APK" /
// "Publish GitHub Release" steps in .github/workflows/docker-publish.yml),
// so this URL stays valid across releases with no rebuild needed here. This
// also decouples the two build pipelines: a frontend-only change no longer
// needs a fresh Android build just to have something current to embed.
export const APK_URL = 'https://github.com/TautvydasDerzinskas/youtube-mp3-vault/releases/latest/download/YoutubeVault.apk';
