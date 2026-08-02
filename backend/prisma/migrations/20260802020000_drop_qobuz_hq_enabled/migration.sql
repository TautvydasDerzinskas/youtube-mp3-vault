-- Undoes 20260802000000_add_qobuz_hq_enabled — the Qobuz HQ discovery
-- feature was abandoned, but that migration already ran against prod, so
-- it's kept in place (deleting it would desync prod's migration history)
-- and reverted here instead.
ALTER TABLE "users" DROP COLUMN "qobuzHqEnabled";
