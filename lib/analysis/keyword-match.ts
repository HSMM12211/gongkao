export type KeywordScore = {
  hits: string[]
  misses: string[]
  hitCount: number
  keywordCount: number
  ratio: number
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase()
}

export function scoreKeywords(input: string, keywords: string[]): KeywordScore {
  const normalizedInput = normalizeText(input)
  const hits: string[] = []
  const misses: string[] = []

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword)
    if (normalizedKeyword && normalizedInput.includes(normalizedKeyword)) {
      hits.push(keyword)
    } else {
      misses.push(keyword)
    }
  }

  return {
    hits,
    misses,
    hitCount: hits.length,
    keywordCount: keywords.length,
    ratio: keywords.length === 0 ? 0 : hits.length / keywords.length,
  }
}
