/*
# Discussion App - Complete Schema

This migration creates a real-time discussion platform where:
- Users can create talks (discussion topics) as guests or future authenticated users
- Talks have participants who engage in real-time chat
- Non-participants can view and comment from an "audience" area
- Join requests require unanimous approval from existing participants
- Talks can be closed via consensus voting

## Tables Created:

1. `authors` - Unified author table for guests and future authenticated users
   - `id` (uuid, primary key)
   - `nickname` (text, required) - Display name
   - `is_guest` (boolean, default true) - True for guests, false for auth users
   - `auth_user_id` (uuid, nullable) - Links to auth.users for future auth
   - `created_at` (timestamp)

2. `talks` - Discussion topics
   - `id` (uuid, primary key)
   - `title` (text, required) - Discussion title
   - `summary` (text, nullable) - Brief description
   - `status` (enum: 'debating', 'resolved', 'unresolved') - Talk state
   - `is_locked` (boolean, default false) - When true, no more messages
   - `created_by` (uuid FK to authors) - Talk initiator
   - `created_at` (timestamp)

3. `participants` - Members of a talk's debate
   - `id` (uuid, primary key)
   - `talk_id` (uuid FK)
   - `author_id` (uuid FK)
   - `joined_at` (timestamp)
   - Unique constraint on (talk_id, author_id)

4. `messages` - Chat messages within a talk
   - `id` (uuid, primary key)
   - `talk_id` (uuid FK)
   - `author_id` (uuid FK)
   - `content` (text, required)
   - `created_at` (timestamp)

5. `audience_comments` - Comments from non-participants
   - `id` (uuid, primary key)
   - `talk_id` (uuid FK)
   - `author_id` (uuid FK)
   - `content` (text, required)
   - `created_at` (timestamp)

6. `join_requests` - Pending join requests for talks
   - `id` (uuid, primary key)
   - `talk_id` (uuid FK)
   - `author_id` (uuid FK)
   - `status` (enum: 'pending', 'approved', 'rejected')
   - `created_at` (timestamp)

7. `join_request_approvals` - Individual approvals/rejections of join requests
   - `id` (uuid, primary key)
   - `join_request_id` (uuid FK)
   - `participant_author_id` (uuid FK to authors) - Who voted
   - `approved` (boolean) - True for approve, false for reject
   - Unique constraint ensures one vote per participant per request

8. `consensus_votes` - Votes to close a talk
   - `id` (uuid, primary key)
   - `talk_id` (uuid FK)
   - `author_id` (uuid FK) - Participant who voted
   - `outcome` (enum: 'resolved', 'unresolved') - Desired closing state
   - `created_at` (timestamp)
   - Unique constraint ensures one vote per participant per talk

## Security:
- RLS enabled on all tables
- All tables allow anon + authenticated access (guest-based app)
- Policies allow full CRUD operations (intentionally public data model)

## Important Notes:
1. This is a guest-first app without authentication - all policies use `TO anon, authenticated`
2. Authors table is designed to support future auth via `auth_user_id` field
3. The join system requires ALL current participants to approve before granting access
4. Consensus for closing talks requires ALL participants to vote the same outcome
*/

-- Create enum types
CREATE TYPE talk_status AS ENUM ('debating', 'resolved', 'unresolved');
CREATE TYPE join_request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE consensus_outcome AS ENUM ('resolved', 'unresolved');

-- Authors table (unified for guests and future auth users)
CREATE TABLE IF NOT EXISTS authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text NOT NULL,
  is_guest boolean NOT NULL DEFAULT true,
  auth_user_id uuid NULL,
  created_at timestamptz DEFAULT now()
);

-- Talks (discussion topics)
CREATE TABLE IF NOT EXISTS talks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  status talk_status NOT NULL DEFAULT 'debating',
  is_locked boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Participants in a talk
CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  CONSTRAINT unique_participant UNIQUE (talk_id, author_id)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Audience comments
CREATE TABLE IF NOT EXISTS audience_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Join requests
CREATE TABLE IF NOT EXISTS join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  status join_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_join_request UNIQUE (talk_id, author_id)
);

-- Join request approvals (individual votes from participants)
CREATE TABLE IF NOT EXISTS join_request_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  join_request_id uuid NOT NULL REFERENCES join_requests(id) ON DELETE CASCADE,
  participant_author_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  approved boolean NOT NULL,
  CONSTRAINT unique_approval_per_participant UNIQUE (join_request_id, participant_author_id)
);

-- Consensus votes (to close talks)
CREATE TABLE IF NOT EXISTS consensus_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id uuid NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  outcome consensus_outcome NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_consensus_vote UNIQUE (talk_id, author_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_talks_status ON talks(status);
CREATE INDEX IF NOT EXISTS idx_talks_created_at ON talks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_participants_talk ON participants(talk_id);
CREATE INDEX IF NOT EXISTS idx_participants_author ON participants(author_id);
CREATE INDEX IF NOT EXISTS idx_messages_talk ON messages(talk_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_audience_comments_talk ON audience_comments(talk_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_talk ON join_requests(talk_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_status ON join_requests(status);
CREATE INDEX IF NOT EXISTS idx_consensus_votes_talk ON consensus_votes(talk_id);

-- Enable RLS on all tables
ALTER TABLE authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE talks ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_request_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus_votes ENABLE ROW LEVEL SECURITY;

-- Authors policies (public CRUD - guest app)
DROP POLICY IF EXISTS "anon_select_authors" ON authors;
CREATE POLICY "anon_select_authors" ON authors FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_authors" ON authors;
CREATE POLICY "anon_insert_authors" ON authors FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_authors" ON authors;
CREATE POLICY "anon_update_authors" ON authors FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_authors" ON authors;
CREATE POLICY "anon_delete_authors" ON authors FOR DELETE
  TO anon, authenticated USING (true);

-- Talks policies (public CRUD - guest app)
DROP POLICY IF EXISTS "anon_select_talks" ON talks;
CREATE POLICY "anon_select_talks" ON talks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_talks" ON talks;
CREATE POLICY "anon_insert_talks" ON talks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_talks" ON talks;
CREATE POLICY "anon_update_talks" ON talks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_talks" ON talks;
CREATE POLICY "anon_delete_talks" ON talks FOR DELETE
  TO anon, authenticated USING (true);

-- Participants policies (public CRUD - guest app)
DROP POLICY IF EXISTS "anon_select_participants" ON participants;
CREATE POLICY "anon_select_participants" ON participants FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_participants" ON participants;
CREATE POLICY "anon_insert_participants" ON participants FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_participants" ON participants;
CREATE POLICY "anon_update_participants" ON participants FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_participants" ON participants;
CREATE POLICY "anon_delete_participants" ON participants FOR DELETE
  TO anon, authenticated USING (true);

-- Messages policies (public CRUD - guest app)
DROP POLICY IF EXISTS "anon_select_messages" ON messages;
CREATE POLICY "anon_select_messages" ON messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
CREATE POLICY "anon_insert_messages" ON messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON messages;
CREATE POLICY "anon_update_messages" ON messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
CREATE POLICY "anon_delete_messages" ON messages FOR DELETE
  TO anon, authenticated USING (true);

-- Audience comments policies (public CRUD - guest app)
DROP POLICY IF EXISTS "anon_select_audience_comments" ON audience_comments;
CREATE POLICY "anon_select_audience_comments" ON audience_comments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_audience_comments" ON audience_comments;
CREATE POLICY "anon_insert_audience_comments" ON audience_comments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_audience_comments" ON audience_comments;
CREATE POLICY "anon_update_audience_comments" ON audience_comments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_audience_comments" ON audience_comments;
CREATE POLICY "anon_delete_audience_comments" ON audience_comments FOR DELETE
  TO anon, authenticated USING (true);

-- Join requests policies (public CRUD - guest app)
DROP POLICY IF EXISTS "anon_select_join_requests" ON join_requests;
CREATE POLICY "anon_select_join_requests" ON join_requests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_join_requests" ON join_requests;
CREATE POLICY "anon_insert_join_requests" ON join_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_join_requests" ON join_requests;
CREATE POLICY "anon_update_join_requests" ON join_requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_join_requests" ON join_requests;
CREATE POLICY "anon_delete_join_requests" ON join_requests FOR DELETE
  TO anon, authenticated USING (true);

-- Join request approvals policies (public CRUD - guest app)
DROP POLICY IF EXISTS "anon_select_join_request_approvals" ON join_request_approvals;
CREATE POLICY "anon_select_join_request_approvals" ON join_request_approvals FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_join_request_approvals" ON join_request_approvals;
CREATE POLICY "anon_insert_join_request_approvals" ON join_request_approvals FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_join_request_approvals" ON join_request_approvals;
CREATE POLICY "anon_delete_join_request_approvals" ON join_request_approvals FOR DELETE
  TO anon, authenticated USING (true);

-- Consensus votes policies (public CRUD - guest app)
DROP POLICY IF EXISTS "anon_select_consensus_votes" ON consensus_votes;
CREATE POLICY "anon_select_consensus_votes" ON consensus_votes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_consensus_votes" ON consensus_votes;
CREATE POLICY "anon_insert_consensus_votes" ON consensus_votes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_consensus_votes" ON consensus_votes;
CREATE POLICY "anon_delete_consensus_votes" ON consensus_votes FOR DELETE
  TO anon, authenticated USING (true);