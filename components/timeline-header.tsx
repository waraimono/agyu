"use client"

import { Flame, Clock, CheckCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export type TabKey = "trend" | "latest" | "resolved" | "unresolved"

const tabs: { key: TabKey; label: string; shortLabel?: string; icon: React.ElementType }[] = [
  { key: "trend", label: "注目", shortLabel: "注目", icon: Flame },
  { key: "latest", label: "最新", shortLabel: "最新", icon: Clock },
  { key: "resolved", label: "合意成立", shortLabel: "合意", icon: CheckCircle },
  { key: "unresolved", label: "未解決", shortLabel: "未解決", icon: AlertCircle },
]

interface TimelineHeaderProps {
  active: TabKey
  onChange: (tab: TabKey) => void
}

export function TimelineHeader({ active, onChange }: TimelineHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-3 sm:px-4 py-3">
        <h1 className="text-base sm:text-xl font-bold tracking-tight shrink-0">オープン議論</h1>
        <nav className="flex gap-0.5 sm:gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={cn(
                "flex items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap",
                active === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              <span className="inline">{tab.shortLabel || tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}
