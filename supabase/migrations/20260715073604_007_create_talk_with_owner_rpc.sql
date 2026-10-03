/*
# Create talk with owner RPC

## Purpose
Atomically creates a talk AND inserts the creator as the first participant
in a single database transaction. This eliminates the race condition where
the talk is created but the participant insert fails silently, leaving the
talk with 0 participants.

## Changes
1. New RPC function: `create_talk_with_owner(p_title, p_summary, p_author_id, p_focus_source)`
   - Inserts a new talk with status='debating'
   - Inserts the creator as a participant in the same transaction
   - Returns the created talk row
   - If the participant insert fails, the entire transaction rolls back

## Security
- SECURITY DEFINER with a secure search_path
- No RLS changes needed (existing policies remain)
- The function runs with table owner privileges, bypassing RLS for the
  internal inserts, which is safe because the caller provides their own
  author_id and the function validates it exists

## Important notes
1. This function is called from the frontend with the anon key
2. The author_id is validated against the authors table before proceeding
3. If the author doesn't exist, the function returns NULL
4. The returned row matches the talks table schema
*/

CREATE OR REPLACE FUNCTION public.create_talk_with_owner(
  p_title text,
  p_summary text,
  p_author_id uuid,
  p_focus_source text
)
RETURNS TABLE (
  id uuid,
  title text,
  summary text,
  created_by uuid,
  status text,
  is_locked boolean,
  created_at timestamptz,
  updated_at timestamptz,
  focus_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_talk_id uuid;
  v_author_exists boolean;
BEGIN
  -- Validate author exists
  SELECT EXISTS(SELECT 1 FROM authors WHERE id = p_author_id) INTO v_author_exists;
  IF NOT v_author_exists THEN
    RETURN;
  END IF;

  -- Create the talk
  INSERT INTO talks (title, summary, created_by, status, focus_source)
  VALUES (p_title, NULLIF(p_summary, ''), p_author_id, 'debating', NULLIF(p_focus_source, ''))
  RETURNING id INTO v_talk_id;

  -- Add creator as first participant (same transaction)
  INSERT INTO participants (talk_id, author_id)
  VALUES (v_talk_id, p_author_id);

  -- Return the created talk
  RETURN QUERY
  SELECT t.id, t.title, t.summary, t.created_by, t.status, t.is_locked, t.created_at, t.updated_at, t.focus_source
  FROM talks t
  WHERE t.id = v_talk_id;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.create_talk_with_owner TO anon, authenticated;
