import type { MaterialChunk } from "@/lib/material/types"

export function cleanMaterialText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^第\s*\d+\s*页$/.test(line) && !/^-+\s*\d+\s*-+$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function chunkMaterialText(input: string, maxChars = 5000): MaterialChunk[] {
  const text = cleanMaterialText(input)
  if (!text) return []

  const chunks: MaterialChunk[] = []
  for (let start = 0; start < text.length; start += maxChars) {
    chunks.push({
      index: chunks.length,
      text: text.slice(start, start + maxChars),
    })
  }
  return chunks
}

export function inferSourceTypeFromFileName(name: string): "text" | "markdown" | "pdf" {
  const lower = name.toLowerCase()
  if (lower.endsWith(".pdf")) return "pdf"
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown"
  return "text"
}
