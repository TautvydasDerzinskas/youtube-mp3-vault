// Ported verbatim from the standalone qobuz_module prototype (not part of this repo) — its src/server/communityStatus.ts — minimal
// port of the cooldown/rate-limit status plumbing from SpotiFLAC's app.go /
// community_endpoints.go, just enough to surface state to the admin UI.

interface CooldownState {
  active: boolean;
  message: string;
  untilMs: number;
}

let rateLimitCooldown: CooldownState = { active: false, message: '', untilMs: 0 };
let communityCooldown: CooldownState = { active: false, message: '', untilMs: 0 };

export function setRateLimitCooldown(seconds: number): void {
  rateLimitCooldown = {
    active: true,
    message: `Rate limited, waiting ~${Math.ceil(seconds)}s`,
    untilMs: Date.now() + seconds * 1000,
  };
}

export function clearRateLimitCooldown(): void {
  rateLimitCooldown = { active: false, message: '', untilMs: 0 };
}

export function setCommunityCooldown(seconds: number, message: string): void {
  communityCooldown = { active: true, message, untilMs: Date.now() + seconds * 1000 };
}

export function clearCommunityCooldown(): void {
  communityCooldown = { active: false, message: '', untilMs: 0 };
}

export function getCommunityStatus() {
  return { rateLimitCooldown, communityCooldown };
}

export class CommunityCooldownError extends Error {
  constructor(
    public readonly service: string,
    public readonly seconds: number,
  ) {
    super(`${service} community API is on a scheduled cooldown, retry in ~${Math.ceil(seconds / 60)} minute(s)`);
    this.name = 'CommunityCooldownError';
  }
}
