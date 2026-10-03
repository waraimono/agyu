-- Add talk_change_requests table for unanimous approval of talk changes/deletion
CREATE TABLE IF NOT EXISTS talk_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('edit', 'delete')),
  new_title text,
  new_summary text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

-- Add talk_change_approvals for individual votes
CREATE TABLE IF NOT EXISTS talk_change_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_request_id uuid NOT NULL REFERENCES talk_change_requests(id) ON DELETE CASCADE,
  participant_author_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  approved boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_change_approval UNIQUE (change_request_id, participant_author_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_talk_change_requests_talk ON talk_change_requests(talk_id);
CREATE INDEX IF NOT EXISTS idx_talk_change_requests_status ON talk_change_requests(status);

-- Enable RLS
ALTER TABLE talk_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE talk_change_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies (public for guest app)
DROP POLICY IF EXISTS "anon_select_talk_change_requests" ON talk_change_requests;
CREATE POLICY "anon_select_talk_change_requests" ON talk_change_requests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_talk_change_requests" ON talk_change_requests;
CREATE POLICY "anon_insert_talk_change_requests" ON talk_change_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_talk_change_requests" ON talk_change_requests;
CREATE POLICY "anon_update_talk_change_requests" ON talk_change_requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_talk_change_requests" ON talk_change_requests;
CREATE POLICY "anon_delete_talk_change_requests" ON talk_change_requests FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_talk_change_approvals" ON talk_change_approvals;
CREATE POLICY "anon_select_talk_change_approvals" ON talk_change_approvals FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_talk_change_approvals" ON talk_change_approvals;
CREATE POLICY "anon_insert_talk_change_approvals" ON talk_change_approvals FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_talk_change_approvals" ON talk_change_approvals;
CREATE POLICY "anon_delete_talk_change_approvals" ON talk_change_approvals FOR DELETE
  TO anon, authenticated USING (true);