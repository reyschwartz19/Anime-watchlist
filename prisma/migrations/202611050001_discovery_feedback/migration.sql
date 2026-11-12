-- Additive application-only migration. Never alters managed neon_auth or legacy fields.
ALTER TABLE "Feedback" ALTER COLUMN "value" DROP NOT NULL;
ALTER TABLE "Feedback" ADD COLUMN "reason" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "dismissal" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "dismissalReason" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "title" TEXT;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_dismissal_check" CHECK ("dismissal" IS NULL OR "dismissal" IN ('not_interested', 'strong_dismiss'));
CREATE TABLE "RecommendationBatch" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('new', 'list')),
  "request" TEXT NOT NULL,
  "constraints" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "picks" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecommendationBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecommendationBatch_userId_createdAt_idx" ON "RecommendationBatch"("userId", "createdAt");
CREATE TABLE "RecommendationEvent" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "animeId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "position" INTEGER,
  "reason" TEXT,
  "previousLibrary" JSONB,
  "previousFeedback" JSONB,
  "undoTokenHash" TEXT,
  "undoneAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RecommendationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecommendationEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RecommendationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecommendationEvent_userId_batchId_animeId_idx" ON "RecommendationEvent"("userId", "batchId", "animeId");
