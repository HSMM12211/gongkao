export const FUTURE_OFFICIAL_TITLES = ["局长", "处长", "省委书记"] as const

export type FutureOfficialTitle = (typeof FUTURE_OFFICIAL_TITLES)[number]

export function buildFutureOfficialName(surname = "申", title: FutureOfficialTitle = "局长") {
  return `未来${surname}${title}`
}

export const DEFAULT_FUTURE_OFFICIAL_NAME = buildFutureOfficialName()
