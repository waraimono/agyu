"use client"

import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface NewDiscussionFabProps {
  onOpenModal: (prefilledTitle?: string) => void
}

export function NewDiscussionFab({ onOpenModal }: NewDiscussionFabProps) {
  return (
    <motion.button
      onClick={() => onOpenModal()}
      className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-shadow hover:shadow-xl z-40"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Plus className="h-6 w-6" />
    </motion.button>
  )
}

interface NewDiscussionModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (title: string, summary: string | undefined) => Promise<void>
  prefilledTitle?: string
}

export function NewDiscussionModal({
  open,
  onClose,
  onSubmit,
  prefilledTitle,
}: NewDiscussionModalProps) {
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset title when modal opens with prefilled title
  useEffect(() => {
    if (open && prefilledTitle) {
      setTitle(prefilledTitle)
    }
  }, [open, prefilledTitle])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      await onSubmit(title.trim(), summary.trim() || undefined)
      setTitle("")
      setSummary("")
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新しい議論を始める</DialogTitle>
          <DialogDescription>
            新しい議題を作成します。他のユーザーが参加申請を行うことができます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">議題タイトル</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="何について議論しますか？"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">概要（任意）</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="議題の簡単な説明..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 flex-col sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">
              キャンセル
            </Button>
            <Button type="submit" disabled={!title.trim() || isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? "作成中..." : "議論を作成"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
