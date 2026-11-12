-- Additive application-owned state only. No auth tables or user records change.
CREATE TABLE "RateLimitState" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RateLimitState_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitState_expiresAt_idx" ON "RateLimitState"("expiresAt");
