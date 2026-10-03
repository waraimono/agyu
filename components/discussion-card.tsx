"use client"

import { motion } from "framer-motion"
import { Users, MessageCircle, Eye, Zap, CheckCircle2, AlertCircle, Clock, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { Talk, Author } from "@/lib/supabase"

// Admin check — disabled (will be re-implemented later)
// function isAdmin(nickname: string | undefined): boolean {
//   return nickname === "tokitolu1924"
// }

interface DiscussionCardProps {
  talk: Talk
  currentAuthor: Author | null
  onOpen: (talk: Talk) => void
  onOpenAudience: (talk: Talk) => void
  onAdminDelete?: (talkId: string) => void
  focusSource?: string // Reference text for focused discussions
}

const statusConfig = {
  debating: {
    icon: Zap,
    label: "議論中",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
  resolved: {
    icon: CheckCircle2,
    label: "合意成立",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  unresolved: {
    icon: AlertCircle,
    label: "未解決",
    className: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  },
}

const formatRelativeTime = (date: string) => {
  const now = new Date()
  const then = new Date(date)
  const diff = now.getTime() - then.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "たった今"
  if (minutes < 60) return `${minutes}分前`
  if (hours < 24) return `${hours}時間前`
  return `${days}日前`
}

export function DiscussionCard({
  talk,
  currentAuthor,
  onOpen,
  onOpenAudience,
  onAdminDelete,
  focusSource,
}: DiscussionCardProps) {
  const status = statusConfig[talk.status]
  const StatusIcon = status.icon
  // Admin disabled — will be re-implemented later
  // const isAdminUser = isAdmin(currentAuthor?.nickname)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative rounded-xl border bg-card p-3 sm:p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Admin delete button — disabled (will be re-implemented later) */}
      {/* isAdminUser && onAdminDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-7 w-7 sm:h-8 sm:w-8 opacity-0 group-hover:opacity-100 z-10"
          onClick={() => onAdminDelete(talk.id)}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      ) */}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Badge variant="outline" className={cn("gap-1 text-xs", status.className)}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </Badge>
            {!talk.is_locked && talk.participant_count === 2 && (
              <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20 text-xs">
                <Zap className="h-3 w-3" />
                アクティブ
              </Badge>
            )}
            {/* Admin badge disabled — will be re-implemented later */}
            {/* {isAdminUser && (
              <Badge variant="outline" className="text-xs bg-rose-50 border-rose-200 text-rose-600">
                <Crown className="h-3 w-3 mr-1" />
                管理者
              </Badge>
            )} */}
          </div>

          <h3 className="text-base sm:text-lg font-semibold leading-tight">{talk.title}</h3>

          {/* Focus source reference */}
          {focusSource && (
            <div className="rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground border-l-2 border-primary/50">
              <span className="font-medium">参照元:</span> "{focusSource.slice(0, 50)}{focusSource.length > 50 ? "..." : ""}"
            </div>
          )}

          {talk.summary && (
            <p className="line-clamp-2 text-xs sm:text-sm text-muted-foreground">{talk.summary}</p>
          )}

          <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {talk.participant_count ?? 0}人
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {talk.message_count ?? 0}件
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {formatRelativeTime(talk.created_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 sm:mt-4 flex gap-2">
        <Button
          onClick={() => onOpen(talk)}
          className="flex-1 h-9 sm:h-10 text-sm"
          disabled={talk.status !== "debating" || talk.is_locked}
        >
          {talk.status !== "debating" ? "議論を見る" : talk.is_locked ? "ロック中" : "議論に参加"}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 sm:h-10 sm:w-10"
          onClick={() => onOpenAudience(talk)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}
