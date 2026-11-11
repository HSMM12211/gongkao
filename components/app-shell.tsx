"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Sparkles,
  Repeat2,
  PenLine,
  BookText,
  Cloud,
  Cpu,
  Upload,
  Settings,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { AgentExecutorMenu } from "@/components/agent/agent-executor-menu"
import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
import { RuntimeProvider, useRuntime } from "@/lib/runtime-store"
import { DEFAULT_FUTURE_OFFICIAL_NAME } from "@/lib/user-title"

const NAV = [
  { href: "/", label: "工作台", icon: LayoutDashboard },
  { href: "/focus", label: "专注唤醒舱", icon: Sparkles },
  { href: "/review", label: "智能温故舱", icon: Repeat2 },
  { href: "/practice", label: "申论训练闭环", icon: PenLine },
  { href: "/copybook", label: "字帖导出舱", icon: BookText },
  { href: "/materials", label: "素材知识库", icon: Upload },
  { href: "/settings", label: "系统设置", icon: Settings },
]

function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-card border-r border-border/60">
      {/* 顶部 LOGO 椭圆卡片块 */}
      <div className="px-5 pt-5 pb-4">
        <div className="rounded-[28px] border border-border/70 bg-background px-4 py-5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="font-serif text-base font-bold tracking-[0.22em] text-primary leading-tight">
            SHENLUN
          </div>
          <div className="mt-1.5 text-[11px] tracking-[0.28em] text-muted-foreground">
            AI · 申论智修
          </div>
        </div>
      </div>

      {/* 把手分隔条 */}
      <div className="px-5 pb-3">
        <div className="h-9 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/60">
          <div className="flex flex-col gap-0.5">
            <span className="block h-px w-4 bg-current" />
            <span className="block h-px w-4 bg-current" />
            <span className="block h-px w-4 bg-current" />
          </div>
        </div>
      </div>

      {/* 椭圆胶囊导航 —— 每一项都是独立的椭圆长条 */}
      <nav className="flex-1 px-4 space-y-2">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
          const Icon = n.icon
          return (
            <div key={n.href} className="space-y-1">
              <Link
                href={n.href}
                className={cn(
                  "flex items-center gap-3 rounded-full h-11 px-5 text-[13px] transition-all",
                  active
                    ? "bg-primary/12 text-primary font-medium"
                    : "text-foreground/65 hover:bg-muted/60 hover:text-foreground",
                )}
                style={
                  active
                    ? { boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--primary) 22%, transparent)" }
                    : undefined
                }
              >
                <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-foreground/55")} />
                <span className="truncate">{n.label}</span>
              </Link>
              {n.href === "/materials" && pathname.startsWith("/materials") ? <MaterialsSecondaryNav compact /> : null}
            </div>
          )
        })}
      </nav>

      {/* 底部退出椭圆胶囊 */}
      <div className="px-4 pb-5 pt-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-full h-11 px-5 text-[13px] text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        >
          <LogOut className="size-[18px]" />
          <span>退出登录</span>
        </button>
      </div>
    </aside>
  )
}

function TopBar() {
  const pathname = usePathname()
  const { runtime, setRuntime } = useRuntime()
  const isLocal = runtime === "local"
  const current = NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)))

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="whitespace-nowrap text-xl font-serif font-bold tracking-wide text-foreground">
          {current?.label ?? "工作台"}
        </h1>
        <span className="hidden lg:inline text-xs text-muted-foreground">
          考公申论 · 离线 / 混合 AI 工作台
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* 内核切换 */}
        <div
          className={cn(
            "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-colors",
            isLocal
              ? "bg-secondary/10 border-secondary/40 text-secondary"
              : "bg-primary/5 border-primary/30 text-primary",
          )}
        >
          {isLocal ? <Cpu className="size-3.5" /> : <Cloud className="size-3.5" />}
          <span className="font-medium">{isLocal ? "本地硬核" : "云端轻量"}</span>
          <Switch
            checked={isLocal}
            onCheckedChange={(v) => setRuntime(v ? "local" : "cloud")}
            className="ml-1 scale-90"
            aria-label="切换运行内核"
          />
        </div>

        <AgentExecutorMenu />

        {/* 用户胶囊 */}
        <div className="flex items-center gap-2 rounded-full border border-border bg-background pl-1 pr-3 py-1">
          <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold">
            申
          </div>
          <span className="text-sm text-foreground/80">{DEFAULT_FUTURE_OFFICIAL_NAME} · 已登录</span>
        </div>
      </div>
    </header>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RuntimeProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 overflow-auto bg-background">{children}</main>
        </div>
      </div>
    </RuntimeProvider>
  )
}
