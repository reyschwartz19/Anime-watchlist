CREATE TYPE "LibraryStatus" AS ENUM ('watching', 'completed', 'plan_to_watch', 'dropped');
CREATE TYPE "FeedbackValue" AS ENUM ('like', 'dislike');

CREATE TABLE "AppUser" (
  "id" UUID NOT NULL,
  "authProviderId" TEXT NOT NULL,
  "email" TEXT,
  "displayName" TEXT,
  "photoURL" TEXT,
  "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "favoriteAnimes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "onboarded" BOOLEAN NOT NULL DEFAULT false,
  "profileEditedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppUser_authProviderId_key" ON "AppUser"("authProviderId");

CREATE TABLE "LibraryEntry" (
  "userId" UUID NOT NULL,
  "animeId" INTEGER NOT NULL CHECK ("animeId" > 0),
  "status" "LibraryStatus" NOT NULL,
  "anime" JSONB NOT NULL,
  "addedAt" TIMESTAMPTZ(3),
  "editedAt" TIMESTAMPTZ(3),
  "deletedAt" TIMESTAMPTZ(3),
  "legacyRaw" JSONB,
  "legacyProgress" JSONB,
  "importSourceDigest" TEXT,
  CONSTRAINT "LibraryEntry_pkey" PRIMARY KEY ("userId", "animeId"),
  CONSTRAINT "LibraryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LibraryEntry_userId_deletedAt_status_idx" ON "LibraryEntry"("userId", "deletedAt", "status");

CREATE TABLE "Feedback" (
  "userId" UUID NOT NULL,
  "animeId" INTEGER NOT NULL CHECK ("animeId" > 0),
  "value" "FeedbackValue" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Feedback_pkey" PRIMARY KEY ("userId", "animeId"),
  CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MigrationBinding" (
  "id" UUID NOT NULL,
  "sourceUid" TEXT NOT NULL,
  "sourceProjectId" TEXT NOT NULL,
  "sourcePath" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MigrationBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MigrationBinding_sourceUid_key" ON "MigrationBinding"("sourceUid");
CREATE UNIQUE INDEX "MigrationBinding_userId_key" ON "MigrationBinding"("userId");

CREATE TABLE "MigrationSnapshot" (
  "bindingId" UUID NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "sourceDocument" JSONB NOT NULL,
  "report" JSONB NOT NULL,
  "exportedAt" TIMESTAMPTZ(3) NOT NULL,
  "sourceReadTime" JSONB,
  "sourceUpdateTime" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationSnapshot_pkey" PRIMARY KEY ("bindingId", "sourceDigest"),
  CONSTRAINT "MigrationSnapshot_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "MigrationBinding"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
