import { Prisma, PlaylistVideo as PrismaPlaylistVideo } from '@prisma/client';
import { prisma } from './prisma';
import { isOnline } from './connectivity';
import { findBetterQualityMp3, MAX_PLAUSIBLE_MP3_BITRATE_KBPS } from './slskd';
import { isHqAutoDownloadEnabled, isUserHqProviderAllowed } from './settings';
import { findExactMatchCandidate, downloadAndReplace as downloadAndReplaceViaSlskd } from './hqReplace';
import { findJioSaavnCandidate, downloadAndReplace as downloadAndReplaceViaJioSaavn } from './jiosaavnReplace';
import { findBandcampCandidate, downloadAndReplace as downloadAndReplaceViaBandcamp } from './bandcampReplace';
import { establishDeezerSession, type DeezerSession } from './deezer';
import { findDeezerCandidate, downloadAndReplace as downloadAndReplaceViaDeezer } from './deezerReplace';
import { establishQobuzSession, type QobuzSession } from './qobuz';
import { findQobuzCandidate, downloadAndReplace as downloadAndReplaceViaQobuz } from './qobuzReplace';
import { establishTidalSession, type TidalSession } from './tidal';
import { findTidalCandidate, downloadAndReplace as downloadAndReplaceViaTidal } from './tidalReplace';
import {
  stripFeaturedArtists, stripUploadNoise, stripDecorativeSymbols, extractQuotedArtistTitle, extractDashArtistTitle,
  normalizeArtistSeparators, foldForMatch, MATCH_TIERS, MATCH_TIERS_TRUSTED_NAME, type NearMissCandidate,
} from './trackMatching';
import { resolveMetadataForRename } from './metadataWorker';

// Shared groundwork for both resolvePlaylistQuality (a whole playlist,
// looping video by video) and searchTrackQuality (a single track, manually
// triggered from its context menu's "Search for HQ" action) — see each
// function's own doc comment below for what it actually does with this.
interface HqSessions {
  deezerSession: DeezerSession | null;
  qobuzSession: QobuzSession | null;
  tidalSession: TidalSession | null;
}

// Establishes every per-user HQ provider session up front, once per caller
// (a whole playlist's sync pass, or a single manually-triggered track
// search) rather than once per video — see resolvePlaylistQuality's own
// former block comment (now here) for why: dead/expired credentials should
// stop being retried for the rest of this pass rather than failing the same
// way on every remaining video. `videoCount` skips the session entirely
// when there's nothing to check it against (an empty playlist pass) —
// always at least 1 for a single-track search.
async function buildHqSessions(playlistId: string, videoCount: number): Promise<HqSessions> {
  // null means any of: the admin has disabled Deezer entirely
  // (hqAllowedUserProviders, checked first so a disabled provider never even
  // attempts a network call), the owner hasn't connected it, or their cookie
  // is currently unusable (dead/expired, or no HQ-entitled Deezer plan) —
  // either way every video below simply skips this provider, same as if it
  // didn't exist.
  let deezerSession: DeezerSession | null = null;
  if (isHqAutoDownloadEnabled() && isUserHqProviderAllowed('deezer') && videoCount > 0) {
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

  // Same shape as deezerSession above — see its comment for the
  // null-means-"skip entirely" contract.
  let qobuzSession: QobuzSession | null = null;
  if (isHqAutoDownloadEnabled() && isUserHqProviderAllowed('qobuz') && videoCount > 0) {
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { userId: true, user: { select: { qobuzEmail: true, qobuzPassword: true } } },
    });
    if (playlist?.user.qobuzEmail && playlist.user.qobuzPassword) {
      qobuzSession = await establishQobuzSession(playlist.user.qobuzEmail, playlist.user.qobuzPassword);
      await prisma.user
        .update({
          where: { id: playlist.userId },
          data: { qobuzCredentialsValid: qobuzSession !== null, qobuzCredentialsCheckedAt: new Date() },
        })
        .catch(() => {});
    }
  }

  // Same shape as deezerSession/qobuzSession above — see deezerSession's
  // comment for the null-means-"skip entirely" contract. Unlike those two, a
  // "dead" outcome here can mean the *access* token was refreshed
  // successfully mid-call (see establishTidalSession's onRefreshed) even
  // though the overall session is still returned — that refreshed token is
  // persisted below regardless of whether the session as a whole ended up
  // usable, so it's never silently thrown away.
  let tidalSession: TidalSession | null = null;
  if (isHqAutoDownloadEnabled() && isUserHqProviderAllowed('tidal') && videoCount > 0) {
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: {
        userId: true,
        user: { select: { tidalAccessToken: true, tidalRefreshToken: true, tidalUserId: true, tidalCountryCode: true } },
      },
    });
    if (playlist?.user.tidalAccessToken && playlist.user.tidalRefreshToken) {
      let refreshedAccessToken: string | null = null;
      tidalSession = await establishTidalSession(
        {
          tidalAccessToken: playlist.user.tidalAccessToken,
          tidalRefreshToken: playlist.user.tidalRefreshToken,
          tidalUserId: playlist.user.tidalUserId ?? '',
          tidalCountryCode: playlist.user.tidalCountryCode ?? '',
        },
        (accessToken) => { refreshedAccessToken = accessToken; }
      );
      await prisma.user
        .update({
          where: { id: playlist.userId },
          data: {
            ...(refreshedAccessToken ? { tidalAccessToken: refreshedAccessToken } : {}),
            tidalCredentialsValid: tidalSession !== null,
            tidalCredentialsCheckedAt: new Date(),
          },
        })
        .catch(() => {});
    }
  }

  return { deezerSession, qobuzSession, tidalSession };
}

// 'processed' vs 'skipped' mirrors resolvePlaylistQuality's onVideoProcessed
// contract — see that option's own doc comment for exactly which cases
// count as "skipped" (still waiting on a future metadata pass, or the video
// vanished from the DB mid-check).
type QualityCheckOutcome = 'processed' | 'skipped';

// Surfaced by searchTrackQuality below (never the batch pass) when any
// provider in the cascade turned up real search results for this track that
// didn't clear any MATCH_TIERS tier — see NearMissCandidate's own doc
// comment. `provider` is which one it came from, used to dedupe-and-tag the
// list the frontend renders as one-click rename suggestions
// (routes/youtube.ts's GET .../videos/:videoId response), capped at
// CLOSE_HQ_CANDIDATES_LIMIT total so that list stays a manageable, glanceable
// picker rather than dumping every near-miss every source turned up.
export interface CloseHqCandidate extends NearMissCandidate {
  // JioSaavn deliberately excluded — its Indian-market-skewed catalog kept
  // surfacing suggestions that plainly weren't the same song at all, worse
  // than not suggesting anything.
  provider: 'slskd' | 'deezer' | 'qobuz' | 'tidal';
}

const CLOSE_HQ_CANDIDATES_LIMIT = 5;

// Everything from "does this video's bitrate already max out" through
// "write the final verdict" for exactly one video — shared by
// resolvePlaylistQuality's whole-playlist loop below and searchTrackQuality
// (a single track, manually triggered from its context menu's "Search for
// HQ" action). See resolvePlaylistQuality's own doc comment for the full
// provider cascade this runs (slskd → JioSaavn → Deezer/Qobuz/Tidal → Bandcamp).
async function checkVideoQuality(
  video: PrismaPlaylistVideo,
  sessions: HqSessions,
  onHqFound?: (videoId: string) => void,
  // Set true by both single-track entry points below — searchTrackQuality
  // (the context menu's standalone "Search for HQ") and renameTrack (the
  // search that follows a manual rename) — since either way a human just
  // deliberately asked this one specific track to be searched, so the
  // duration-tolerance backstop against "same title, different recording"
  // (see MATCH_TIERS_TRUSTED_NAME's own doc comment) is redundant and can
  // only cost a legitimate match against, say, a YouTube upload with a much
  // longer intro than the canonical release. Only resolvePlaylistQuality's
  // batch sync-pass loop keeps the normal tiers — an unattended pass over
  // every track in a playlist has no human confirming each match, so it's
  // the one place that duration backstop still earns its keep.
  trustedName = false,
  // Populated (not replaced) by searchTrackQuality below with deduped
  // near-misses once the whole cascade finishes without a real download —
  // see CloseHqCandidate's own doc comment. Left undefined
  // everywhere else, which skips collecting the raw candidates at all.
  closeCandidatesOut?: CloseHqCandidate[],
): Promise<QualityCheckOutcome> {
  const { deezerSession, qobuzSession, tidalSession } = sessions;
  const tiers = trustedName ? MATCH_TIERS_TRUSTED_NAME : MATCH_TIERS;
  {
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
      return 'processed';
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
      if (video.metadataStatus === 'pending') return 'skipped';
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() } })
        .catch(() => {});
      return 'processed';
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
    // something. normalizeArtistSeparators is folded in here too — a
    // "Leon Somov x Saulės Kliošas"/"... & ..." collab credit needs the
    // same comma-separated form most providers actually catalog it under
    // (see that function's own doc comment).
    const strippedArtist = stripUploadNoise(stripFeaturedArtists(normalizeArtistSeparators(searchArtist)));
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
        let qobuzCandidate: Awaited<ReturnType<typeof findQobuzCandidate>> = null;
        let tidalCandidate: Awaited<ReturnType<typeof findTidalCandidate>> = null;
        let bandcampCandidate: Awaited<ReturnType<typeof findBandcampCandidate>> = null;
        let replaced = false;

        // Only allocated when the caller actually wants them (searchTrackQuality)
        // — undefined here means findDeezerCandidate/findQobuzCandidate/
        // findTidalCandidate skip the collection entirely, same cost as before
        // this feature existed for the batch pass.
        const slskdNearMisses: NearMissCandidate[] | undefined = closeCandidatesOut ? [] : undefined;
        const deezerNearMisses: NearMissCandidate[] | undefined = closeCandidatesOut ? [] : undefined;
        const qobuzNearMisses: NearMissCandidate[] | undefined = closeCandidatesOut ? [] : undefined;
        const tidalNearMisses: NearMissCandidate[] | undefined = closeCandidatesOut ? [] : undefined;

        // Each source is isolated in its own try/catch — an unexpected
        // failure on one (a slskd daemon hiccup, a JioSaavn API error) is
        // logged and treated the same as "this source found nothing", not
        // something that aborts the whole quality check for this video or
        // stops the other source from still being tried. Every function
        // called here is already designed not to throw for the ordinary
        // "no match"/"download failed" cases (see hqReplace.ts and
        // jiosaavnReplace.ts) — this is a backstop for the unexpected case.
        try {
          slskdCandidate = await findExactMatchCandidate(searchArtist, searchTitle, video.bitrate, video.duration, tiers, slskdNearMisses);
          if (!slskdCandidate && hasCleanedFallback) {
            // Search with the cleaned (feat.-stripped) query — a provider's
            // own search can rank/return worse results for a cluttered
            // query — but still verify a hit against our REAL, uncleaned
            // title/artist: the candidate's own title legitimately keeps
            // its "(feat. X)" credit, and no tier tolerates the title side
            // of that gap (only the artist side has a superset allowance —
            // see artistIsSupersetMatch), so comparing against the cleaned
            // text here would reject the very match this fallback exists to find.
            slskdCandidate = await findExactMatchCandidate(strippedArtist, strippedTitle, video.bitrate, video.duration, tiers, slskdNearMisses, searchArtist, searchTitle);
          }
          if (!slskdCandidate && hasQuotedFallback && quotedExtraction) {
            slskdCandidate = await findExactMatchCandidate(quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration, tiers, slskdNearMisses);
          }
          if (!slskdCandidate && hasDashFallback && dashExtraction) {
            slskdCandidate = await findExactMatchCandidate(dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration, tiers, slskdNearMisses);
          }
          if (slskdCandidate) replaced = await downloadAndReplaceViaSlskd(video, slskdCandidate);
        } catch (err) {
          console.error(`[slskd] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
        }

        if (!replaced) {
          // slskd came up empty, errored, or found a match but couldn't
          // actually download it (peer offline, transfer stalled/timed out —
          // see DOWNLOAD_MAX_WAIT_MS in hqReplace.ts) — either way, fall back
          // to JioSaavn's free public catalog rather than giving up on this
          // video for this pass. Gating on `!replaced` alone (not also
          // `!slskdCandidate`) is deliberate: a match slskd can't deliver is
          // no better than no match at all, so the other sources still
          // deserve a shot at this video in the same pass.
          try {
            jioSaavnCandidate = await findJioSaavnCandidate(searchArtist, searchTitle, video.bitrate, video.duration, tiers);
            if (!jioSaavnCandidate && hasCleanedFallback) {
              // See the identical comment on the slskd cleaned-fallback call
              // above — same reasoning, search cleaned, compare uncleaned.
              jioSaavnCandidate = await findJioSaavnCandidate(strippedArtist, strippedTitle, video.bitrate, video.duration, tiers, searchArtist, searchTitle);
            }
            if (!jioSaavnCandidate && hasQuotedFallback && quotedExtraction) {
              jioSaavnCandidate = await findJioSaavnCandidate(quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration, tiers);
            }
            if (!jioSaavnCandidate && hasDashFallback && dashExtraction) {
              jioSaavnCandidate = await findJioSaavnCandidate(dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration, tiers);
            }
            if (jioSaavnCandidate) replaced = await downloadAndReplaceViaJioSaavn(video, jioSaavnCandidate);
          } catch (err) {
            console.error(`[jiosaavn] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (!replaced && deezerSession) {
          // slskd and JioSaavn both came up empty or couldn't deliver a
          // download — try this playlist's owner's own Deezer account next
          // (already confirmed usable once up front for this whole sync
          // pass, see deezerSession above), ahead of Qobuz and Bandcamp's
          // free catalog.
          try {
            deezerCandidate = await findDeezerCandidate(deezerSession, searchArtist, searchTitle, video.bitrate, video.duration, tiers, deezerNearMisses);
            if (!deezerCandidate && hasCleanedFallback) {
              // See the identical comment on the slskd cleaned-fallback call
              // above — same reasoning, search cleaned, compare uncleaned.
              deezerCandidate = await findDeezerCandidate(deezerSession, strippedArtist, strippedTitle, video.bitrate, video.duration, tiers, deezerNearMisses, searchArtist, searchTitle);
            }
            if (!deezerCandidate && hasQuotedFallback && quotedExtraction) {
              deezerCandidate = await findDeezerCandidate(deezerSession, quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration, tiers, deezerNearMisses);
            }
            if (!deezerCandidate && hasDashFallback && dashExtraction) {
              deezerCandidate = await findDeezerCandidate(deezerSession, dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration, tiers, deezerNearMisses);
            }
            if (deezerCandidate) replaced = await downloadAndReplaceViaDeezer(video, deezerSession, deezerCandidate);
          } catch (err) {
            console.error(`[deezer] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (!replaced && qobuzSession) {
          // slskd, JioSaavn, and this owner's Deezer account (if any) all
          // came up empty or couldn't deliver a download — try their own
          // Qobuz account next (already confirmed usable once up front for
          // this whole sync pass, see qobuzSession above), ahead of
          // Bandcamp's free catalog.
          try {
            qobuzCandidate = await findQobuzCandidate(qobuzSession, searchArtist, searchTitle, video.bitrate, video.duration, tiers, qobuzNearMisses);
            if (!qobuzCandidate && hasCleanedFallback) {
              // See the identical comment on the slskd cleaned-fallback call
              // above — same reasoning, search cleaned, compare uncleaned.
              qobuzCandidate = await findQobuzCandidate(qobuzSession, strippedArtist, strippedTitle, video.bitrate, video.duration, tiers, qobuzNearMisses, searchArtist, searchTitle);
            }
            if (!qobuzCandidate && hasQuotedFallback && quotedExtraction) {
              qobuzCandidate = await findQobuzCandidate(qobuzSession, quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration, tiers, qobuzNearMisses);
            }
            if (!qobuzCandidate && hasDashFallback && dashExtraction) {
              qobuzCandidate = await findQobuzCandidate(qobuzSession, dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration, tiers, qobuzNearMisses);
            }
            if (qobuzCandidate) replaced = await downloadAndReplaceViaQobuz(video, qobuzSession, qobuzCandidate);
          } catch (err) {
            console.error(`[qobuz] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (!replaced && tidalSession) {
          // slskd, JioSaavn, and this owner's Deezer/Qobuz accounts (if any)
          // all came up empty or couldn't deliver a download — try their own
          // Tidal account next (already confirmed usable once up front for
          // this whole sync pass, see tidalSession above), ahead of
          // Bandcamp's free catalog.
          try {
            tidalCandidate = await findTidalCandidate(tidalSession, searchArtist, searchTitle, video.bitrate, video.duration, tiers, tidalNearMisses);
            if (!tidalCandidate && hasCleanedFallback) {
              // See the identical comment on the slskd cleaned-fallback call
              // above — same reasoning, search cleaned, compare uncleaned.
              tidalCandidate = await findTidalCandidate(tidalSession, strippedArtist, strippedTitle, video.bitrate, video.duration, tiers, tidalNearMisses, searchArtist, searchTitle);
            }
            if (!tidalCandidate && hasQuotedFallback && quotedExtraction) {
              tidalCandidate = await findTidalCandidate(tidalSession, quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration, tiers, tidalNearMisses);
            }
            if (!tidalCandidate && hasDashFallback && dashExtraction) {
              tidalCandidate = await findTidalCandidate(tidalSession, dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration, tiers, tidalNearMisses);
            }
            if (tidalCandidate) replaced = await downloadAndReplaceViaTidal(video, tidalSession, tidalCandidate);
          } catch (err) {
            console.error(`[tidal] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        if (!replaced) {
          // Nothing above found anything (or found a match nobody could
          // actually deliver, or there's no Deezer/Qobuz/Tidal account
          // connected for this playlist) — Bandcamp's free catalog is the
          // last resort.
          try {
            bandcampCandidate = await findBandcampCandidate(searchArtist, searchTitle, video.bitrate, video.duration, tiers);
            if (!bandcampCandidate && hasCleanedFallback) {
              // See the identical comment on the slskd cleaned-fallback call
              // above — same reasoning, search cleaned, compare uncleaned.
              bandcampCandidate = await findBandcampCandidate(strippedArtist, strippedTitle, video.bitrate, video.duration, tiers, searchArtist, searchTitle);
            }
            if (!bandcampCandidate && hasQuotedFallback && quotedExtraction) {
              bandcampCandidate = await findBandcampCandidate(quotedExtraction.artist, quotedExtraction.title, video.bitrate, video.duration, tiers);
            }
            if (!bandcampCandidate && hasDashFallback && dashExtraction) {
              bandcampCandidate = await findBandcampCandidate(dashExtraction.artist, dashExtraction.title, video.bitrate, video.duration, tiers);
            }
            if (bandcampCandidate) replaced = await downloadAndReplaceViaBandcamp(video, bandcampCandidate);
          } catch (err) {
            console.error(`[bandcamp] HQ search/download failed for ${video.youtubeId}:`, (err as Error).message);
          }
        }

        // A real download always makes any near-miss moot (the track just
        // got its HQ upgrade under its existing name) — only worth surfacing
        // when the whole cascade above still came up empty-handed.
        if (closeCandidatesOut && !replaced) {
          const seen = new Set<string>();
          // Same priority order as the cascade above — slskd first (most
          // current/broadest catalog), then the connected per-account
          // providers — so when the CLOSE_HQ_CANDIDATES_LIMIT cap trims the
          // list, it trims the least-preferred sources first.
          const collect = (provider: CloseHqCandidate['provider'], misses: NearMissCandidate[] | undefined) => {
            for (const c of misses ?? []) {
              if (closeCandidatesOut.length >= CLOSE_HQ_CANDIDATES_LIMIT) return;
              const key = foldForMatch(`${c.artist} - ${c.title}`);
              if (!key || seen.has(key)) continue;
              seen.add(key);
              closeCandidatesOut.push({ provider, artist: c.artist, title: c.title, durationSec: c.durationSec });
            }
          };
          collect('slskd', slskdNearMisses);
          collect('deezer', deezerNearMisses);
          collect('qobuz', qobuzNearMisses);
          collect('tidal', tidalNearMisses);
        }

        if (replaced) {
          // hqFileDownloaded was false going into this pass (the query above
          // filters on it) — an actual replacement is always a genuinely new
          // find, never a re-affirmation of one already known.
          onHqFound?.(video.id);
          return 'processed'; // downloadAndReplace* already updated every flag/status itself
        }

        if (!slskdCandidate && !jioSaavnCandidate && !bandcampCandidate && !deezerCandidate && !qobuzCandidate && !tidalCandidate) {
          // No source found anything eligible right now — a stable,
          // repeatable verdict, same as the free path below.
          await prisma.playlistVideo.update({
            where: { id: video.id },
            data: { qualityCheckStatus: 'checked', qualityCheckedAt: new Date() },
          });
          return 'processed';
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
        return 'processed';
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
      return 'processed';
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return 'skipped';

      console.error(`[slskd] Quality check failed for ${video.youtubeId}:`, (err as Error).message);
      await prisma.playlistVideo
        .update({ where: { id: video.id }, data: { qualityCheckStatus: 'error', qualityCheckedAt: new Date() } })
        .catch(() => {});
      return 'processed';
    }
  }
}

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
// Deezer, Qobuz, and/or Tidal account (services/deezer.ts/deezerReplace.ts,
// services/qobuz.ts/qobuzReplace.ts, services/tidal.ts/tidalReplace.ts),
// those are tried last, Deezer before Qobuz before Tidal — unlike the other
// two (slskd/JioSaavn) and Bandcamp, they're per-user, not app-wide, since
// they stream tracks that specific account is entitled to. Each session is
// established (login verified/refreshed) once per call, up front (see
// buildHqSessions above), not per-video: dead/expired credentials should
// stop being retried for the rest of this sync pass rather than failing the
// same way on every remaining video. That path in particular can take a
// while per video (a real slskd search plus, when a match is found, an
// actual file transfer) — onProgress (only syncService.ts's
// downloadPendingVideos passes one) reports this video's 1-indexed position
// and running total before each one is processed, so the caller can surface
// live progress instead of this looking indistinguishable from stuck.
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
    // that vanished from the DB mid-check (Prisma P2025 in checkVideoQuality)
    // — neither is a real verdict, just "still nothing to say yet." Lets the
    // caller build a live "already handled this pass" list (see
    // SyncPhase.processedIds).
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

  const sessions = await buildHqSessions(playlistId, videos.length);

  for (const [index, video] of videos.entries()) {
    if (!isOnline()) return;
    onProgress?.(index + 1, videos.length, video.artist ? `${video.artist} - ${video.title}` : video.title);

    const outcome = await checkVideoQuality(video, sessions, onHqFound);
    if (outcome === 'processed') onVideoProcessed?.(video.id);
  }
}

// In-flight guard shared by searchTrackQuality and renameTrack below —
// prevents the same track being operated on twice concurrently (e.g. a
// double-click on "Search for HQ"/"Rename track" before the row's own UI
// has re-rendered to disable it) and lets the route report a live "still
// busy" status back to the frontend (see isTrackBusy) so it knows when to
// stop polling and pick up the refreshed video. Keyed by PlaylistVideo id,
// not youtubeId — unlike deleteTrackEverywhere, neither of these ever
// touches another playlist's copy of the same file. Named generically
// (rather than e.g. activeTrackSearches) since it now guards two distinct
// operations that both end in the frontend's one "searchingHq" polling flag
// — the JSON field name predates renameTrack but still accurately describes
// what a rename ends with (see renameTrack's own doc comment).
const activeTrackOperations = new Set<string>();

export function isTrackBusy(videoId: string): boolean {
  return activeTrackOperations.has(videoId);
}

// Last search's near-misses for a track, keyed by
// PlaylistVideo id — populated by searchTrackQuality below once a search
// finishes with no real match, read by routes/youtube.ts's GET
// .../videos/:videoId (polled the same way as searchingHq) so the frontend
// can offer them as one-click rename suggestions. Deliberately in-memory,
// not persisted: this is a suggestion tied to one specific search run, not
// durable state about the track. Cleared whenever a new search or rename
// starts for this video (a fresh action supersedes whatever the last one
// suggested) and via dismissCloseHqCandidates once the frontend's shown it.
const closeCandidatesByVideo = new Map<string, CloseHqCandidate[]>();

export function getCloseHqCandidates(videoId: string): CloseHqCandidate[] {
  return closeCandidatesByVideo.get(videoId) ?? [];
}

export function dismissCloseHqCandidates(videoId: string): void {
  closeCandidatesByVideo.delete(videoId);
}

// Fire-and-forget entry point for the track context menu's "Search for HQ"
// action — the route adds videoId to activeTrackOperations synchronously
// (before responding) so a near-simultaneous second click is rejected
// before this even starts; this function only clears it once the search
// genuinely finishes, success or failure alike.
export function startTrackHqSearch(videoId: string): void {
  activeTrackOperations.add(videoId);
  searchTrackQuality(videoId)
    .catch((err) => console.error(`[hq] Track search failed for ${videoId}:`, (err as Error).message))
    .finally(() => activeTrackOperations.delete(videoId));
}

// The single-track equivalent of resolvePlaylistQuality's loop body — same
// provider cascade, same auto-download-vs-flag-only branching, run for
// exactly the one video the user right-clicked (or long-pressed) and chose
// "Search for HQ" on, rather than every pending video in its playlist. Not
// gated on qualityCheckStatus/hqFileDownloaded the way the batch pass is —
// this is an explicit, one-off user request, not a routine sweep, so it
// always actually searches regardless of what a past check found (short of
// the bitrate-ceiling short-circuit inside checkVideoQuality, which still
// applies: an already-maxed-out track has nothing to gain from any source).
// trustedName: true — same reasoning as renameTrack's own call below: a
// human deliberately asked for this specific track, so the duration
// backstop is relaxed here too, not just on the post-rename search.
async function searchTrackQuality(videoId: string): Promise<void> {
  if (!isOnline()) return;
  closeCandidatesByVideo.delete(videoId);
  const video = await prisma.playlistVideo.findUniqueOrThrow({ where: { id: videoId } });
  const sessions = await buildHqSessions(video.playlistId, 1);
  const closeCandidates: CloseHqCandidate[] = [];
  await checkVideoQuality(video, sessions, undefined, true, closeCandidates);
  if (closeCandidates.length > 0) closeCandidatesByVideo.set(videoId, closeCandidates);
}

// Fire-and-forget entry point for the track context menu's "Rename track"
// action — same activeTrackOperations guard/lifecycle as startTrackHqSearch.
export function startTrackRename(videoId: string, artist: string | null, title: string): void {
  activeTrackOperations.add(videoId);
  renameTrack(videoId, artist, title)
    .catch((err) => console.error(`[rename] Track rename failed for ${videoId}:`, (err as Error).message))
    .finally(() => activeTrackOperations.delete(videoId));
}

// Persists the user's manually-typed artist/title, then follows up with
// whichever of the two automatic passes this track hasn't already resolved
// — a rename exists specifically to fix a bad auto-parsed name, so both the
// metadata match and the HQ search deserve a fresh shot at it with the
// corrected name, but only for the piece(s) actually still missing (see
// TrackContextMenu's own "already resolved" disable condition, which uses
// this same pair of checks to decide whether Rename is worth offering at
// all). Reuses searchTrackQuality's exact provider cascade for the HQ half,
// and metadataWorker.ts's resolveMetadataForRename for the metadata half.
export async function renameTrack(videoId: string, artist: string | null, title: string): Promise<void> {
  // A rename supersedes whatever the last search suggested — most obviously
  // when it's the rename the user picked from that very suggestion list.
  closeCandidatesByVideo.delete(videoId);
  const video = await prisma.playlistVideo.update({
    where: { id: videoId },
    data: { artist, title },
    include: { mediaFile: true },
  });

  if (video.metadataStatus !== 'found' && isOnline()) {
    await resolveMetadataForRename(video, artist, title);
  }

  // Re-read after the metadata step above, which may have changed
  // artist/title again (a real MusicBrainz match always wins over the
  // user's typed input) and could in principle also be the very thing that
  // already answers "is there an HQ upgrade" for some future provider that
  // keys off mbRecordingId — reading fresh keeps the HQ step working from
  // whatever's actually true right now rather than a stale in-memory copy.
  const fresh = await prisma.playlistVideo.findUniqueOrThrow({ where: { id: videoId } });
  const alreadyHasHq = fresh.hqFileDownloaded || fresh.betterQualityExists;
  if (fresh.downloadStatus === 'done' && !alreadyHasHq && isOnline()) {
    const sessions = await buildHqSessions(fresh.playlistId, 1);
    // trustedName: true — see checkVideoQuality's own doc comment on that
    // parameter for why this (and searchTrackQuality above) skip the
    // duration backstop that the batch sync pass keeps.
    await checkVideoQuality(fresh, sessions, undefined, true);
  }
}
