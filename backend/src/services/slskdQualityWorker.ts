import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { findBetterQualityMp3, MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { isHqAutoDownloadEnabled, isUserHqProviderAllowed } from './settings';
import { findExactMatchCandidate, downloadAndReplace as downloadAndReplaceViaSlskd } from './hqReplace';
import { findJioSaavnCandidate, downloadAndReplace as downloadAndReplaceViaJioSaavn } from './jiosaavnReplace';
import { findBandcampCandidate, downloadAndReplace as downloadAndReplaceViaBandcamp } from './bandcampReplace';
import { establishDeezerSession, type DeezerSession } from './deezer';
import { findDeezerCandidate, downloadAndReplace as downloadAndReplaceViaDeezer } from './deezerReplace';
import { stripFeaturedArtists, stripUploadNoise, stripDecorativeSymbols, extractQuotedArtistTitle, extractDashArtistTitle } from './trackMatching';

// Checks slskd for a better-quality mp3 of each downloaded video in this
// playlist. Called at the end of a playlist's download pass (see
// downloadPendingVideos in syncService.ts), same as resolvePlaylistMetadata
// right before it — deliberately after metadata resolution, not before, so
// `video.artist` is already populated by whatever MusicBrainz/the local
// fallback found for it by the time this runs.
//
// By default only checks videos still awaiting a first check
// (`qualityCheckStatus: 'pending'`) — this is what every regular sync's
// automatic follow-up pass uses, so routine syncs don't re-search slskd for
// tracks already checked. Pass `rescanAll: true` (used by the admin-facing
// "Scan for HQ" trigger — see scanForHqUpgrades in syncService.ts) to
// instead recheck every video that doesn't already have a real HQ file on
// disk (`hqFileDownloaded: false`), regardless of what a past check found —
// slskd's peer pool changes constantly (different users online at different
// times of day), so "no match last time" is never a permanent verdict the
// way it's currently treated; only "we already have the upgraded file" is.
//
// When the "auto-download HQ upgrades" admin toggle is on (see
// services/hqReplace.ts — meant to pair with a modified, purchaser-IP-gated
// slskd image), this does more than the plain search-only path: an exact
// artist+title match gets downloaded and used to replace the local file
// outright, not just flagged as available. slskd is tried first (it's
// generally the better/more current source when it has a match); if it
// comes up empty, JioSaavn (services/jiosaavnReplace.ts) is tried as a
// fallback — a free public catalog with no peer pool to wait on, so it
// costs one extra search rather than a real wait when slskd has nothing. If
// that also comes up empty, Bandcamp (services/bandcamp.ts/bandcampReplace.ts)
// is tried next — another free, no-login catalog, useful mainly for the
// independent/underground tracks JioSaavn's Indian-market-skewed catalog and
// slskd's peer pool both miss, though its own ceiling is a fixed, fairly low
// bitrate (see BANDCAMP_STREAM_BITRATE_KBPS), so it's never preferred over a
// source that might have genuinely better quality for the same track. If
// that also comes up empty and this playlist's owner has connected their own
// Deezer account (services/deezer.ts/deezerReplace.ts), Deezer is tried
// last — unlike the other two, it's per-user, not app-wide, since it
// streams tracks that specific account is entitled to. Its cookie is
// verified once per call, up front (see deezerSession below), not
// per-video: a dead/expired cookie should stop being retried for the rest
// of this sync pass rather than failing the same way on every remaining
// video. That path in particular can take a while per video (a real slskd
// search plus, when a match is found, an actual file transfer) —
// onProgress (only syncService.ts's downloadPendingVideos passes one)
// reports this video's 1-indexed position and running total before each
// one is processed, so the caller can surface live progress instead of
// this looking indistinguishable from stuck.
export async function resolvePlaylistQuality(
  playlistId: string,
  options: {
    onProgress?: (current: number, total: number, title: string) => void;
    // Fired once per video that gets a *new* upgrade this pass — either
    // actually downloaded (auto-download mode) or just newly flagged
    // available — never for a video whose upgrade was already known from a
    // past check, even under rescanAll. Only syncService.ts's
    // downloadPendingVideos passes one, to accumulate SyncStats.newHqCount
    // and the live per-pass hqFoundIds list (see SyncPhase).
    onHqFound?: (videoId: string) => void;
    // Fired once a video has a real, terminal verdict for this pass —
    // downloaded, flagged available-but-undownloaded, or confirmed no
    // upgrade exists/errored. Deliberately NOT fired for a video skipped
    // only because it's still waiting on a future metadata pass, or one
    // that vanished from the DB mid-check (Prisma P2025 below) — neither is
    // a real verdict, just "still nothing to say yet." Lets the caller
    // build a live "already handled this pass" list (see SyncPhase.processedIds).
    onVideoProcessed?: (videoId: string) => void;
    rescanAll?: boolean;
  } = {}
): Promise<void> {
  const { onProgress, onHqFound, onVideoProcessed, rescanAll = false } = options;
  const videos = await prisma.playlistVideo.findMany({
    where: rescanAll
      ? { playlistId, downloadStatus: 'done', hqFileDownloaded: false }
      : { playlistId, downloadStatus: 'done', qualityCheckStatus: 'pending' },
    orderBy: { position: 'asc' },
  });

  // Established once per call (i.e. once per sync pass for this playlist),
  // never per video — see the block comment above for why. null means any
  // of: the admin has disabled Deezer entirely (hqAllowedUserProviders,
  // checked first so a disabled provider never even attempts a network
  // call), the owner hasn't connected it, or their cookie is currently
  // unusable (dead/expired, or no HQ-entitled Deezer plan) — either way
  // every video below simply skips this provider, same as if it didn't exist.
  let deezerSession: DeezerSession | null = null;
  if (isHqAutoDownloadEnabled() && isUserHqProviderAllowed('deezer') && videos.length > 0) {
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { userId: true, user: { select: { deezerArlCookie: true } } },
    });
    if (playlist?.user.deezerArlCookie) {
      deezerSession = await establishDeezerSession(playlist.user.deezerArlCookie);
      await prisma.user
        .update({
          where: { id: playlist.userId },
          data: { deezerCookieValid: deezerSession !== null, deezerCookieCheckedAt: new Date() },
        })
        .catch(() => {});
    }
  }

  for (const [index, video] of videos.entries()) {
    if (!isOnline()) return;
    onProgress?.(index + 1, videos.length, video.artist ? `${video.artist} - ${video.title}` : video.title);

    // Already at (or somehow above) the ceiling this app treats as the
    // highest plausible real mp3 bitrate — slskd.ts's own search discards
    // any peer file reporting a higher bitrate as bogus data, so no search
    // here could ever legitimately find something better. Skip it outright
    // rather than spending a slskd round-trip to prove that. Standard
    // YouTube audio-only streams don't actually reach this on their own
    // (topping out around 128–256kbps depending on what's available for a
    // given video) — this mostly matters for a track already carrying a
    // genuinely maxed-out bitrate from some other source.
    if (video.bitrate !== null && video.bitrate >= MAX_PLAUSIBLE_MP3_BITRATE_KBPS) {
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() } })
        .catch(() => {});
      onVideoProcessed?.(video.id);
      continue;
    }

    // A video with no stored artist at all isn't necessarily a dead end —
    // its title is sometimes really an "Artist-Title"/"Artist "Title""
    // string crammed together with no split ever performed (see
    // extractQuotedArtistTitle/extractDashArtistTitle's own doc comments for
    // real examples, e.g. "Dr Dre-The Watcher (Creed 3 Intro)"). Those are
    // otherwise only tried as later-tier fallbacks once a *real* video.artist
    // is already known — a video with no artist at all is exactly the case
    // they're most useful for, not one to skip past untried.
    const noArtistExtraction = video.artist
      ? null
      : (extractQuotedArtistTitle(video.title) ?? extractDashArtistTitle(video.title));
    const artist = video.artist ?? noArtistExtraction?.artist ?? null;
    const title = noArtistExtraction?.title ?? video.title;

    if (!artist) {
      // metadataStatus 'pending' means a future sync's metadata pass might
      // still fill this in — leave it pending too rather than giving up for
      // good. Any other status is terminal (see resolvePlaylistMetadata),
      // meaning no artist is ever coming for this video (and the title
      // itself didn't yield one either), so there's nothing left to search with.
      if (video.metadataStatus === 'pending') continue;
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() } })
        .catch(() => {});
      onVideoProcessed?.(video.id);
      continue;
    }

    // Decorative Unicode (flag emoji, stars, dingbats — see
    // stripDecorativeSymbols) an uploader tacked onto a title/artist is
    // essentially never part of a real catalog entry on any of these
    // providers, so it's cleaned unconditionally before every search below,
    // not just as a no-results fallback.
    const searchArtist = stripDecorativeSymbols(artist);
    const searchTitle = stripDecorativeSymbols(title);

    // A search query cluttered with a "(feat. X)" credit or upload noise
    // ("[PREMIERE]", "- Lyrics HD!", "(Live - Swedish Idol 2016)") often
    // returns worse (or zero) results from a provider's own search endpoint,
    // even though MATCH_TIERS already tolerates a *found* candidate
    // differing on exactly this (artistIsSupersetMatch, titleSimilarity's
    // "dropped/added filler word" allowance) — that tolerance never gets a
    // chance to apply if the search itself came back empty. Unlike the
    // decorative-symbol cleanup above, this combined fallback is only tried
    // once the plain search already failed, never unconditionally: some
    // catalogs genuinely do index a feat. credit as part of the title, so
    // the plainer, more-likely-correct search always gets first shot. Only
    // worth a second search per source when stripping actually changed
    // something.
    const strippedArtist = stripUploadNoise(stripFeaturedArtists(searchArtist));
    const strippedTitle = stripUploadNoise(stripFeaturedArtists(searchTitle));
    const hasCleanedFallback = strippedArtist !== searchArtist || strippedTitle !== searchTitle;

    // A third, last-resort fallback for titles stored as the whole
    // `Artist "Title"` string with nothing split out — see
    // extractQuotedArtistTitle's own doc comment for real examples. The
    // extracted artist is often more trustworthy than `video.artist` itself
    // for these rows, so this replaces it too rather than only cleaning the
    // title. Only worth trying when it'd actually search something new.
    const quotedExtraction = extractQuotedArtistTitle(searchTitle);
    const hasQuotedFallback = quotedExtraction !== null
      && (quotedExtraction.artist !== searchArtist || quotedExtraction.title !== searchTitle)
      && (quotedExtraction.artist !== strippedArtist || quotedExtraction.title !== strippedTitle);

    // A fourth, even-last-resort fallback for the same "title carries the
    // whole Artist-Title string, stored artist is unrelated" shape as the
    // quoted case above, minus the quotes — see extractDashArtistTitle's own
    // doc comment for why this only fires on an unambiguous single dash.
    const dashExtraction = extractDashArtistTitle(searchTitle);
    const hasDashFallback = dashExtraction !== null
      && (dashExtraction.artist !== searchArtist || dashExtraction.title !== searchTitle)
      && (dashExtraction.artist !== strippedArtist || dashExtraction.title !== strippedTitle)
      && (!quotedExtraction || dashExtraction.artist !== quotedExtraction.artist || dashExtraction.title !== quotedExtraction.title);

    try {
      if (isHqAutoDownloadEnabled()) {
        let slskdCandidate: Awaited<ReturnType<typeof findExactMatchCandidate>> = null;
        let jioSaavnCandidate: Awaited<ReturnType<typeof findJioSaavnCandidate>> = null;
        let deezerCandidate: Awaited<ReturnType<typeof findDeezerCandidate>> = null;
        let bandcampCandidate: Awaited<ReturnType<typeof findBandcampCandidate>> = null;
        let replaced = false;

        // Each source is isolated in its own try/catch — an unexpected
        // failure on one (a slskd daemon hiccup, a JioSaavn API error) is
        // logged and treated the same as "this source found nothing", not
        // something that aborts the whole quality check for this video or
        // stops the other source from still being tried. Every function
        // called here is already designed not to throw for the ordinary
        // "no match"/"download failed" cases (see hqReplace.ts and
        // jiosaavnReplace.ts) — this is a backstop for the unexpected case.
        try {
          slskdCandidate = await findExactMatchCandidate(searchArtist, searchTitle, video.bitrate, video.duration);
          if (!slskdCandidate && hasCleanedFallback) {
            slskdCandidate = await findExactMatchCandidate(strippedArtist, strippedTitle, video.bitrate, video.duration);
          }
          if (!slskdCandidate && hasQuotedFallback && quotedExtraction) {
            slskdCandidate = await findExactMatchCandidate(quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration);
          }
          if (!slskdCandidate && hasDashFallback && dashExtraction) {
            slskdCandidate = await findExactMatchCandidate(dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration);
          }
          if (slskdCandidate) replaced = await downloadAndReplaceViaSlskd(video, slskdCandidate);
        } catch (err) {
          console.error(`[slskd] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
        }

        if (!replaced && !slskdCandidate) {
          // slskd came up empty (or errored) — fall back to JioSaavn's free
          // public catalog before giving up on this video for this pass.
          try {
            jioSaavnCandidate = await findJioSaavnCandidate(searchArtist, searchTitle, video.bitrate, video.duration);
            if (!jioSaavnCandidate && hasCleanedFallback) {
              jioSaavnCandidate = await findJioSaavnCandidate(strippedArtist, strippedTitle, video.bitrate, video.duration);
            }
            if (!jioSaavnCandidate && hasQuotedFallback && quotedExtraction) {
              jioSaavnCandidate = await findJioSaavnCandidate(quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration);
            }
            if (!jioSaavnCandidate && hasDashFallback && dashExtraction) {
              jioSaavnCandidate = await findJioSaavnCandidate(dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration);
            }
            if (jioSaavnCandidate) replaced = await downloadAndReplaceViaJioSaavn(video, jioSaavnCandidate);
          } catch (err) {
            console.error(`[jiosaavn] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (!replaced && !slskdCandidate && !jioSaavnCandidate && deezerSession) {
          // slskd and JioSaavn both came up empty — try this playlist's
          // owner's own Deezer account next (already confirmed usable once
          // up front for this whole sync pass, see deezerSession above),
          // ahead of Bandcamp's free catalog.
          try {
            deezerCandidate = await findDeezerCandidate(deezerSession, searchArtist, searchTitle, video.bitrate, video.duration);
            if (!deezerCandidate && hasCleanedFallback) {
              deezerCandidate = await findDeezerCandidate(deezerSession, strippedArtist, strippedTitle, video.bitrate, video.duration);
            }
            if (!deezerCandidate && hasQuotedFallback && quotedExtraction) {
              deezerCandidate = await findDeezerCandidate(deezerSession, quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration);
            }
            if (!deezerCandidate && hasDashFallback && dashExtraction) {
              deezerCandidate = await findDeezerCandidate(deezerSession, dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration);
            }
            if (deezerCandidate) replaced = await downloadAndReplaceViaDeezer(video, deezerSession, deezerCandidate);
          } catch (err) {
            console.error(`[deezer] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (!replaced && !slskdCandidate && !jioSaavnCandidate && !deezerCandidate) {
          // Nothing above found anything (or there's no Deezer account
          // connected for this playlist) — Bandcamp's free catalog is the
          // last resort.
          try {
            bandcampCandidate = await findBandcampCandidate(searchArtist, searchTitle, video.bitrate, video.duration);
            if (!bandcampCandidate && hasCleanedFallback) {
              bandcampCandidate = await findBandcampCandidate(strippedArtist, strippedTitle, video.bitrate, video.duration);
            }
            if (!bandcampCandidate && hasQuotedFallback && quotedExtraction) {
              bandcampCandidate = await findBandcampCandidate(quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration);
            }
            if (!bandcampCandidate && hasDashFallback && dashExtraction) {
              bandcampCandidate = await findBandcampCandidate(dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration);
            }
            if (bandcampCandidate) replaced = await downloadAndReplaceViaBandcamp(video, bandcampCandidate);
          } catch (err) {
            console.error(`[bandcamp] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (replaced) {
          // hqFileDownloaded was false going into this pass (the query above
          // filters on it) — an actual replacement is always a genuinely new
          // find, never a re-affirmation of one already known.
          onHqFound?.(video.id);
          onVideoProcessed?.(video.id);
          continue; // downloadAndReplace* already updated every flag/status itself
        }

        if (!slskdCandidate && !jioSaavnCandidate && !bandcampCandidate && !deezerCandidate) {
          // No source found anything eligible right now — a stable,
          // repeatable verdict, same as the free path below.
          await prisma.playlistVideo.update({
            where: { id: video.id },
            data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() },
          });
          onVideoProcessed?.(video.id);
          continue;
        }

        // A real upgrade exists (on one source or the other) but
        // downloading/replacing it didn't succeed this time (transient
        // failure, peer/agent unavailable, file never showed up on the
        // shared downloads volume in time — see hqReplace.ts) — flag it as
        // available and leave qualityCheckStatus pending so the next sync
        // retries the download, rather than a one-off failure permanently
        // giving up on it.
        if (!video.betterQualityExists) onHqFound?.(video.id); // wasn't already known before this pass
        await prisma.playlistVideo.update({
          where: { id: video.id },
          data: { betterQualityExists: true },
        });
        onVideoProcessed?.(video.id);
        continue;
      }

      let betterBitrate = await findBetterQualityMp3(searchArtist, searchTitle, video.bitrate);
      if (betterBitrate === null && hasCleanedFallback) {
        betterBitrate = await findBetterQualityMp3(strippedArtist, strippedTitle, video.bitrate);
      }
      if (betterBitrate !== null && !video.betterQualityExists) onHqFound?.(video.id); // wasn't already known before this pass
      await prisma.playlistVideo.update({
        where: { id: video.id },
        data: {
          betterQualityExists: betterBitrate !== null,
          qualityCheckStatus: 'checked',
          qualityCheckedAt: new Date(),
        },
      });
      onVideoProcessed?.(video.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') continue;

      console.error(`[slskd] Quality check failed for ${video.youtubeId}:`, (err as Error).message);
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { qualityCheckStatus: 'error', qualityCheckedAt: new Date() } })
        .catch(() => {});
      onVideoProcessed?.(video.id);
    }
  }
}
