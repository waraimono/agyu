/*
# Vote Join Request RPC (Atomic, Race-Safe)

## Purpose
Fixes the join request approval system to be race-condition-safe and prevent duplicate votes.

## Changes
1. New function `vote_join_request(uuid, uuid, boolean)`:
   - Atomically processes a vote (approve/reject) on a join request.
   - Uses `FOR UPDATE` row-level lock on the join_request to serialize concurrent votes.
   - Rejects double-voting (returns `already_voted` if a prior vote exists).
   - Rejects voting on non-pending requests (returns `request_not_pending`).
   - On reject: marks join_request as 'rejected' immediately.
   - On approve: counts approvals vs current participants; when all have approved,
     inserts the participant and marks the request 'approved' — all in one transaction.
   - `ON CONFLICT DO NOTHING` on participant insert prevents duplicate participant rows.
   - Returns JSONB: { success, action, error? }.

## Security
- SECURITY DEFINER so the function can operate regardless of caller role.
- RLS remains unchanged (guest app, anon + authenticated CRUD already enabled).

## Important Notes
1. Both approvals AND rejections now create a `join_request_approvals` record,
   so the UI can show "承認済み" / "拒否済み" per voter.
2. The existing UNIQUE(join_request_id, participant_author_id) constraint is the
   database-level guard against duplicate votes; the RPC provides an early, friendly
   error before hitting the constraint.
*/

CREATE OR REPLACE FUNCTION vote_join_request(
  p_join_request_id uuid,
  p_participant_author_id uuid,
  p_approved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request join_requests%ROWTYPE;
  v_participant_count int;
  v_approval_count int;
  v_already_voted boolean;
BEGIN
  -- Lock the join request row to serialize concurrent votes
  SELECT * INTO v_request
  FROM join_requests
  WHERE id = p_join_request_id
  FOR UPDATE;

  -- Request must exist and still be pending
  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_pending');
  END IF;

  -- Check for prior vote (graceful path; UNIQUE constraint is the hard guard)
  SELECT EXISTS(
    SELECT 1 FROM join_request_approvals
    WHERE join_request_id = p_join_request_id
      AND participant_author_id = p_participant_author_id
  ) INTO v_already_voted;

  IF v_already_voted THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_voted');
  END IF;

  -- Record the vote (approve or reject)
  INSERT INTO join_request_approvals (join_request_id, participant_author_id, approved)
  VALUES (p_join_request_id, p_participant_author_id, p_approved);

  -- Rejection immediately closes the request
  IF NOT p_approved THEN
    UPDATE join_requests SET status = 'rejected' WHERE id = p_join_request_id;
    RETURN jsonb_build_object('success', true, 'action', 'rejected');
  END IF;

  -- Approval: count current participants and total approvals
  SELECT count(*) INTO v_participant_count
  FROM participants
  WHERE talk_id = v_request.talk_id;

  SELECT count(*) INTO v_approval_count
  FROM join_request_approvals
  WHERE join_request_id = p_join_request_id
    AND approved = true;

  -- All participants approved → add participant and close request
  IF v_approval_count >= v_participant_count THEN
    INSERT INTO participants (talk_id, author_id)
    VALUES (v_request.talk_id, v_request.author_id)
    ON CONFLICT (talk_id, author_id) DO NOTHING;

    UPDATE join_requests SET status = 'approved' WHERE id = p_join_request_id;
    RETURN jsonb_build_object('success', true, 'action', 'approved_and_joined');
  END IF;

  RETURN jsonb_build_object('success', true, 'action', 'approved_pending');
END;
$$;

-- Grant execute to anon + authenticated (guest app)
GRANT EXECUTE ON FUNCTION vote_join_request(uuid, uuid, boolean) TO anon, authenticated;
