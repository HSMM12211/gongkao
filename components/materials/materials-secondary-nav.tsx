"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Inbox, Layers3, WandSparkles } from "lucide-react"

import { cn } from "@/lib/utils"

const MATERIALS_NAV = [
  { href: "/materials", label: "素材工作台", icon: Layers3, exact: true },
  { href: "/materials/skills", label: "Skill 管理", icon: WandSparkles },
  { href: "/materials/runs", label: "Agent 运行中心", icon: Activity },
  { href: "/materials/inbox", label: "Inbox 审核", icon: Inbox },
]

export function MaterialsSecondaryNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname()

  return (
    <div className={cn("space-y-1", compact ? "pl-9 pr-1" : "mb-5 flex flex-wrap gap-2")}>
      {MATERIALS_NAV.map((item) => {
        const Icon = item.icon
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              compact
                ? "flex h-8 items-center gap-2 rounded-full px-3 text-xs"
                : "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
              active
                ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
