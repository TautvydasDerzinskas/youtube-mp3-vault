import { useEffect, useState } from 'react';

const BUILD_SHA = process.env.EXPO_PUBLIC_BUILD_SHA;
const GITHUB_REPO = process.env.EXPO_PUBLIC_GITHUB_REPO;

interface LatestRelease {
  tag_name: string;
  html_url: string;
}

export function useUpdateCheck(): { available: boolean; releaseUrl: string | null } {
  const [available, setAvailable] = useState(false);
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!BUILD_SHA || !GITHUB_REPO) return;

    let cancelled = false;
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
      .then((res) => (res.ok ? (res.json() as Promise<LatestRelease>) : null))
      .then((release) => {
        if (cancelled || !release?.tag_name) return;
        const latestSha = release.tag_name.replace(/^mobile-/, '');
        // Prefix-compare rather than exact-match: GitHub's short SHA length
        // isn't guaranteed to match the one baked into this build.
        const isCurrent = latestSha.startsWith(BUILD_SHA!) || BUILD_SHA!.startsWith(latestSha);
        if (!isCurrent) {
          setAvailable(true);
          setReleaseUrl(release.html_url);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return { available, releaseUrl };
}
