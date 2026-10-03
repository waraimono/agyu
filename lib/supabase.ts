import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export type TalkStatus = 'debating' | 'resolved' | 'unresolved';
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';
export type ConsensusOutcome = 'resolved' | 'unresolved';
export type TalkChangeType = 'edit' | 'delete';

export interface Author {
  id: string;
  nickname: string;
  is_guest: boolean;
  auth_user_id: string | null;
  created_at: string;
}

export interface Talk {
  id: string;
  title: string;
  summary: string | null;
  status: TalkStatus;
  is_locked: boolean;
  created_by: string;
  created_at: string;
  focus_source?: string | null; // Reference to the comment/message that spawned this discussion
  author?: Author;
  participant_count?: number;
  message_count?: number;
}

export interface Participant {
  id: string;
  talk_id: string;
  author_id: string;
  joined_at: string;
  author?: Author;
}

export interface Message {
  id: string;
  talk_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Author;
}

export interface AudienceComment {
  id: string;
  talk_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Author;
}

export interface JoinRequest {
  id: string;
  talk_id: string;
  author_id: string;
  status: JoinRequestStatus;
  created_at: string;
  author?: Author;
  approvals?: JoinRequestApproval[];
}

export interface JoinRequestApproval {
  id: string;
  join_request_id: string;
  participant_author_id: string;
  approved: boolean;
  author?: Author;
}

export interface ConsensusVote {
  id: string;
  talk_id: string;
  author_id: string;
  outcome: ConsensusOutcome;
  created_at: string;
  author?: Author;
}

export interface TalkChangeRequest {
  id: string;
  talk_id: string;
  requested_by: string;
  change_type: TalkChangeType;
  new_title: string | null;
  new_summary: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  requester?: Author;
  approvals?: TalkChangeApproval[];
}

export interface TalkChangeApproval {
  id: string;
  change_request_id: string;
  participant_author_id: string;
  approved: boolean;
  author?: Author;
}

// Helper function to get or create author from localStorage
export function getLocalAuthor(): { id: string; nickname: string } | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('discussion_author');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setLocalAuthor(id: string, nickname: string) {
  localStorage.setItem('discussion_author', JSON.stringify({ id, nickname }));
}

export async function getOrCreateAuthor(nickname: string): Promise<Author | null> {
  const local = getLocalAuthor();

  if (local) {
    const { data } = await supabase
      .from('authors')
      .select('*')
      .eq('id', local.id)
      .maybeSingle();

    if (data) return data;
  }

  const { data, error } = await supabase
    .from('authors')
    .insert({ nickname, is_guest: true })
    .select()
    .single();

  if (error) {
    console.error('Failed to create author:', error);
    return null;
  }

  setLocalAuthor(data.id, data.nickname);
  return data;
}
