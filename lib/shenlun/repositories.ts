import { getItem, listItems, putItem } from "@/lib/storage/idb"
import { STORES } from "@/lib/storage/schema"
import type {
  AnswerKey,
  CalibrationReport,
  CalibrationSnapshot,
  ExamPaper,
  ExpressionAsset,
  ExpressionExercise,
  AbilityTag,
  LearningAssetProvenance,
  LearningPlan,
  LearningTask,
  MaterialPassage,
  QuestionBankImportBatch,
  QuestionBankItem,
  ScoringPoint,
  ShenlunDiagnosis,
  ShenlunDocument,
  TopicAsset,
  TrainingAnswer,
  TrainingQuestion,
  TrainingSession,
  UserLearningProfile,
} from "@/lib/shenlun/types"

export const shenlunRepository = {
  getDocuments: () => listItems<ShenlunDocument>(STORES.shenlunDocuments),
  getDocument: (id: string) => getItem<ShenlunDocument>(STORES.shenlunDocuments, id),
  saveDocument: (document: ShenlunDocument) => putItem(STORES.shenlunDocuments, document),

  getExamPapers: () => listItems<ExamPaper>(STORES.shenlunExamPapers),
  saveExamPaper: (paper: ExamPaper) => putItem(STORES.shenlunExamPapers, paper),

  getPassages: () => listItems<MaterialPassage>(STORES.shenlunMaterialPassages),
  savePassage: (passage: MaterialPassage) => putItem(STORES.shenlunMaterialPassages, passage),

  getQuestions: () => listItems<TrainingQuestion>(STORES.shenlunTrainingQuestions),
  saveQuestion: (question: TrainingQuestion) => putItem(STORES.shenlunTrainingQuestions, question),

  getAnswerKeys: () => listItems<AnswerKey>(STORES.shenlunAnswerKeys),
  saveAnswerKey: (answerKey: AnswerKey) => putItem(STORES.shenlunAnswerKeys, answerKey),

  getScoringPoints: () => listItems<ScoringPoint>(STORES.shenlunScoringPoints),
  saveScoringPoint: (point: ScoringPoint) => putItem(STORES.shenlunScoringPoints, point),

  getSessions: () => listItems<TrainingSession>(STORES.shenlunTrainingSessions),
  saveSession: (session: TrainingSession) => putItem(STORES.shenlunTrainingSessions, session),

  getAnswers: () => listItems<TrainingAnswer>(STORES.shenlunTrainingAnswers),
  saveAnswer: (answer: TrainingAnswer) => putItem(STORES.shenlunTrainingAnswers, answer),

  getDiagnoses: () => listItems<ShenlunDiagnosis>(STORES.shenlunDiagnoses),
  saveDiagnosis: (diagnosis: ShenlunDiagnosis) => putItem(STORES.shenlunDiagnoses, diagnosis),

  getCalibrationSnapshots: () => listItems<CalibrationSnapshot>(STORES.shenlunCalibrationSnapshots),
  saveCalibrationSnapshot: (snapshot: CalibrationSnapshot) => putItem(STORES.shenlunCalibrationSnapshots, snapshot),

  getExpressionAssets: () => listItems<ExpressionAsset>(STORES.shenlunExpressionAssets),
  saveExpressionAsset: (asset: ExpressionAsset) => putItem(STORES.shenlunExpressionAssets, asset),

  getExpressionExercises: () => listItems<ExpressionExercise>(STORES.shenlunExpressionExercises),
  saveExpressionExercise: (exercise: ExpressionExercise) => putItem(STORES.shenlunExpressionExercises, exercise),

  getCalibrationReports: () => listItems<CalibrationReport>(STORES.shenlunCalibrationReports),
  saveCalibrationReport: (report: CalibrationReport) => putItem(STORES.shenlunCalibrationReports, report),

  getLearningProvenance: () => listItems<LearningAssetProvenance>(STORES.shenlunLearningProvenance),
  saveLearningProvenance: (provenance: LearningAssetProvenance) => putItem(STORES.shenlunLearningProvenance, provenance),

  getAbilityTags: () => listItems<AbilityTag>(STORES.shenlunAbilityTags),
  saveAbilityTag: (tag: AbilityTag) => putItem(STORES.shenlunAbilityTags, tag),

  getTopicAssets: () => listItems<TopicAsset>(STORES.shenlunTopicAssets),
  saveTopicAsset: (asset: TopicAsset) => putItem(STORES.shenlunTopicAssets, asset),

  getLearningProfiles: () => listItems<UserLearningProfile>(STORES.shenlunLearningProfiles),
  saveLearningProfile: (profile: UserLearningProfile) => putItem(STORES.shenlunLearningProfiles, profile),

  getLearningTasks: () => listItems<LearningTask>(STORES.shenlunLearningTasks),
  saveLearningTask: (task: LearningTask) => putItem(STORES.shenlunLearningTasks, task),

  getLearningPlans: () => listItems<LearningPlan>(STORES.shenlunLearningPlans),
  saveLearningPlan: (plan: LearningPlan) => putItem(STORES.shenlunLearningPlans, plan),

  getQuestionBankItems: () => listItems<QuestionBankItem>(STORES.shenlunQuestionBankItems),
  saveQuestionBankItem: (item: QuestionBankItem) => putItem(STORES.shenlunQuestionBankItems, item),

  getQuestionBankImportBatches: () => listItems<QuestionBankImportBatch>(STORES.shenlunQuestionBankImportBatches),
  saveQuestionBankImportBatch: (batch: QuestionBankImportBatch) => putItem(STORES.shenlunQuestionBankImportBatches, batch),
}
