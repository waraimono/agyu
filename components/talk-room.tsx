"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  Send,
  Users,
  Eye,
  Focus,
  UserPlus,
  CheckCircle2,
  XCircle,
  Lock,
  Loader2,
  Trash2,
  Edit,
  Clock,
  AlertTriangle,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { useChatScroll } from "@/hooks/use-chat-scroll"
import {
  supabase,
  type Talk,
  type Message,
  type Participant,
  type Author,
  type JoinRequest,
  type TalkChangeRequest,
} from "@/lib/supabase"

// Admin check — disabled (will be re-implemented later)
// function isAdmin(nickname: string | undefined): boolean {
//   return nickname === "tokitolu1924"
// }

interface TalkRoomProps {
  talk: Talk
  currentAuthor: Author | null
  onBack: () => void
  onOpenAudience: () => void
  onFocus: (text: string) => void
  onTalkDeleted?: () => void
  onTalkUpdated?: (talk: Talk) => void
}

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function TalkRoom({
  talk,
  currentAuthor,
  onBack,
  onOpenAudience,
  onFocus,
  onTalkDeleted,
  onTalkUpdated,
}: TalkRoomProps) {
  const [localTalk, setLocalTalk] = useState<Talk>(talk)
  useEffect(() => { setLocalTalk(talk) }, [talk])

  const talkId = localTalk.id

  const [messages, setMessages] = useState<Message[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [showConsensus, setShowConsensus] = useState(false)
  const [consensusVotes, setConsensusVotes] = useState<{ author_id: string; outcome: string }[]>([])
  const [myVote, setMyVote] = useState<string | null>(null)
  const [isSubmittingVote, setIsSubmittingVote] = useState(false)

  const [myJoinRequest, setMyJoinRequest] = useState<JoinRequest | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [approvalCount, setApprovalCount] = useState(0)

  const [myVotes, setMyVotes] = useState<Record<string, boolean>>({})
  const [votingRequests, setVotingRequests] = useState<Set<string>>(new Set())

  const [talkChangeRequest, setTalkChangeRequest] = useState<TalkChangeRequest | null>(null)
  const [showEditTalk, setShowEditTalk] = useState(false)
  const [showDeleteTalk, setShowDeleteTalk] = useState(false)
  const [editTitle, setEditTitle] = useState(talk.title ?? "")
  const [editSummary, setEditSummary] = useState(talk.summary || "")
  const [myTalkChangeVote, setMyTalkChangeVote] = useState<boolean | null>(null)
  const [isVotingTalkChange, setIsVotingTalkChange] = useState(false)

  // Admin disabled — will be re-implemented later
  // const [isAdminUser, setIsAdminUser] = useState(false)

  // Chat scroll management — encapsulates isAtBottom, unreadCount, auto-scroll
  const {
    isAtBottom: _isAtBottom,
    unreadCount,
    scrollToBottom,
    onUserScroll,
    containerRef: scrollContainerRef,
  } = useChatScroll([messages.length])

  // Refs for stable access inside callbacks
  const currentAuthorRef = useRef(currentAuthor)
  useEffect(() => { currentAuthorRef.current = currentAuthor }, [currentAuthor])

  // Admin disabled — will be re-implemented later
  // useEffect(() => { setIsAdminUser(isAdmin(currentAuthor?.nickname)) }, [currentAuthor])

  const isParticipant = currentAuthor
    ? participants.some((p) => p.author_id === currentAuthor.id)
    : false
  const canChat = isParticipant && !localTalk.is_locked && localTalk.status === "debating"
  const showMyJoinStatus = myJoinRequest && myJoinRequest.status === "pending" && !isParticipant

  // ==================== FETCH FUNCTIONS ====================
  // Each is a useCallback so it can be called from realtime handlers without re-subscribing.

  const fetchTalk = useCallback(async () => {
    const { data } = await supabase
      .from("talks")
      .select("*")
      .eq("id", talkId)
      .maybeSingle()
    if (data) {
      setLocalTalk(data as Talk)
      onTalkUpdated?.(data as Talk)
    }
  }, [talkId, onTalkUpdated])

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("*, author:authors(*)")
      .eq("talk_id", talkId)
      .order("created_at", { ascending: true })
    if (data) setMessages(data as Message[])
  }, [talkId])

  const fetchParticipants = useCallback(async () => {
    const { data } = await supabase
      .from("participants")
      .select("*, author:authors(*)")
      .eq("talk_id", talkId)
    if (data) setParticipants(data as Participant[])
  }, [talkId])

  const fetchJoinRequests = useCallback(async () => {
    const me = currentAuthorRef.current

    // Fetch pending join requests
    const { data: pendingReqs } = await supabase
      .from("join_requests")
      .select("*, author:authors(*)")
      .eq("talk_id", talkId)
      .eq("status", "pending")
    setJoinRequests((pendingReqs as JoinRequest[]) || [])

    // Fetch my existing votes on those requests
    if (me && pendingReqs && pendingReqs.length > 0) {
      const requestIds = pendingReqs.map((r) => r.id)
      const { data: myApprovals } = await supabase
        .from("join_request_approvals")
        .select("join_request_id, approved")
        .in("join_request_id", requestIds)
        .eq("participant_author_id", me.id)
      const votesMap: Record<string, boolean> = {}
      if (myApprovals) {
        for (const a of myApprovals) votesMap[a.join_request_id] = a.approved
      }
      setMyVotes(votesMap)
    } else {
      setMyVotes({})
    }

    // Fetch MY join request (any status, to know if I'm pending/approved/rejected)
    if (me) {
      const { data: myReq } = await supabase
        .from("join_requests")
        .select("*, author:authors(*)")
        .eq("talk_id", talkId)
        .eq("author_id", me.id)
        .maybeSingle()

      if (myReq && (myReq as JoinRequest).status === "pending") {
        setMyJoinRequest(myReq as JoinRequest)
        // Fetch approval count for my request
        const { data: approvals } = await supabase
          .from("join_request_approvals")
          .select("*")
          .eq("join_request_id", (myReq as JoinRequest).id)
          .eq("approved", true)
        setApprovalCount(approvals?.length || 0)
      } else {
        setMyJoinRequest(null)
        setApprovalCount(0)
      }
    }
  }, [talkId])

  const fetchConsensusVotes = useCallback(async () => {
    const me = currentAuthorRef.current
    const { data } = await supabase
      .from("consensus_votes")
      .select("author_id, outcome")
      .eq("talk_id", talkId)
    if (data) {
      setConsensusVotes(data)
      if (me) {
        const mine = data.find((v) => v.author_id === me.id)
        setMyVote(mine?.outcome || null)
      }
    }
  }, [talkId])

  const fetchTalkChangeRequest = useCallback(async () => {
    const me = currentAuthorRef.current
    const { data } = await supabase
      .from("talk_change_requests")
      .select("*, requester:authors!talk_change_requests_requested_by_fkey(*)")
      .eq("talk_id", talkId)
      .eq("status", "pending")
      .maybeSingle()

    if (data) {
      setTalkChangeRequest(data as TalkChangeRequest)
      if (me) {
        const { data: myVoteData } = await supabase
          .from("talk_change_approvals")
          .select("approved")
          .eq("change_request_id", (data as TalkChangeRequest).id)
          .eq("participant_author_id", me.id)
          .maybeSingle()
        setMyTalkChangeVote(myVoteData?.approved ?? null)
      } else {
        setMyTalkChangeVote(null)
      }
    } else {
      setTalkChangeRequest(null)
      setMyTalkChangeVote(null)
    }
  }, [talkId])

  // Initial load — fetch everything
  useEffect(() => {
    fetchTalk()
    fetchMessages()
    fetchParticipants()
    fetchJoinRequests()
    fetchConsensusVotes()
    fetchTalkChangeRequest()
  }, [fetchTalk, fetchMessages, fetchParticipants, fetchJoinRequests, fetchConsensusVotes, fetchTalkChangeRequest])

  // ==================== REALTIME SUBSCRIPTION ====================
  // On any event, refetch the relevant data. This is simpler and more reliable
  // than manually patching state — no sync gaps, no missed edge cases.

  // Stable refs for callbacks inside the subscription
  const onBackRef = useRef(onBack)
  useEffect(() => { onBackRef.current = onBack }, [onBack])
  const onTalkDeletedRef = useRef(onTalkDeleted)
  useEffect(() => { onTalkDeletedRef.current = onTalkDeleted }, [onTalkDeleted])

  useEffect(() => {
    if (!talkId) return

    const channel = supabase
      .channel(`talk:${talkId}`)
      // Messages
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `talk_id=eq.${talkId}` },
        () => fetchMessages()
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `talk_id=eq.${talkId}` },
        () => fetchMessages()
      )
      // Participants
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "participants", filter: `talk_id=eq.${talkId}` },
        () => {
          fetchParticipants()
          // If I just became a participant, clear my join request
          const me = currentAuthorRef.current
          if (me) {
            supabase
              .from("participants")
              .select("id")
              .eq("talk_id", talkId)
              .eq("author_id", me.id)
              .maybeSingle()
              .then(({ data }) => {
                if (data) {
                  setMyJoinRequest(null)
                  setApprovalCount(0)
                }
              })
          }
        }
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "participants", filter: `talk_id=eq.${talkId}` },
        () => fetchParticipants()
      )
      // Join requests
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "join_requests", filter: `talk_id=eq.${talkId}` },
        () => fetchJoinRequests()
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "join_requests", filter: `talk_id=eq.${talkId}` },
        () => fetchJoinRequests()
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "join_requests", filter: `talk_id=eq.${talkId}` },
        () => fetchJoinRequests()
      )
      // Join request approvals (no talk_id filter — filter by join_request_id at app level)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "join_request_approvals" },
        () => fetchJoinRequests()
      )
      // Consensus votes
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "consensus_votes", filter: `talk_id=eq.${talkId}` },
        () => fetchConsensusVotes()
      )
      // Talks
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "talks", filter: `id=eq.${talkId}` },
        () => fetchTalk()
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "talks", filter: `id=eq.${talkId}` },
        () => {
          onTalkDeletedRef.current?.()
          onBackRef.current()
        }
      )
      // Talk change requests
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "talk_change_requests", filter: `talk_id=eq.${talkId}` },
        () => fetchTalkChangeRequest()
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "talk_change_requests", filter: `talk_id=eq.${talkId}` },
        () => fetchTalkChangeRequest()
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "talk_change_requests", filter: `talk_id=eq.${talkId}` },
        () => fetchTalkChangeRequest()
      )
      // Talk change approvals
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "talk_change_approvals" },
        () => fetchTalkChangeRequest()
      )
      .subscribe((status) => {
        console.log(`Realtime [talk:${talkId}]:`, status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [talkId, fetchTalk, fetchMessages, fetchParticipants, fetchJoinRequests, fetchConsensusVotes, fetchTalkChangeRequest])

  // ==================== HANDLERS ====================

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !currentAuthor || !canChat || isSending) return
    setIsSending(true)
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          talk_id: talkId,
          author_id: currentAuthor.id,
          content: newMessage.trim(),
        })
        .select("*, author:authors(*)")
        .single()
      if (!error && data) {
        setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message])
        setNewMessage("")
      }
    } finally {
      setIsSending(false)
    }
  }, [newMessage, currentAuthor, canChat, isSending, talkId])

  const handleJoinRequest = useCallback(async () => {
    if (!currentAuthor || isParticipant || isJoining) return
    setIsJoining(true)

    const { data: currentParticipants } = await supabase
      .from("participants")
      .select("id")
      .eq("talk_id", talkId)
    const currentCount = currentParticipants?.length || 1

    if (currentCount < 2) {
      await supabase.from("participants").insert({
        talk_id: talkId,
        author_id: currentAuthor.id,
      })
      // Realtime will refetch participants
      setIsJoining(false)
    } else {
      const { data: joinRequest, error } = await supabase
        .from("join_requests")
        .insert({
          talk_id: talkId,
          author_id: currentAuthor.id,
          status: "pending",
        })
        .select("*, author:authors(*)")
        .single()
      if (!error && joinRequest) {
        // Realtime INSERT will trigger fetchJoinRequests which sets myJoinRequest
        // But set it locally for instant feedback
        setMyJoinRequest(joinRequest as JoinRequest)
        setApprovalCount(0)
      }
      setIsJoining(false)
    }
  }, [currentAuthor, isParticipant, isJoining, talkId])

  const handleApproveJoinRequest = useCallback(async (request: JoinRequest, approved: boolean) => {
    if (!currentAuthor) return
    if (myVotes[request.id] !== undefined) return
    if (votingRequests.has(request.id)) return

    setVotingRequests((prev) => new Set(prev).add(request.id))
    try {
      const { data, error } = await supabase.rpc("vote_join_request", {
        p_join_request_id: request.id,
        p_participant_author_id: currentAuthor.id,
        p_approved: approved,
      })
      if (error) throw error
      const result = data as { success: boolean; error?: string }
      if (!result.success && result.error === "already_voted") {
        fetchJoinRequests()
        return
      }
      // Realtime events will refetch everything
    } catch (err) {
      console.error("Vote failed:", err)
    } finally {
      setVotingRequests((prev) => {
        const next = new Set(prev)
        next.delete(request.id)
        return next
      })
    }
  }, [currentAuthor, myVotes, votingRequests, fetchJoinRequests])

  const handleConsensusVote = useCallback(async (outcome: "resolved" | "unresolved") => {
    if (!currentAuthor || !isParticipant || isSubmittingVote) return
    setIsSubmittingVote(true)
    try {
      const { error } = await supabase.from("consensus_votes").insert({
        talk_id: talkId,
        author_id: currentAuthor.id,
        outcome,
      })
      if (error) return

      setMyVote(outcome)
      // Realtime INSERT on consensus_votes will refetch votes.
      // Check if all participants voted the same → update talk status
      const { data: parts } = await supabase
        .from("participants")
        .select("author_id")
        .eq("talk_id", talkId)
      const { data: votes } = await supabase
        .from("consensus_votes")
        .select("author_id, outcome")
        .eq("talk_id", talkId)

      const partCount = parts?.length || 0
      const resolvedCount = votes?.filter((v) => v.outcome === "resolved").length || 0
      const unresolvedCount = votes?.filter((v) => v.outcome === "unresolved").length || 0

      if (resolvedCount >= partCount && partCount > 0) {
        await supabase.from("talks").update({ status: "resolved", is_locked: true }).eq("id", talkId)
        setShowConsensus(false)
      } else if (unresolvedCount >= partCount && partCount > 0) {
        await supabase.from("talks").update({ status: "unresolved", is_locked: true }).eq("id", talkId)
        setShowConsensus(false)
      } else if ((votes?.length || 0) >= partCount) {
        setShowConsensus(false)
      }
      // Realtime will refetch consensus votes and talk
    } finally {
      setIsSubmittingVote(false)
    }
  }, [currentAuthor, isParticipant, isSubmittingVote, talkId])

  const handleEditTalk = useCallback(async () => {
    if (!currentAuthor || !isParticipant) return
    const { data, error } = await supabase
      .from("talk_change_requests")
      .insert({
        talk_id: talkId,
        requested_by: currentAuthor.id,
        change_type: "edit",
        new_title: editTitle,
        new_summary: editSummary,
        status: "pending",
      })
      .select("*, requester:authors!talk_change_requests_requested_by_fkey(*)")
      .single()
    if (!error && data) {
      // Realtime INSERT will trigger fetchTalkChangeRequest
      setShowEditTalk(false)
    }
  }, [currentAuthor, isParticipant, talkId, editTitle, editSummary])

  const handleDeleteTalk = useCallback(async () => {
    if (!currentAuthor || !isParticipant) return
    const { error } = await supabase
      .from("talk_change_requests")
      .insert({
        talk_id: talkId,
        requested_by: currentAuthor.id,
        change_type: "delete",
        new_title: null,
        new_summary: null,
        status: "pending",
      })
    if (!error) {
      // Realtime INSERT will trigger fetchTalkChangeRequest
      setShowDeleteTalk(false)
    }
  }, [currentAuthor, isParticipant, talkId])

  const handleApproveTalkChange = useCallback(async (approved: boolean) => {
    if (!currentAuthor || !talkChangeRequest) return
    if (myTalkChangeVote !== null) return
    if (isVotingTalkChange) return
    setIsVotingTalkChange(true)
    try {
      const { data, error } = await supabase.rpc("vote_talk_change", {
        p_change_request_id: talkChangeRequest.id,
        p_participant_author_id: currentAuthor.id,
        p_approved: approved,
      })
      if (error) throw error
      const result = data as { success: boolean; error?: string }
      if (!result.success && result.error === "already_voted") {
        fetchTalkChangeRequest()
        return
      }
      // Realtime events will refetch everything:
      // - talk_change_approvals INSERT → fetchTalkChangeRequest
      // - talk_change_requests UPDATE → fetchTalkChangeRequest
      // - talks UPDATE/DELETE → fetchTalk or onBack
    } catch (err) {
      console.error("Talk change vote failed:", err)
    } finally {
      setIsVotingTalkChange(false)
    }
  }, [currentAuthor, talkChangeRequest, myTalkChangeVote, isVotingTalkChange, fetchTalkChangeRequest])

  // Admin handlers — disabled (will be re-implemented later)
  // const handleAdminDeleteMessage = useCallback(async (messageId: string) => {
  //   if (!isAdminUser) return
  //   await supabase.from("messages").delete().eq("id", messageId)
  // }, [isAdminUser])
  //
  // const handleAdminDeleteTalk = useCallback(async () => {
  //   if (!isAdminUser) return
  //   await supabase.from("talks").delete().eq("id", talkId)
  // }, [isAdminUser, talkId])

  // ==================== RENDER ====================

  return (
    <div className="flex h-full sm:h-screen flex-col bg-background">
      {/* Talk Change Request Banner */}
      {talkChangeRequest && isParticipant && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-50 flex items-center justify-between gap-2 bg-blue-100 dark:bg-blue-900/30 px-3 sm:px-4 py-3 text-xs sm:text-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Edit className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
            <span className="font-medium text-blue-900 dark:text-blue-100 truncate">
              <strong className="hidden sm:inline">{talkChangeRequest.requester?.nickname || "誰か"}</strong>
              <strong className="sm:hidden">誰か</strong>
              さんから議題の{talkChangeRequest.change_type === "delete" ? "削除" : "変更"}申請
            </span>
          </div>
          <div className="flex gap-1 sm:gap-2 flex-shrink-0">
            {isVotingTalkChange ? (
              <span className="text-xs text-blue-700 dark:text-blue-200 px-2 py-1">送信中...</span>
            ) : myTalkChangeVote !== null ? (
              <Badge variant="outline" className={cn("text-xs px-2 sm:px-3 py-1", myTalkChangeVote ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-rose-50 border-rose-300 text-rose-700")}>
                {myTalkChangeVote ? "承認済み" : "拒否済み"}
              </Badge>
            ) : (
              <>
                <Button size="sm" variant="outline" className="bg-transparent border-blue-400 text-xs px-2 sm:px-3" onClick={() => handleApproveTalkChange(false)}>
                  <XCircle className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">拒否</span>
                </Button>
                <Button size="sm" className="bg-blue-500 hover:bg-blue-600 text-xs px-2 sm:px-3" onClick={() => handleApproveTalkChange(true)}>
                  <CheckCircle2 className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">承認</span>
                </Button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Join Request Banner - For participants */}
      {joinRequests.length > 0 && isParticipant && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-50 flex items-center justify-between gap-2 bg-amber-100 dark:bg-amber-900/30 px-3 sm:px-4 py-3 text-xs sm:text-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <UserPlus className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 flex-shrink-0" />
            <span className="font-medium text-amber-900 dark:text-amber-100 truncate">
              <strong>{joinRequests[0].author?.nickname || "誰か"}</strong>
              さん参加申請中
            </span>
          </div>
          <div className="flex gap-1 sm:gap-2 flex-shrink-0">
            {votingRequests.has(joinRequests[0].id) ? (
              <span className="text-xs text-amber-700 dark:text-amber-200 px-2 py-1">送信中...</span>
            ) : myVotes[joinRequests[0].id] !== undefined ? (
              <Badge variant="outline" className={cn("text-xs px-2 sm:px-3 py-1", myVotes[joinRequests[0].id] ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-rose-50 border-rose-300 text-rose-700")}>
                {myVotes[joinRequests[0].id] ? "承認済み" : "拒否済み"}
              </Badge>
            ) : (
              <>
                <Button size="sm" variant="outline" className="bg-transparent border-amber-400 text-xs px-2 sm:px-3" onClick={() => handleApproveJoinRequest(joinRequests[0], false)}>
                  <XCircle className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">拒否</span>
                </Button>
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-xs px-2 sm:px-3" onClick={() => handleApproveJoinRequest(joinRequests[0], true)}>
                  <CheckCircle2 className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">承認</span>
                </Button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* My Join Request Status - For applicant */}
      {showMyJoinStatus && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-muted px-3 sm:px-4 py-3 text-xs sm:text-sm">
          <Clock className="h-4 w-4 animate-pulse text-amber-500 flex-shrink-0" />
          <span>参加申請中（{participants.length}人中{approvalCount}人が承認済み）</span>
        </div>
      )}

      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between border-b px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-1 sm:gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={onBack}>
            <ArrowLeft className="h-4 sm:h-5 w-4 sm:w-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-semibold truncate text-sm sm:text-base">{localTalk.title}</h2>
            <div className="flex items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
              <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>{participants.length}人参加中</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Admin badge disabled — will be re-implemented later */}
          {/* {isAdminUser && (
            <Badge variant="outline" className="gap-1 text-xs bg-rose-50 border-rose-200 text-rose-600">
              <Crown className="h-3 w-3" />
              管理者
            </Badge>
          )} */}
          {isParticipant && localTalk.status === "debating" && !localTalk.is_locked && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setShowConsensus(true)}>
                <CheckCircle2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => setShowEditTalk(true)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-destructive" onClick={() => setShowDeleteTalk(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          {/* Admin delete talk disabled — will be re-implemented later */}
          {/* {isAdminUser && (
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-destructive" onClick={handleAdminDeleteTalk}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )} */}
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={onOpenAudience}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Join Request Section */}
      {isParticipant && joinRequests.length > 0 && (
        <div className="flex-shrink-0 border-b bg-muted/50 px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground mb-2">
            <UserPlus className="h-4 w-4" />
            参加申請一覧
          </div>
          <div className="space-y-2">
            {joinRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-lg border bg-background p-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-6 w-6 sm:h-7 sm:w-7 flex-shrink-0">
                    <AvatarFallback className="text-xs">
                      {request.author?.nickname?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-xs sm:text-sm truncate">{request.author?.nickname || "匿名"}</span>
                </div>
                <div className="flex gap-1 sm:gap-2">
                  {votingRequests.has(request.id) ? (
                    <span className="text-xs text-amber-700 dark:text-amber-200 px-2 py-1">送信中...</span>
                  ) : myVotes[request.id] !== undefined ? (
                    <Badge variant="outline" className={cn("text-xs px-2 sm:px-3 py-1", myVotes[request.id] ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-rose-50 border-rose-300 text-rose-700")}>
                      {myVotes[request.id] ? "承認済み" : "拒否済み"}
                    </Badge>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleApproveJoinRequest(request, false)}>
                        <XCircle className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">拒否</span>
                      </Button>
                      <Button size="sm" className="h-7 text-xs px-2" onClick={() => handleApproveJoinRequest(request, true)}>
                        <CheckCircle2 className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">承認</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Banner */}
      {localTalk.is_locked && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 bg-muted px-3 sm:px-4 py-2 text-xs sm:text-sm">
          <Lock className="h-3 w-3 sm:h-4 w-4" />
          <span>議論終了（{localTalk.status === "resolved" ? "合意成立" : "未解決"}）</span>
        </div>
      )}

      {/* Messages — plain div for direct scroll control (ScrollArea hides the viewport ref) */}
      <div
        ref={scrollContainerRef}
        onScroll={onUserScroll}
        className="relative flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4"
      >
        <div className="mx-auto max-w-2xl space-y-2 sm:space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "group flex gap-2 sm:gap-3",
                  message.author_id === currentAuthor?.id && "flex-row-reverse"
                )}
              >
                <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                  <AvatarFallback className="text-xs">
                    {message.author?.nickname?.charAt(0).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                  "max-w-[80%] sm:max-w-[70%] rounded-2xl px-3 sm:px-4 py-2",
                  message.author_id === currentAuthor?.id ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate max-w-[100px] sm:max-w-[200px]">
                      {message.author?.nickname || "匿名"}
                    </span>
                    <span className="text-xs opacity-60">{formatTime(message.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm break-words">{message.content}</p>
                </div>
                {/* Admin message delete disabled — will be re-implemented later */}
                {/* {isAdminUser && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 sm:h-7 sm:w-7 opacity-0 group-hover:opacity-100" onClick={() => handleAdminDeleteMessage(message.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )} */}
                {message.author_id !== currentAuthor?.id && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 sm:h-7 sm:w-7 opacity-0 group-hover:opacity-100" onClick={() => onFocus(message.content)}>
                    <Focus className="h-3 w-3" />
                  </Button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 sm:py-16 text-center">
              <div className="text-3xl sm:text-4xl">💭</div>
              <p className="mt-4 text-xs sm:text-sm text-muted-foreground">
                {localTalk.is_locked ? "議論は終了しました" : "まだメッセージはありません。会話を始めましょう！"}
              </p>
            </div>
          )}
          <div className="h-1" />
        </div>

        {/* New message notification button */}
        {unreadCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => scrollToBottom("smooth")}
            className="sticky bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs sm:text-sm text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            新着{unreadCount}件
          </motion.button>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t p-2 sm:p-4">
        <div className="mx-auto flex max-w-2xl gap-2">
          {currentAuthor && !isParticipant && localTalk.status === "debating" && !localTalk.is_locked && !myJoinRequest && (
            <Button onClick={handleJoinRequest} disabled={isJoining} className="w-full h-11 sm:h-10 text-sm">
              {isJoining ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />処理中...</>
              ) : (
                <><UserPlus className="mr-2 h-4 w-4" />{participants.length < 2 ? "参加する（自動承認）" : "参加を申請する"}</>
              )}
            </Button>
          )}
          {currentAuthor && showMyJoinStatus && (
            <div className="w-full text-center">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                参加申請中（{participants.length}人中{approvalCount}人が承認済み）
              </p>
              <Button variant="outline" disabled className="w-full h-11 sm:h-10 text-sm">
                <Clock className="mr-2 h-4 w-4 animate-pulse" />
                全員の承認を待っています
              </Button>
            </div>
          )}
          {currentAuthor && canChat && (
            <>
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="メッセージを入力..."
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }}
                className="flex-1 h-11 sm:h-10 text-sm"
              />
              <Button onClick={handleSendMessage} disabled={!newMessage.trim() || isSending} className="h-11 sm:h-10 w-11 sm:w-10 px-0">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </>
          )}
          {!currentAuthor && (
            <p className="w-full text-center text-xs sm:text-sm text-muted-foreground py-2">
              参加するにはニックネームを設定してください
            </p>
          )}
          {isParticipant && localTalk.is_locked && (
            <p className="w-full text-center text-xs sm:text-sm text-muted-foreground py-2">
              この議論は終了しました
            </p>
          )}
        </div>
      </div>

      {/* Consensus Dialog */}
      <Dialog open={showConsensus} onOpenChange={setShowConsensus}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>議論を終了する</DialogTitle>
            <DialogDescription>投票して議論を終了します。全員が同じ結論に投票すると議論が終了します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 sm:p-4">
              <p className="text-xs sm:text-sm font-medium mb-2">投票状況</p>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-xs sm:text-sm">{consensusVotes.length}/{participants.length}人が投票済み</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                合意成立: {consensusVotes.filter((v) => v.outcome === "resolved").length}票 |
                未解決: {consensusVotes.filter((v) => v.outcome === "unresolved").length}票
              </div>
            </div>
            {myVote ? (
              <p className="text-center text-muted-foreground text-xs sm:text-sm">
                あなたの投票: <strong>{myVote === "resolved" ? "合意成立" : "未解決"}</strong>。他の参加者を待っています...
              </p>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-11 sm:h-10" onClick={() => handleConsensusVote("unresolved")} disabled={isSubmittingVote}>
                  <XCircle className="mr-2 h-4 w-4" />未解決
                </Button>
                <Button className="flex-1 h-11 sm:h-10" onClick={() => handleConsensusVote("resolved")} disabled={isSubmittingVote}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />合意成立
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Talk Dialog */}
      <Dialog open={showEditTalk} onOpenChange={setShowEditTalk}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>議題を編集</DialogTitle>
            <DialogDescription>全参加者の承認が必要です。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium">タイトル</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="議題タイトル" className="h-11 sm:h-10" />
            </div>
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium">概要</label>
              <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} placeholder="議題の概要" rows={3} />
            </div>
            <div className="flex gap-2 flex-col sm:flex-row">
              <Button variant="outline" className="flex-1 h-11 sm:h-10" onClick={() => setShowEditTalk(false)}>キャンセル</Button>
              <Button className="flex-1 h-11 sm:h-10" onClick={handleEditTalk} disabled={!editTitle.trim()}>申請</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Talk Alert */}
      <AlertDialog open={showDeleteTalk} onOpenChange={setShowDeleteTalk}>
        <AlertDialogContent className="max-w-[95vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg sm:text-base">
              <AlertTriangle className="h-5 w-5 text-destructive" />議題を削除
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">この議題を削除しますか？全参加者の承認が必要です。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10">キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTalk} className="bg-destructive hover:bg-destructive/90 h-11 sm:h-10">削除申請</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
