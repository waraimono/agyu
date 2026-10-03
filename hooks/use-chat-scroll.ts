"use client"

import { useState, useRef, useEffect, useCallback } from "react"

const BOTTOM_THRESHOLD = 80

interface ChatScrollState {
  isAtBottom: boolean
  unreadCount: number
  scrollToBottom: (behavior?: ScrollBehavior) => void
  onUserScroll: () => void
  containerRef: React.RefObject<HTMLDivElement>
  bottomRef: React.RefObject<HTMLDivElement>
}

/**
 * Encapsulates all chat scroll logic so the component doesn't need to
 * know the details. Designed to support future read/unread features.
 *
 * Contract:
 *  - On mount / messages first loaded → scroll to bottom (instant)
 *  - If isAtBottom when new messages arrive → auto-scroll to bottom (smooth)
 *  - If NOT at bottom when new messages arrive → increment unreadCount, don't scroll
 *  - scrollToBottom() → scroll down, reset unreadCount, set isAtBottom true
 *  - onUserScroll() → check if user scrolled back to bottom, clear unread if so
 */
export function useChatScroll(deps: unknown[]): ChatScrollState {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const [isAtBottom, setIsAtBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  // Track previous message count to detect NEW messages (not initial load)
  const prevCountRef = useRef(0)
  const hasInitializedRef = useRef(false)

  // Check if the container is scrolled to the bottom
  const checkIsAtBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return true
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    return distance < BOTTOM_THRESHOLD
  }, [])

  // Scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
    setIsAtBottom(true)
    setUnreadCount(0)
  }, [])

  // Called when user scrolls manually — update isAtBottom, clear unread if at bottom
  const onUserScroll = useCallback(() => {
    const atBottom = checkIsAtBottom()
    setIsAtBottom(atBottom)
    if (atBottom) {
      setUnreadCount(0)
    }
  }, [checkIsAtBottom])

  // deps[0] is expected to be the messages array length or the messages array
  // We use a separate effect to handle scroll behavior on message changes
  useEffect(() => {
    const currentCount = deps[0] as number
    const el = containerRef.current
    if (!el) return

    if (!hasInitializedRef.current && currentCount > 0) {
      // First load with messages → jump to bottom instantly
      hasInitializedRef.current = true
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "instant" as ScrollBehavior })
        setIsAtBottom(true)
        setUnreadCount(0)
      })
      prevCountRef.current = currentCount
      return
    }

    if (currentCount > prevCountRef.current) {
      // New messages arrived
      if (isAtBottom) {
        // Auto-scroll to bottom (smooth)
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
        })
      } else {
        // User is reading history — increment unread count
        setUnreadCount((prev) => prev + (currentCount - prevCountRef.current))
      }
    } else if (currentCount < prevCountRef.current) {
      // Messages were deleted (refetch) — if at bottom, stay at bottom
      if (isAtBottom) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
        })
      }
    }

    prevCountRef.current = currentCount
  }, deps)

  return {
    isAtBottom,
    unreadCount,
    scrollToBottom,
    onUserScroll,
    containerRef,
    bottomRef,
  }
}
