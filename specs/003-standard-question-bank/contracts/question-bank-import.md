# Contract: Question Bank Import Normalization

## Input

`buildQuestionBankRecordsFromParsedOutput(output, records, options)`

Required behavior:

- Accept parsed document output and the already-built Shenlun asset records.
- Produce normalized question-bank items and an import-batch summary.
- Preserve all linked ids for documents, passages, questions, answers, scoring points, provenance, and topics.

## Output

```json
{
  "items": [
    {
      "id": "question-bank-item-example",
      "practiceCategory": "past_paper",
      "type": "countermeasure",
      "title": "Example question",
      "prompt": "Write the answer...",
      "reviewState": "ready",
      "sourceId": "shenlun-doc-example",
      "provenanceIds": ["shenlun-provenance-example"],
      "materialIds": ["shenlun-passage-example"],
      "scoringPointIds": ["shenlun-point-example"]
    }
  ],
  "batch": {
    "id": "question-bank-batch-example",
    "itemIds": ["question-bank-item-example"],
    "readyCount": 1,
    "needsReviewCount": 0,
    "ignoredDuplicateCount": 0,
    "status": "ready"
  }
}
```

## Rules

- One parsed practice question should produce one question-bank item unless it is an obvious duplicate within the same batch.
- If parsed output contains several questions, output count should match detected non-duplicate questions.
- If no questions exist, fallback candidates may be created from high-value sections and must be marked `needs_review`.
- If answer and scoring data are missing, the item remains usable but is not trusted for authoritative scoring.
- Every output item must include at least one provenance id. If parser output did not include explicit provenance, use the document-level fallback provenance.
- Duplicate detection uses normalized source id, prompt text, and material references within the current batch.
