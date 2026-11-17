-- Landlord directory: identity model, provenance, external references, job queue, discovery, topics.
-- Hand-edited parts are marked "MANUAL". Prisma does not diff extensions or CHECK constraints,
-- so these cause no drift in later `prisma migrate dev` runs.

-- MANUAL: trigram indexes below need pg_trgm (trusted extension since PostgreSQL 13).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "CompanyKind" AS ENUM ('HOUSING_COMPANY', 'MUNICIPAL_HOUSING', 'COOPERATIVE', 'PROPERTY_MANAGER', 'REAL_ESTATE_COMPANY', 'PRIVATE_LANDLORD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'CANDIDATE', 'MERGED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "LandlordRelevance" AS ENUM ('CONFIRMED', 'LIKELY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('OPERATING', 'DISSOLVED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'AUTO_VERIFIED', 'MANUALLY_VERIFIED');

-- CreateEnum
CREATE TYPE "AliasType" AS ENUM ('LEGAL_NAME', 'BRAND', 'FORMER_NAME', 'SHORT_NAME', 'SPELLING');

-- CreateEnum
CREATE TYPE "IdentifierScheme" AS ENUM ('LEI', 'WIKIDATA', 'GERMAN_REGISTER');

-- CreateEnum
CREATE TYPE "CompanyRelationType" AS ENUM ('PARENT_OF', 'MANAGES_FOR', 'SUCCESSOR_OF');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('HEADQUARTERS', 'BRANCH');

-- CreateEnum
CREATE TYPE "PropertyRole" AS ENUM ('OWNER', 'LANDLORD', 'MANAGER');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('CONFIRMED', 'PROBABLE', 'UNVERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExternalReferenceType" AS ENUM ('PROFILE', 'DISCUSSION');

-- CreateEnum
CREATE TYPE "MergeCandidateStatus" AS ENUM ('PENDING', 'MERGED', 'DISTINCT');

-- CreateEnum
CREATE TYPE "MappingReportKind" AS ENUM ('WRONG_EXTERNAL_LINK', 'WRONG_COMPANY_DATA', 'DUPLICATE', 'WRONG_RELATION', 'REMOVAL_REQUEST', 'REVIEW_COMPLAINT', 'OTHER');

-- CreateEnum
CREATE TYPE "MappingReportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReporterRole" AS ENUM ('TENANT', 'COMPANY_REPRESENTATIVE', 'AFFECTED_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'DEAD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscoveryQueryStatus" AS ENUM ('PENDING', 'RUNNING', 'FOUND', 'NEEDS_REVIEW', 'NOT_FOUND', 'FAILED');

-- CreateEnum
CREATE TYPE "TopicStatementType" AS ENUM ('EXPERIENCE', 'FACT_CLAIM', 'ALLEGATION');

-- DropForeignKey
ALTER TABLE "Property" DROP CONSTRAINT "Property_landlordId_fkey";

-- AlterTable
ALTER TABLE "Landlord" ADD COLUMN     "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "fieldSources" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "kind" "CompanyKind" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "lastRefreshedAt" TIMESTAMP(3),
ADD COLUMN     "legalForm" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "normalizationVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "normalizedName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "operatingStates" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "relevance" "LandlordRelevance" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "state" TEXT,
ADD COLUMN     "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "websiteDomain" TEXT,
ALTER COLUMN "city" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "topicsAnalyzedAt" TIMESTAMP(3),
ADD COLUMN     "topicsAnalyzer" TEXT;

-- CreateTable
CREATE TABLE "LandlordAlias" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "legalForm" TEXT,
    "type" "AliasType" NOT NULL DEFAULT 'SPELLING',
    "source" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandlordAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandlordIdentifier" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "scheme" "IdentifierScheme" NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandlordIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyRelation" (
    "id" TEXT NOT NULL,
    "fromLandlordId" TEXT NOT NULL,
    "toLandlordId" TEXT NOT NULL,
    "type" "CompanyRelationType" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingRelation" (
    "id" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "type" "CompanyRelationType" NOT NULL,
    "direction" TEXT NOT NULL,
    "otherScheme" "IdentifierScheme",
    "otherValue" TEXT,
    "otherSourceKey" TEXT,
    "otherExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandlordLocation" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'BRANCH',
    "name" TEXT,
    "street" TEXT,
    "houseNumber" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "state" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "addressKey" TEXT,
    "source" TEXT NOT NULL,
    "externalRef" TEXT,
    "sourceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandlordLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyParty" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "role" "PropertyRole" NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "license" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "changes" JSONB,
    "sourceKey" TEXT,
    "actorUserId" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeCandidate" (
    "id" TEXT NOT NULL,
    "landlordAId" TEXT NOT NULL,
    "landlordBId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "status" "MergeCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MergeCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandlordMerge" (
    "id" TEXT NOT NULL,
    "survivorId" TEXT NOT NULL,
    "loserId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneByUserId" TEXT,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "LandlordMerge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoverySuppression" (
    "id" TEXT NOT NULL,
    "keyType" TEXT NOT NULL,
    "keyValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "mappingReportId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoverySuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalReference" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "locationId" TEXT,
    "platform" TEXT NOT NULL,
    "type" "ExternalReferenceType" NOT NULL DEFAULT 'PROFILE',
    "externalId" TEXT,
    "url" TEXT NOT NULL,
    "label" VARCHAR(80),
    "internalNote" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "origin" TEXT NOT NULL,
    "evidence" JSONB,
    "sourceRecordId" TEXT,
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "recheckDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MappingReport" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT,
    "externalReferenceId" TEXT,
    "reviewId" TEXT,
    "kind" "MappingReportKind" NOT NULL,
    "reporterRole" "ReporterRole" NOT NULL DEFAULT 'OTHER',
    "message" VARCHAR(2000) NOT NULL,
    "contactEmail" TEXT,
    "reporterUserId" TEXT,
    "status" "MappingReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "personalDataClearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MappingReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT,
    "activeDedupeKey" TEXT,
    "rerunRequested" BOOLEAN NOT NULL DEFAULT false,
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMPTZ(3),
    "lockExpiresAt" TIMESTAMPTZ(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "progress" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSchedule" (
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "network" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastEnqueuedAt" TIMESTAMPTZ(3),
    "nextRunAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobSchedule_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SourceSyncState" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'default',
    "mode" TEXT NOT NULL DEFAULT 'FULL',
    "fullSyncRequested" BOOLEAN NOT NULL DEFAULT false,
    "cursor" JSONB,
    "watermark" JSONB,
    "runStartedAt" TIMESTAMPTZ(3),
    "lastFullSyncAt" TIMESTAMPTZ(3),
    "lastRunAt" TIMESTAMPTZ(3),
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "recordsSeen" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SourceSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundHostState" (
    "host" TEXT NOT NULL,
    "nextAllowedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMPTZ(3),
    "day" TEXT,
    "requestsToday" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutboundHostState_pkey" PRIMARY KEY ("host")
);

-- CreateTable
CREATE TABLE "DiscoveryQuery" (
    "id" TEXT NOT NULL,
    "queryHash" TEXT NOT NULL,
    "normalizedQuery" VARCHAR(120),
    "status" "DiscoveryQueryStatus" NOT NULL DEFAULT 'PENDING',
    "jobId" TEXT,
    "resultLandlordIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "firstRequestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRequestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "retryAfter" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DiscoveryQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTopicTag" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "statementType" "TopicStatementType" NOT NULL,
    "evidence" TEXT NOT NULL,
    "analyzer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewTopicTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandlordAlias_landlordId_normalizedName_idx" ON "LandlordAlias"("landlordId", "normalizedName");

-- CreateIndex
CREATE INDEX "LandlordAlias_normalizedName_idx" ON "LandlordAlias" USING GIN ("normalizedName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "LandlordAlias_sourceRecordId_idx" ON "LandlordAlias"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "LandlordAlias_landlordId_name_key" ON "LandlordAlias"("landlordId", "name");

-- CreateIndex
CREATE INDEX "LandlordIdentifier_landlordId_idx" ON "LandlordIdentifier"("landlordId");

-- CreateIndex
CREATE INDEX "LandlordIdentifier_sourceRecordId_idx" ON "LandlordIdentifier"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "LandlordIdentifier_scheme_value_key" ON "LandlordIdentifier"("scheme", "value");

-- CreateIndex
CREATE INDEX "CompanyRelation_toLandlordId_idx" ON "CompanyRelation"("toLandlordId");

-- CreateIndex
CREATE INDEX "CompanyRelation_sourceRecordId_idx" ON "CompanyRelation"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRelation_fromLandlordId_toLandlordId_type_key" ON "CompanyRelation"("fromLandlordId", "toLandlordId", "type");

-- CreateIndex
CREATE INDEX "PendingRelation_otherScheme_otherValue_idx" ON "PendingRelation"("otherScheme", "otherValue");

-- CreateIndex
CREATE INDEX "PendingRelation_otherSourceKey_otherExternalId_idx" ON "PendingRelation"("otherSourceKey", "otherExternalId");

-- CreateIndex
CREATE INDEX "PendingRelation_sourceRecordId_idx" ON "PendingRelation"("sourceRecordId");

-- CreateIndex
CREATE INDEX "LandlordLocation_landlordId_addressKey_idx" ON "LandlordLocation"("landlordId", "addressKey");

-- CreateIndex
CREATE INDEX "LandlordLocation_sourceRecordId_idx" ON "LandlordLocation"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "LandlordLocation_source_externalRef_key" ON "LandlordLocation"("source", "externalRef");

-- CreateIndex
CREATE INDEX "PropertyParty_landlordId_idx" ON "PropertyParty"("landlordId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyParty_propertyId_landlordId_role_key" ON "PropertyParty"("propertyId", "landlordId", "role");

-- CreateIndex
CREATE INDEX "SourceRecord_landlordId_idx" ON "SourceRecord"("landlordId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceRecord_sourceKey_externalId_key" ON "SourceRecord"("sourceKey", "externalId");

-- CreateIndex
CREATE INDEX "ChangeLog_landlordId_createdAt_idx" ON "ChangeLog"("landlordId", "createdAt");

-- CreateIndex
CREATE INDEX "MergeCandidate_status_idx" ON "MergeCandidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MergeCandidate_landlordAId_landlordBId_key" ON "MergeCandidate"("landlordAId", "landlordBId");

-- CreateIndex
CREATE INDEX "LandlordMerge_survivorId_idx" ON "LandlordMerge"("survivorId");

-- CreateIndex
CREATE INDEX "LandlordMerge_loserId_idx" ON "LandlordMerge"("loserId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoverySuppression_keyType_keyValue_key" ON "DiscoverySuppression"("keyType", "keyValue");

-- CreateIndex
CREATE INDEX "ExternalReference_platform_externalId_idx" ON "ExternalReference"("platform", "externalId");

-- CreateIndex
CREATE INDEX "ExternalReference_landlordId_matchStatus_idx" ON "ExternalReference"("landlordId", "matchStatus");

-- CreateIndex
CREATE INDEX "ExternalReference_sourceRecordId_idx" ON "ExternalReference"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalReference_landlordId_platform_url_key" ON "ExternalReference"("landlordId", "platform", "url");

-- CreateIndex
CREATE INDEX "MappingReport_status_createdAt_idx" ON "MappingReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_activeDedupeKey_key" ON "BackgroundJob"("activeDedupeKey");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_runAt_idx" ON "BackgroundJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_lockExpiresAt_idx" ON "BackgroundJob"("status", "lockExpiresAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_type_status_idx" ON "BackgroundJob"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSyncState_sourceKey_scope_key" ON "SourceSyncState"("sourceKey", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryQuery_queryHash_key" ON "DiscoveryQuery"("queryHash");

-- CreateIndex
CREATE INDEX "DiscoveryQuery_expiresAt_idx" ON "DiscoveryQuery"("expiresAt");

-- CreateIndex
CREATE INDEX "DiscoveryQuery_status_startedAt_idx" ON "DiscoveryQuery"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ReviewTopicTag_topic_idx" ON "ReviewTopicTag"("topic");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTopicTag_reviewId_topic_analyzer_key" ON "ReviewTopicTag"("reviewId", "topic", "analyzer");

-- CreateIndex
CREATE INDEX "Landlord_normalizedName_idx" ON "Landlord" USING GIN ("normalizedName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Landlord_status_kind_idx" ON "Landlord"("status", "kind");

-- CreateIndex
CREATE INDEX "Landlord_state_idx" ON "Landlord"("state");

-- CreateIndex
CREATE INDEX "Landlord_websiteDomain_idx" ON "Landlord"("websiteDomain");

-- CreateIndex
CREATE INDEX "Landlord_operatingStates_idx" ON "Landlord" USING GIN ("operatingStates");

-- AddForeignKey
ALTER TABLE "Landlord" ADD CONSTRAINT "Landlord_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Landlord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandlordAlias" ADD CONSTRAINT "LandlordAlias_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandlordAlias" ADD CONSTRAINT "LandlordAlias_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandlordIdentifier" ADD CONSTRAINT "LandlordIdentifier_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandlordIdentifier" ADD CONSTRAINT "LandlordIdentifier_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyRelation" ADD CONSTRAINT "CompanyRelation_fromLandlordId_fkey" FOREIGN KEY ("fromLandlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyRelation" ADD CONSTRAINT "CompanyRelation_toLandlordId_fkey" FOREIGN KEY ("toLandlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyRelation" ADD CONSTRAINT "CompanyRelation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingRelation" ADD CONSTRAINT "PendingRelation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandlordLocation" ADD CONSTRAINT "LandlordLocation_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandlordLocation" ADD CONSTRAINT "LandlordLocation_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyParty" ADD CONSTRAINT "PropertyParty_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyParty" ADD CONSTRAINT "PropertyParty_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeLog" ADD CONSTRAINT "ChangeLog_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeCandidate" ADD CONSTRAINT "MergeCandidate_landlordAId_fkey" FOREIGN KEY ("landlordAId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeCandidate" ADD CONSTRAINT "MergeCandidate_landlordBId_fkey" FOREIGN KEY ("landlordBId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandlordMerge" ADD CONSTRAINT "LandlordMerge_survivorId_fkey" FOREIGN KEY ("survivorId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandlordMerge" ADD CONSTRAINT "LandlordMerge_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "LandlordLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalReference" ADD CONSTRAINT "ExternalReference_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MappingReport" ADD CONSTRAINT "MappingReport_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MappingReport" ADD CONSTRAINT "MappingReport_externalReferenceId_fkey" FOREIGN KEY ("externalReferenceId") REFERENCES "ExternalReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MappingReport" ADD CONSTRAINT "MappingReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MappingReport" ADD CONSTRAINT "MappingReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTopicTag" ADD CONSTRAINT "ReviewTopicTag_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MANUAL: backfill of pre-existing landlord rows ---------------------------------------------------
-- Map the legacy free-text companyType to the new enum; unknown texts stay UNKNOWN (never guessed).
UPDATE "Landlord" SET "kind" = (CASE lower(trim("companyType"))
    WHEN 'wohnungsgesellschaft' THEN 'HOUSING_COMPANY'
    WHEN 'wohnungsunternehmen' THEN 'HOUSING_COMPANY'
    WHEN 'kommunale wohnungsgesellschaft' THEN 'MUNICIPAL_HOUSING'
    WHEN 'wohnungsgenossenschaft' THEN 'COOPERATIVE'
    WHEN 'genossenschaft' THEN 'COOPERATIVE'
    WHEN 'hausverwaltung' THEN 'PROPERTY_MANAGER'
    WHEN 'immobilienverwaltung' THEN 'PROPERTY_MANAGER'
    WHEN 'immobilienunternehmen' THEN 'REAL_ESTATE_COMPANY'
    WHEN 'privatvermieter' THEN 'PRIVATE_LANDLORD'
    ELSE 'UNKNOWN' END)::"CompanyKind";

-- Rows that existed before discovery were entered deliberately: they are landlords by definition.
UPDATE "Landlord" SET "relevance" = 'CONFIRMED';

-- normalizedName / legalForm / websiteDomain are computed in TypeScript (companies/normalization.ts):
-- rows keep normalizationVersion = 0 and are normalised at application start, before any discovery runs.

-- Every existing property gets its primary landlord as explicit LANDLORD party.
INSERT INTO "PropertyParty" ("id", "propertyId", "landlordId", "role", "source", "confidence", "createdAt")
SELECT 'legacy_' || p."id", p."id", p."landlordId", 'LANDLORD'::"PropertyRole", 'legacy', 1, CURRENT_TIMESTAMP
FROM "Property" p;

-- MANUAL: invariants Prisma cannot express ----------------------------------------------------------
-- A duplicate pair is stored exactly once, ordered by id (byte order, same as JavaScript string comparison for our ids).
ALTER TABLE "MergeCandidate" ADD CONSTRAINT "MergeCandidate_order_chk"
    CHECK ("landlordAId" COLLATE "C" < "landlordBId" COLLATE "C");

-- A finished job never holds its dedupe key.
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_dedupe_chk"
    CHECK ("status" IN ('QUEUED', 'RUNNING') OR "activeDedupeKey" IS NULL);
