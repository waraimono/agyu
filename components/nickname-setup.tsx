"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { User } from "lucide-react"

interface NicknameSetupProps {
  open: boolean
  onSubmit: (nickname: string) => Promise<void>
}

export function NicknameSetup({ open, onSubmit }: NicknameSetupProps) {
  const [nickname, setNickname] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    setIsSubmitting(true)
    try {
      await onSubmit(nickname.trim())
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <User className="h-5 w-5" />
            ニックネームを設定
          </DialogTitle>
          <DialogDescription className="text-sm">
            議論に参加するためのニックネームを入力してください。他のユーザーに表示されます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nickname" className="text-sm">ニックネーム</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="表示名を入力"
              required
              autoFocus
              maxLength={30}
              className="text-base sm:text-sm"
            />
          </div>
          <Button type="submit" className="w-full h-11 sm:h-10" disabled={!nickname.trim() || isSubmitting}>
            {isSubmitting ? "設定中..." : "ゲストとして続ける"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
