"use client"

import { useState, useEffect, useRef } from "react"
import { Eye, Send, Focus, MessageCircle, Edit2, Trash2, X, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import { supabase, type Talk, type AudienceComment, type Author } from "@/lib/supabase"

// Admin check — disabled (will be re-implemented later)
// function isAdmin(nickname: string | undefined): boolean {
//   return nickname === "tokitolu1924"
// }

interface AudienceSidebarProps {
  talk: Talk | null
  open: boolean
  onClose: () => void
  currentAuthor: Author | null
  onFocus: (text: string) => void
}

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function AudienceSidebar({
  talk,
  open,
  onClose,
  currentAuthor,
  onFocus,
}: AudienceSidebarProps) {
  const [comments, setComments] = useState<AudienceComment[]>([])
  const [newComment, setNewComment] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  // Admin disabled — will be re-implemented later
  // const isAdminUser = isAdmin(currentAuthor?.nickname)

  useEffect(() => {
    if (!talk || !open) return

    const fetchComments = async () => {
      const { data } = await supabase
        .from("audience_comments")
        .select("*, author:authors(*)")
        .eq("talk_id", talk.id)
        .order("created_at", { ascending: true })

      if (data) setComments(data as AudienceComment[])
    }

    fetchComments()

    // Real-time subscription — refetch on any event (simple, no sync gaps)
    const channel = supabase
      .channel(`audience:${talk.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audience_comments", filter: `talk_id=eq.${talk.id}` },
        () => fetchComments()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "audience_comments", filter: `talk_id=eq.${talk.id}` },
        () => fetchComments()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "audience_comments", filter: `talk_id=eq.${talk.id}` },
        () => fetchComments()
      )
      .subscribe((status) => {
        console.log(`Realtime [audience:${talk.id}]:`, status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [talk, open])

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [comments])

  const handleSendComment = async () => {
    if (!newComment.trim() || !talk || !currentAuthor || isSending) return

    setIsSending(true)
    try {
      const { data, error } = await supabase
        .from("audience_comments")
        .insert({
          talk_id: talk.id,
          author_id: currentAuthor.id,
          content: newComment.trim(),
        })
        .select("*, author:authors(*)")
        .single()

      if (!error && data) {
        // Optimistically add to local state
        setComments((prev) => {
          if (prev.some((c) => c.id === data.id)) return prev
          return [...prev, data as AudienceComment]
        })
        setNewComment("")
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleEditComment = async (commentId: string) => {
    if (!editContent.trim()) return

    const { data, error } = await supabase
      .from("audience_comments")
      .update({ content: editContent.trim() })
      .eq("id", commentId)
      .select("*, author:authors(*)")
      .single()

    if (!error && data) {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? (data as AudienceComment) : c))
      )
    }
    setEditingId(null)
    setEditContent("")
  }

  const handleDeleteComment = async (commentId: string) => {
    const { error } = await supabase.from("audience_comments").delete().eq("id", commentId)
    if (!error) {
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    }
    setDeleteId(null)
  }

  const startEditing = (comment: AudienceComment) => {
    setEditingId(comment.id)
    setEditContent(comment.content)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditContent("")
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Eye className="h-5 w-5" />
            外野席
          </SheetTitle>
          {talk && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{talk.title}</p>
          )}
        </SheetHeader>

        <div className="mt-4 flex-1 flex flex-col min-h-0">
          <ScrollArea ref={scrollRef} className="flex-1 pr-2 sm:pr-4">
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {comments.map((comment) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="group flex gap-2"
                  >
                    <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                      <AvatarFallback className="text-xs">
                        {comment.author?.nickname?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-medium truncate max-w-[100px] sm:max-w-[150px]">
                          {comment.author?.nickname || "匿名"}
                        </span>
                        {/* Admin badge disabled — will be re-implemented later */}
                        {/* {isAdmin(comment.author?.nickname) && (
                          <Badge variant="outline" className="text-xs bg-rose-50 border-rose-200 text-rose-600">
                            <Crown className="h-2.5 w-2.5 mr-1" />
                            管理者
                          </Badge>
                        )} */}
                        <span className="text-xs text-muted-foreground">
                          {formatTime(comment.created_at)}
                        </span>
                      </div>
                      {editingId === comment.id ? (
                        <div className="mt-1 flex gap-1">
                          <Input
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="flex-1 h-8 text-sm"
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={cancelEditing}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditComment(comment.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs sm:text-sm break-words">{comment.content}</p>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Admin delete — disabled (will be re-implemented later) */}
                      {/* {isAdminUser && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 sm:h-7 sm:w-7"
                          onClick={() => setDeleteId(comment.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )} */}
                      {/* Edit/Delete for own comments */}
                      {currentAuthor && comment.author_id === currentAuthor.id && !editingId && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 sm:h-7 sm:w-7"
                            onClick={() => startEditing(comment)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 sm:h-7 sm:w-7 text-destructive"
                            onClick={() => setDeleteId(comment.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {/* Focus button */}
                      {(
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 sm:h-7 sm:w-7"
                          onClick={() => onFocus(comment.content)}
                        >
                          <Focus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {comments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center">
                  <MessageCircle className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/30" />
                  <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                    まだコメントはありません
                  </p>
                </div>
              )}
              <div ref={commentsEndRef} />
            </div>
          </ScrollArea>

          <div className="mt-3 sm:mt-4 flex gap-2 flex-shrink-0">
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="コメントを追加..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleSendComment()
                }
              }}
              disabled={!currentAuthor}
              className="h-11 sm:h-10 text-sm"
            />
            <Button
              onClick={handleSendComment}
              disabled={!newComment.trim() || isSending}
              className="h-11 sm:h-10 w-11 sm:w-10 px-0"
            >
              {isSending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent className="max-w-[95vw] sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg sm:text-base">コメントを削除</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                このコメントを削除しますか？この操作は取り消せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11 sm:h-10">キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && handleDeleteComment(deleteId)}
                className="bg-destructive hover:bg-destructive/90 h-11 sm:h-10"
              >
                削除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}
