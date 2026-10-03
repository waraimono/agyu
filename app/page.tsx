"use client"

import { useState, useEffect, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { supabase, type Talk, type Author, getOrCreateAuthor, getLocalAuthor } from "@/lib/supabase"
import { TimelineHeader, type TabKey } from "@/components/timeline-header"
import { DiscussionCard } from "@/components/discussion-card"
import { AudienceSidebar } from "@/components/audience-panel"
import { NewDiscussionFab, NewDiscussionModal } from "@/components/new-discussion-fab"
import { TalkRoom } from "@/components/talk-room"
import { NicknameSetup } from "@/components/nickname-setup"

// Admin check — disabled (will be re-implemented later)
// function isAdmin(nickname: string | undefined): boolean {
//   return nickname === "tokitolu1924"
// }

export default function Page() {
  
  const [tab, setTab] = useState<TabKey>("trend")
  const [talks, setTalks] = useState<Talk[]>([])
  const [activeTalk, setActiveTalk] = useState<Talk | null>(null)
  const [audienceTalk, setAudienceTalk] = useState<Talk | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newTalkOpen, setNewTalkOpen] = useState(false)
  const [prefilledTitle, setPrefilledTitle] = useState<string | undefined>()
  const [focusSource, setFocusSource] = useState<string | undefined>() // For focus feature
  const [currentAuthor, setCurrentAuthor] = useState<Author | null>(null)
  const [showNicknameSetup, setShowNicknameSetup] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Admin disabled — will be re-implemented later
  // const isAdminUser = isAdmin(currentAuthor?.nickname)

  useEffect(() => {
    const initAuthor = async () => {
      const local = getLocalAuthor()
      if (local) {
        const { data } = await supabase
          .from("authors")
          .select("*")
          .eq("id", local.id)
          .maybeSingle()
        if (data) {
          setCurrentAuthor(data)
          setIsLoading(false)
          return
        }
      }
      setShowNicknameSetup(true)
      setIsLoading(false)
    }

    initAuthor()
    fetchTalks()
  }, [])

  const fetchTalks = useCallback(async () => {
    let query = supabase
      .from("talks")
      .select("*, author:authors!talks_created_by_fkey(*)")
      .order("created_at", { ascending: false })

    if (tab === "resolved") {
      query = query.eq("status", "resolved")
    } else if (tab === "unresolved") {
      query = query.eq("status", "unresolved")
    }

    const { data: talksData } = await query

    if (talksData) {
      const talksWithMeta = await Promise.all(
        talksData.map(async (talk) => {
          const [participantCount, messageCount] = await Promise.all([
            supabase.from("participants").select("id", { count: "exact", head: true }).eq("talk_id", talk.id),
            supabase.from("messages").select("id", { count: "exact", head: true }).eq("talk_id", talk.id),
          ])

          return {
            ...talk,
            participant_count: participantCount.count || 0,
            message_count: messageCount.count || 0,
            author: talk.author as Author,
            focus_source: talk.focus_source,
          } as Talk
        })
      )

      let sorted = talksWithMeta
      if (tab === "trend") {
        sorted = talksWithMeta.sort((a, b) => {
          if (a.status === "debating" && b.status !== "debating") return -1
          if (b.status === "debating" && a.status !== "debating") return 1
          return (b.message_count || 0) - (a.message_count || 0)
        })
      }

      setTalks(sorted)
    }
  }, [tab])

  useEffect(() => {
  console.log("activeTalk changed:", activeTalk)
  }, [activeTalk])

  useEffect(() => {
    fetchTalks()
  }, [fetchTalks])

  useEffect(() => {
    const channel = supabase
      .channel("timeline")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "talks" },
        () => fetchTalks()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "talks" },
        () => fetchTalks()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "talks" },
        () => fetchTalks()
      )
      .subscribe((status) => {
        console.log("Realtime [timeline]:", status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchTalks])

  const handleOpenAudience = (talk: Talk) => {
    setAudienceTalk(talk)
    setSidebarOpen(true)
  }

  const handleOpenTalk = (talk: Talk) => {
    setActiveTalk(talk)
  }

  const handleCreateTalk = async (title: string, summary?: string) => {
    console.log("handleCreateTalk called")
    if (!currentAuthor) return

    // Atomically create talk + add creator as first participant via RPC
    const { data: talk, error: talkError } = await supabase.rpc("create_talk_with_owner", {
      p_title: title,
      p_summary: summary ?? "",
      p_author_id: currentAuthor.id,
      p_focus_source: focusSource ?? "",
    })
    
    console.log("RPC returned:", talk)
    console.log("Is array?", Array.isArray(talk))
    console.log("talk[0]:", talk?.[0])
    
    const createdTalk = Array.isArray(talk) ? talk[0] : talk

    if (talkError || !talk) {
      console.error("Failed to create talk:", talkError)
      return
    }

    setNewTalkOpen(false)
    setFocusSource(undefined)
    setPrefilledTitle(undefined)
    
    await fetchTalks()

    // Auto-open the talk so creator can immediately start chatting
    setActiveTalk(createdTalk as Talk)
  }

  // Focus feature - create new discussion based on comment/message
  const handleFocus = (text: string) => {
    setPrefilledTitle(text.slice(0, 100)) // Pre-fill with first 100 chars
    setFocusSource(text) // Save full source for reference
    setNewTalkOpen(true)
  }

  // Admin delete talk — disabled (will be re-implemented later)
  // const handleAdminDeleteTalk = async (talkId: string) => {
  //   if (!isAdminUser) return
  //   const { error } = await supabase.from("talks").delete().eq("id", talkId)
  //   if (!error) {
  //     setTalks((prev) => prev.filter((t) => t.id !== talkId))
  //     if (activeTalk?.id === talkId) {
  //       setActiveTalk(null)
  //     }
  //   }
  // }

  const handleNicknameSubmit = async (nickname: string) => {
    const author = await getOrCreateAuthor(nickname)
    if (author) {
      setCurrentAuthor(author)
      setShowNicknameSetup(false)
    }
  }

  const handleOpenNewTalkModal = (prefilled?: string) => {
    setPrefilledTitle(prefilled)
    setNewTalkOpen(true)
  }

  const handleTalkUpdated = useCallback((updated: Talk) => {
  setActiveTalk(updated)
  }, [])

  const handleBackFromTalk = useCallback(() => {
  console.log("BACK CLICKED")
  setActiveTalk(null)
  }, [])

  

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (activeTalk) {
    return (
      <>
        <TalkRoom
          talk={activeTalk}
          currentAuthor={currentAuthor}
          onBack={handleBackFromTalk}
          onOpenAudience={() => handleOpenAudience(activeTalk)}
          onFocus={handleFocus}
          onTalkDeleted={() => {
            setActiveTalk(null)
            fetchTalks()
          }}
          // onTalkUpdated={(updated) => setActiveTalk(updated)}
          onTalkUpdated={handleTalkUpdated}
        />
        <AudienceSidebar
          talk={activeTalk}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          currentAuthor={currentAuthor}
          onFocus={handleFocus}
        />
      </>
    )
  }

  return (
    <main className="min-h-dvh bg-background pb-20">
      <TimelineHeader active={tab} onChange={setTab} />

      <div className="mx-auto max-w-2xl px-3 sm:px-4 py-4 sm:py-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-3 sm:gap-4"
          >
            {talks.map((talk) => (
              <DiscussionCard
                key={talk.id}
                talk={talk}
                currentAuthor={currentAuthor}
                onOpen={handleOpenTalk}
                onOpenAudience={handleOpenAudience}
                onAdminDelete={undefined /* admin disabled */}
                focusSource={talk.focus_source || undefined}
              />
            ))}

            {talks.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 sm:py-20 text-center"
              >
                <div className="text-4xl sm:text-5xl mb-4">💡</div>
                <h3 className="text-base sm:text-lg font-semibold">まだ議論はありません</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  新しい議論を始めてみましょう！
                </p>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <NewDiscussionFab onOpenModal={() => handleOpenNewTalkModal()} />

      <NewDiscussionModal
        open={newTalkOpen}
        onClose={() => {
          setNewTalkOpen(false)
          setPrefilledTitle(undefined)
          setFocusSource(undefined)
        }}
        onSubmit={handleCreateTalk}
        prefilledTitle={prefilledTitle}
      />

      <AudienceSidebar
        talk={audienceTalk}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentAuthor={currentAuthor}
        onFocus={handleFocus}
      />

      <NicknameSetup open={showNicknameSetup} onSubmit={handleNicknameSubmit} />

      {/* Current user badge */}
      {currentAuthor && (
        <div className="fixed bottom-4 sm:bottom-6 left-3 sm:left-6 flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs sm:text-sm max-w-[calc(100vw-1.5rem)] sm:max-w-none shadow-lg">
          <span className="text-muted-foreground shrink-0">ゲスト:</span>
          <span className="font-medium truncate">{currentAuthor.nickname}</span>
          {/* Admin badge disabled — will be re-implemented later */}
          {/* {isAdminUser && (
            <span className="text-rose-600 font-medium">(管理者)</span>
          )} */}
        </div>
      )}
    </main>
  )
}
