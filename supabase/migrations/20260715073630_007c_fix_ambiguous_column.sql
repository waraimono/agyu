/*
# Fix ambiguous column reference in create_talk_with_owner

## Purpose
Fix the "column reference id is ambiguous" error by aliasing the EXISTS check.
*/

DROP FUNCTION IF EXISTS public.create_talk_with_owner(text, text, uuid, text);

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
  status talk_status,
  is_locked boolean,
  created_at timestamptz,
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
  -- Validate author exists (alias to avoid ambiguity with output column "id")
  SELECT EXISTS(SELECT 1 FROM authors a WHERE a.id = p_author_id) INTO v_author_exists;
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
  SELECT t.id, t.title, t.summary, t.created_by, t.status, t.is_locked, t.created_at, t.focus_source
  FROM talks t
  WHERE t.id = v_talk_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_talk_with_owner TO anon, authenticated;
