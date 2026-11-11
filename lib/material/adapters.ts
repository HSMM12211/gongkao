import type { Flashcard, Question } from "@/lib/data"
import type { ImportedFlashcard, ImportedQuestion } from "@/lib/storage/schema"

export function importedFlashcardToFlashcard(card: ImportedFlashcard): Flashcard {
  return {
    id: `imported-${card.id}`,
    front: card.front,
    keywords: card.keywords,
    category: card.category,
  }
}

export function importedQuestionToQuestion(question: ImportedQuestion): Question {
  return {
    id: `imported-${question.id}`,
    title: question.title,
    type: question.type,
    material: question.material,
    prompt: question.prompt,
    keywords: question.keywords,
    aiAnswer: question.aiAnswer,
  }
}
