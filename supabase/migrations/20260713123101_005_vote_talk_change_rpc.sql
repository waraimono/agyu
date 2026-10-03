/*
# Vote Talk Change RPC (Atomic, Race-Safe)

## Purpose
Fixes the talk change request approval system to be race-condition-safe and prevent duplicate votes.

## Changes
1. New function `vote_talk_change(uuid, uuid, boolean)`:
   - Atomically processes a vote (approve/reject) on a talk change request.
   - Uses `FOR UPDATE` row-level lock to serialize concurrent votes.
   - Rejects double-voting (returns `already_voted` if a prior vote exists).
   - Rejects voting on non-pending requests (returns `request_not_pending`).
   - On reject: marks the request as 'rejected' immediately.
   - On approve: counts approvals vs current participants; when all have approved,
     applies the change (edit title/summary or delete the talk) — all in one transaction.
   - Returns JSONB: { success, action, error? }.

## Security
- SECURITY DEFINER so the function can operate regardless of caller role.
- RLS remains unchanged (guest app, anon + authenticated CRUD already enabled).
*/

CREATE OR REPLACE FUNCTION vote_talk_change(
  p_change_request_id uuid,
  p_participant_author_id uuid,
  p_approved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request talk_change_requests%ROWTYPE;
  v_participant_count int;
  v_approval_count int;
  v_already_voted boolean;
BEGIN
  -- Lock the change request row to serialize concurrent votes
  SELECT * INTO v_request
  FROM talk_change_requests
  WHERE id = p_change_request_id
  FOR UPDATE;

  -- Request must exist and still be pending
  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_pending');
  END IF;

  -- Check for prior vote (graceful path; UNIQUE constraint is the hard guard)
  SELECT EXISTS(
    SELECT 1 FROM talk_change_approvals
    WHERE change_request_id = p_change_request_id
      AND participant_author_id = p_participant_author_id
  ) INTO v_already_voted;

  IF v_already_voted THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_voted');
  END IF;

  -- Record the vote (approve or reject)
  INSERT INTO talk_change_approvals (change_request_id, participant_author_id, approved)
  VALUES (p_change_request_id, p_participant_author_id, p_approved);

  -- Rejection immediately closes the request
  IF NOT p_approved THEN
    UPDATE talk_change_requests SET status = 'rejected' WHERE id = p_change_request_id;
    RETURN jsonb_build_object('success', true, 'action', 'rejected');
  END IF;

  -- Approval: count current participants and total approvals
  SELECT count(*) INTO v_participant_count
  FROM participants
  WHERE talk_id = v_request.talk_id;

  SELECT count(*) INTO v_approval_count
  FROM talk_change_approvals
  WHERE change_request_id = p_change_request_id
    AND approved = true;

  -- All participants approved → apply the change
  IF v_approval_count >= v_participant_count THEN
    IF v_request.change_type = 'delete' THEN
      DELETE FROM talks WHERE id = v_request.talk_id;
    ELSE
      UPDATE talks
      SET title = v_request.new_title,
          summary = v_request.new_summary
      WHERE id = v_request.talk_id;
    END IF;

    UPDATE talk_change_requests SET status = 'approved' WHERE id = p_change_request_id;
    RETURN jsonb_build_object('success', true, 'action', 'approved_and_applied');
  END IF;

  RETURN jsonb_build_object('success', true, 'action', 'approved_pending');
END;
$$;

-- Grant execute to anon + authenticated (guest app)
GRANT EXECUTE ON FUNCTION vote_talk_change(uuid, uuid, boolean) TO anon, authenticated;
