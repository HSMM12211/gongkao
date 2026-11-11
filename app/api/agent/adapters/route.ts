import { NextResponse } from "next/server"
import { detectLocalCliAgentAdapters } from "@/lib/agent/local-cli-detection"

export const dynamic = "force-static"

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json([])
  }

  return NextResponse.json(detectLocalCliAgentAdapters())
}
