-- CreateEnum
CREATE TYPE "ExternalSourceType" AS ENUM ('GEODATA', 'COMPANY_DIRECTORY', 'REVIEW_SIGNAL', 'STATISTICS', 'REGISTRY');

-- CreateTable
CREATE TABLE "ExternalSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" "ExternalSourceType" NOT NULL,
    "baseUrl" TEXT,
    "termsUrl" TEXT,
    "license" TEXT NOT NULL,
    "attribution" TEXT,
    "refreshIntervalSeconds" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentifier" (
    "id" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "metadata" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCache" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "requestHash" TEXT,
    "payload" JSONB NOT NULL,
    "attribution" TEXT,
    "licenseSnapshot" TEXT NOT NULL,
    "metadata" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceEvidence" (
    "id" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "claimKey" TEXT NOT NULL,
    "claimValue" JSONB,
    "confidence" DECIMAL(5,2),
    "evidenceUrl" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "SourceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSource_key_key" ON "ExternalSource"("key");

-- CreateIndex
CREATE INDEX "ExternalIdentifier_targetType_targetId_idx" ON "ExternalIdentifier"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ExternalIdentifier_sourceKey_externalId_idx" ON "ExternalIdentifier"("sourceKey", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentifier_targetType_targetId_sourceKey_externalId_key" ON "ExternalIdentifier"("targetType", "targetId", "sourceKey", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceCache_cacheKey_key" ON "SourceCache"("cacheKey");

-- CreateIndex
CREATE INDEX "SourceCache_sourceKey_expiresAt_idx" ON "SourceCache"("sourceKey", "expiresAt");

-- CreateIndex
CREATE INDEX "SourceEvidence_targetType_targetId_idx" ON "SourceEvidence"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "SourceEvidence_sourceKey_claimKey_idx" ON "SourceEvidence"("sourceKey", "claimKey");

-- AddForeignKey
ALTER TABLE "ExternalIdentifier" ADD CONSTRAINT "ExternalIdentifier_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "ExternalSource"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceCache" ADD CONSTRAINT "SourceCache_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "ExternalSource"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceEvidence" ADD CONSTRAINT "SourceEvidence_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "ExternalSource"("key") ON DELETE CASCADE ON UPDATE CASCADE;
