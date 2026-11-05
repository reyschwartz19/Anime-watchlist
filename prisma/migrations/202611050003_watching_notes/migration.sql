-- Owner-scoped, structured viewing notes. Existing feedback and dismissals survive.
ALTER TABLE "Feedback" ADD COLUMN "likedAspects" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "dislikedAspects" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "visualStyle" TEXT;
