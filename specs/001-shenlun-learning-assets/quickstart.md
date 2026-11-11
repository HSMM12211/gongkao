# Quickstart: Shenlun Learning Assets

## Goal

Validate that imported PDF text becomes structured学习资产 and can generate a
personalized申论 training plan.

## Scenario 1: Import Past Paper Assets

1. Start from a parsed document that contains材料、题目、参考答案、评分要点.
2. Save it through the existing material import flow.
3. Confirm the app creates document, paper, passage, question, answer key,
   scoring point, provenance, topic, and ability records.
4. Confirm any uncertain scoring item is marked `needs_review`.

Expected result: the document can be used by practice and by plan generation.

## Scenario 2: Generate Today Plan

1. Create or load a beginner profile with 40 available minutes.
2. Ensure at least one summary or countermeasure question exists.
3. Generate a daily plan.
4. Confirm the plan contains ordered tasks, estimated minutes, and rationale.

Expected result: the plan fits the time budget and cites the selected assets.

## Scenario 3: Update Plan After Diagnosis

1. Submit a training answer and produce a diagnosis with missed scoring points
   and issue tags.
2. Recalculate the profile.
3. Generate a new daily plan.
4. Confirm weak abilities and issue tags change the task priority.

Expected result: the next plan responds to the user's actual performance.

## Suggested Verification Commands

```powershell
npm run test -- test/lib/shenlun/parser-output.test.ts test/lib/shenlun/import-assets.test.ts
npm run test -- test/lib/shenlun/learning-assets.test.ts test/lib/shenlun/learning-profile.test.ts test/lib/shenlun/learning-plan.test.ts
```

## UI Verification Notes

1. Open `/materials` and confirm the right-side pulse section shows the learning
   asset count after importing Shenlun material.
2. Open `/practice` and confirm the “今日训练” tab includes a personalized
   learning plan card with task rationale and time estimate.
3. Complete a practice diagnosis and confirm the profile/plan refreshes without
   leaving the current training flow.
