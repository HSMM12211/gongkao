import type { Flashcard } from "@/lib/data"
import type { ReviewState } from "@/lib/storage/schema"

export function getDueCards(cards: Flashcard[], states: ReviewState[], now = new Date()) {
  const nowMs = now.getTime()
  const stateByCardId = new Map(states.map((state) => [state.cardId, state]))

  return cards.filter((card) => {
    const state = stateByCardId.get(card.id)
    return !state || new Date(state.dueAt).getTime() <= nowMs
  })
}

export function getNextDueAt(states: ReviewState[]) {
  return states
    .map((state) => state.dueAt)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
}
