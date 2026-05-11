-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('MUNICIPAL', 'COOPERATIVE', 'NON_PROFIT', 'PRIVATE_COMPANY', 'PROPERTY_MANAGER', 'AGENCY', 'INSTITUTIONAL', 'PRIVATE_INDIVIDUAL', 'PARTNER_FEED', 'MANUAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OFFLINE', 'UNKNOWN', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ListingSourceMethod" AS ENUM ('CSV_IMPORT', 'JSON_IMPORT', 'MANUAL_ENTRY', 'PARTNER_API', 'PARTNER_FEED', 'PUBLIC_STRUCTURED_DATA');

-- CreateEnum
CREATE TYPE "GeoAccuracy" AS ENUM ('EXACT', 'STREET', 'POSTAL_CODE', 'DISTRICT', 'HIDDEN');

-- CreateEnum
CREATE TYPE "LegalUseStatus" AS ENUM ('ALLOWED', 'PARTNER', 'MANUAL', 'NEEDS_REVIEW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('OPEN', 'MERGED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Landlord" ADD COLUMN "landlordType" "ProviderKind" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "normalizedName" TEXT;

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postalCode" TEXT,
    "slug" TEXT NOT NULL,
    "centroidLat" DECIMAL(10,7),
    "centroidLon" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistrictRentPrice" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'rent_cold',
    "valuePerSqm" DECIMAL(8,2) NOT NULL,
    "p25" DECIMAL(8,2),
    "p75" DECIMAL(8,2),
    "sampleSize" INTEGER,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "periodLabel" TEXT NOT NULL,
    "quality" TEXT NOT NULL DEFAULT 'derived',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistrictRentPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandlordProfile" (
    "id" TEXT NOT NULL,
    "landlordId" TEXT NOT NULL,
    "knownListingsCount" INTEGER NOT NULL DEFAULT 0,
    "activeListingsCount" INTEGER NOT NULL DEFAULT 0,
    "averagePricePerSqm" DECIMAL(8,2),
    "activeDistricts" JSONB,
    "dataQualityScore" INTEGER NOT NULL DEFAULT 0,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandlordProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceProvider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerKind" "ProviderKind" NOT NULL DEFAULT 'UNKNOWN',
    "method" "ListingSourceMethod" NOT NULL,
    "baseUrl" TEXT,
    "termsUrl" TEXT,
    "robotsStatus" TEXT NOT NULL DEFAULT 'not_checked',
    "termsStatus" TEXT NOT NULL DEFAULT 'not_checked',
    "legalUseStatus" "LegalUseStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "refreshIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceQualityScore" (
    "id" TEXT NOT NULL,
    "sourceProviderId" TEXT NOT NULL,
    "freshnessScore" INTEGER NOT NULL DEFAULT 0,
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "legalScore" INTEGER NOT NULL DEFAULT 0,
    "structureScore" INTEGER NOT NULL DEFAULT 0,
    "reliabilityScore" INTEGER NOT NULL DEFAULT 0,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceQualityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "street" TEXT,
    "houseNumber" TEXT,
    "postalCode" TEXT,
    "city" TEXT NOT NULL,
    "districtName" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geoAccuracy" "GeoAccuracy" NOT NULL DEFAULT 'DISTRICT',
    "livingAreaSqm" DECIMAL(8,2),
    "rooms" DECIMAL(4,1),
    "coldRent" DECIMAL(10,2),
    "warmRent" DECIMAL(10,2),
    "pricePerSqm" DECIMAL(8,2),
    "availableFrom" TIMESTAMP(3),
    "status" "ListingStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "landlordId" TEXT,
    "districtId" TEXT,
    "sourceProviderId" TEXT,
    "sourceUrl" TEXT,
    "externalId" TEXT,
    "legalUseStatus" "LegalUseStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "dataQualityScore" INTEGER NOT NULL DEFAULT 0,
    "duplicateRiskScore" INTEGER NOT NULL DEFAULT 0,
    "priceDeviationPercent" DECIMAL(6,2),
    "scorePreview" INTEGER,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingSource" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sourceProviderId" TEXT,
    "method" "ListingSourceMethod" NOT NULL,
    "sourceUrl" TEXT,
    "externalId" TEXT,
    "payload" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "legalUseStatus" "LegalUseStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',

    CONSTRAINT "ListingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "possibleDuplicateId" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reasons" JSONB,
    "status" "DuplicateStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "District_slug_key" ON "District"("slug");

-- CreateIndex
CREATE INDEX "District_city_name_idx" ON "District"("city", "name");

-- CreateIndex
CREATE INDEX "District_postalCode_idx" ON "District"("postalCode");

-- CreateIndex
CREATE INDEX "DistrictRentPrice_districtId_metric_idx" ON "DistrictRentPrice"("districtId", "metric");

-- CreateIndex
CREATE INDEX "DistrictRentPrice_sourceKey_idx" ON "DistrictRentPrice"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "LandlordProfile_landlordId_key" ON "LandlordProfile"("landlordId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceProvider_key_key" ON "SourceProvider"("key");

-- CreateIndex
CREATE INDEX "SourceProvider_providerKind_idx" ON "SourceProvider"("providerKind");

-- CreateIndex
CREATE INDEX "SourceProvider_legalUseStatus_idx" ON "SourceProvider"("legalUseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SourceQualityScore_sourceProviderId_key" ON "SourceQualityScore"("sourceProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_canonicalKey_key" ON "Listing"("canonicalKey");

-- CreateIndex
CREATE INDEX "Listing_status_city_idx" ON "Listing"("status", "city");

-- CreateIndex
CREATE INDEX "Listing_latitude_longitude_idx" ON "Listing"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Listing_landlordId_idx" ON "Listing"("landlordId");

-- CreateIndex
CREATE INDEX "Listing_districtId_idx" ON "Listing"("districtId");

-- CreateIndex
CREATE INDEX "Listing_sourceProviderId_idx" ON "Listing"("sourceProviderId");

-- CreateIndex
CREATE INDEX "ListingSource_listingId_idx" ON "ListingSource"("listingId");

-- CreateIndex
CREATE INDEX "ListingSource_sourceProviderId_idx" ON "ListingSource"("sourceProviderId");

-- CreateIndex
CREATE INDEX "ListingSource_externalId_idx" ON "ListingSource"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateCandidate_listingId_possibleDuplicateId_key" ON "DuplicateCandidate"("listingId", "possibleDuplicateId");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_status_confidence_idx" ON "DuplicateCandidate"("status", "confidence");

-- AddForeignKey
ALTER TABLE "DistrictRentPrice" ADD CONSTRAINT "DistrictRentPrice_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandlordProfile" ADD CONSTRAINT "LandlordProfile_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceQualityScore" ADD CONSTRAINT "SourceQualityScore_sourceProviderId_fkey" FOREIGN KEY ("sourceProviderId") REFERENCES "SourceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "Landlord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sourceProviderId_fkey" FOREIGN KEY ("sourceProviderId") REFERENCES "SourceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSource" ADD CONSTRAINT "ListingSource_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSource" ADD CONSTRAINT "ListingSource_sourceProviderId_fkey" FOREIGN KEY ("sourceProviderId") REFERENCES "SourceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_possibleDuplicateId_fkey" FOREIGN KEY ("possibleDuplicateId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
