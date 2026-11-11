import type { ImportedFlashcard, ImportedQuestion, MaterialSource, MaterialSourceType } from "@/lib/storage/schema"

export type MaterialChunk = {
  index: number
  text: string
}

export type MaterialDraft = {
  topic: string
  summary: string
  source?: string
  tags: string[]
  keywords: string[]
  goldenSentences: string[]
  flashcards: {
    front: string
    keywords: string[]
    category: "金句" | "规范词" | "对策"
  }[]
  practiceQuestions: {
    type: "概括题" | "对策题" | "综合分析" | "应用文" | "大作文"
    title: string
    material: string
    prompt: string
    keywords: string[]
    modelAnswer: string
  }[]
  copybookItems: {
    title: string
    text: string
    tags: string[]
  }[]
}

export type MaterialImportBundle = {
  source: MaterialSource & {
    layoutBlocks?: MaterialLayoutBlock[]
    pages?: MaterialParsedPage[]
  }
  flashcards: ImportedFlashcard[]
  questions: ImportedQuestion[]
  copybookItems: {
    id: string
    source: "manual"
    sourceId: string
    title: string
    text: string
    tags: string[]
    createdAt: string
  }[]
}

export type MaterialFileInput = {
  title: string
  sourceType: MaterialSourceType
  originalName?: string
  text: string
  layoutBlocks?: MaterialLayoutBlock[]
  pages?: MaterialParsedPage[]
}

export type MaterialLayoutBlockType = "heading" | "paragraph" | "list" | "table" | "image" | "formula" | "unknown"

export type MaterialLayoutBlock = {
  id: string
  pageNumber: number
  order: number
  blockType: MaterialLayoutBlockType
  text: string
  markdown?: string
  sourcePath?: string
  bbox?: [number, number, number, number]
}

export type MaterialParsedPage = {
  pageNumber: number
  text: string
  blockIds: string[]
}

export type MaterialSourceReference = {
  title: string
  url?: string
  publisher?: string
  publishedAt?: string
  accessedAt: string
  snapshotPath?: string
  excerpt: string
}

export type AgentMaterialOutput = {
  schemaVersion: 1
  source: MaterialFileInput & {
    references: MaterialSourceReference[]
  }
  draft: MaterialDraft
  report: {
    summary: string
    warnings: string[]
    confidence: number
  }
}
