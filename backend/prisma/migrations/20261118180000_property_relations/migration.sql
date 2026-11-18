-- Property relations with trust state and validity, address reports, review protection.

-- CreateEnum
CREATE TYPE "PartyVerificationStatus" AS ENUM ('VERIFIED', 'REPORTED', 'UNCLEAR', 'HISTORIC');
CREATE TYPE "TenancyVerification" AS ENUM ('NONE', 'PENDING', 'VERIFIED');

-- AlterEnum
ALTER TYPE "MappingReportKind" ADD VALUE 'PROPERTY_ASSIGNMENT';

-- Property: the landlord is optional (unknown is a valid state); normalized address key for the lookup.
ALTER TABLE "Property" ALTER COLUMN "landlordId" DROP NOT NULL,
ADD COLUMN "addressKey" TEXT;
CREATE INDEX "Property_addressKey_idx" ON "Property"("addressKey");

-- PropertyParty: trust state, validity and evidence. Existing rows were never checked, so they become UNCLEAR.
ALTER TABLE "PropertyParty" ADD COLUMN "verificationStatus" "PartyVerificationStatus" NOT NULL DEFAULT 'UNCLEAR',
ADD COLUMN "validFrom" TIMESTAMPTZ(3),
ADD COLUMN "validTo" TIMESTAMPTZ(3),
ADD COLUMN "lastCheckedAt" TIMESTAMPTZ(3),
ADD COLUMN "evidenceRef" TEXT,
ADD COLUMN "unitLabel" TEXT,
ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "PropertyParty_propertyId_verificationStatus_idx" ON "PropertyParty"("propertyId", "verificationStatus");

-- MappingReport: address reports.
ALTER TABLE "MappingReport" ADD COLUMN "propertyId" TEXT,
ADD COLUMN "street" TEXT,
ADD COLUMN "houseNumber" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "addressKey" TEXT,
ADD COLUMN "reportedRole" "PropertyRole",
ADD COLUMN "reportedOrganization" VARCHAR(200),
ADD COLUMN "privateLandlord" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "evidenceUrl" VARCHAR(500);
ALTER TABLE "MappingReport" ADD CONSTRAINT "MappingReport_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MappingReport_addressKey_status_idx" ON "MappingReport"("addressKey", "status");

-- Review: tenancy proof state; at most one non-rejected review per user and target.
ALTER TABLE "Review" ADD COLUMN "tenancyVerification" "TenancyVerification" NOT NULL DEFAULT 'NONE';
CREATE UNIQUE INDEX "Review_one_active_per_user_target" ON "Review"("userId", "targetType", "targetId") WHERE "status" <> 'REJECTED';
