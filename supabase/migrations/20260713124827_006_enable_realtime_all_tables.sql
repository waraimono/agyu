/*
# Enable Realtime Replication for All Tables

## Purpose
The `supabase_realtime` publication was empty — zero tables were published for
realtime replication. This meant every `.on("postgres_changes", ...)` subscription
in the frontend silently received NO events, so all realtime features were broken
(join requests, approvals, messages, participants, talk changes, consensus votes).

## Changes
1. Drop and recreate the `supabase_realtime` publication with ALL application tables:
   - talks, participants, messages, audience_comments
   - join_requests, join_request_approvals
   - talk_change_requests, talk_change_approvals
   - consensus_votes, authors

## Important Notes
1. `ALTER PUBLICATION ... ADD TABLE` is additive but doesn't handle the case where
   the publication doesn't exist yet, so we use `DROP PUBLICATION IF EXISTS` then
   `CREATE PUBLICATION ... FOR TABLE`.
2. All tables already have RLS enabled. Realtime respects RLS — the anon key can
   only receive events for rows it can SELECT, which is all rows in this guest app.
*/

DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE
  talks,
  participants,
  messages,
  audience_comments,
  join_requests,
  join_request_approvals,
  talk_change_requests,
  talk_change_approvals,
  consensus_votes,
  authors;
