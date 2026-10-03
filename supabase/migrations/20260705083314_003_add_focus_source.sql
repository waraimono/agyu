-- Add focus_source column to talks table for tracking parent comments
ALTER TABLE talks ADD COLUMN IF NOT EXISTS focus_source text NULL;

-- Add comment for context
COMMENT ON COLUMN talks.focus_source IS 'The original comment/message that spawned this discussion via focus feature';