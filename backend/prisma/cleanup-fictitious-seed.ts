/**
 * One-time, idempotent clean-up of the fictitious demo landlords that earlier versions of prisma/seed.ts
 * created ("Mueller Hausverwaltung", "Schmidt und Partner Immobilien", "Berliner Wohnungsbau GmbH") and of the
 * unproven building assignments ("Kastanienallee 12 -> Vonovia" etc.).
 *
 * - Building -> landlord links without evidence are removed; the buildings keep their address and get no landlord.
 * - The fictitious landlords are deleted together with the reviews written about them.
 * - Real companies (e.g. Vonovia SE) and reviews about buildings / neighbourhoods are kept.
 *
 * Run: npx ts-node prisma/cleanup-fictitious-seed.ts
 */
import { PrismaClient, TargetType } from "@prisma/client";

const FICTITIOUS_LANDLORD_IDS = ["l2", "l3", "l4"];
/** PropertyParty rows the 15.11.2026 migration backfilled from the demo seed (source "legacy"). */
const LEGACY_SOURCE = "legacy";

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const parties = await tx.propertyParty.deleteMany({ where: { source: LEGACY_SOURCE } });
      // The seed's building assignments were invented; no building keeps a landlord without evidence.
      const properties = await tx.property.updateMany({
        where: { id: { in: ["p1", "p2", "p3", "p4"] }, landlordId: { not: null } },
        data: { landlordId: null },
      });
      const users = await tx.user.updateMany({
        where: { landlordId: { in: FICTITIOUS_LANDLORD_IDS } },
        data: { landlordId: null },
      });
      const reviews = await tx.review.deleteMany({
        where: { targetType: TargetType.LANDLORD, targetId: { in: FICTITIOUS_LANDLORD_IDS } },
      });
      const snapshots = await tx.publicSourceSnapshot.deleteMany({
        where: { targetType: TargetType.LANDLORD, targetId: { in: FICTITIOUS_LANDLORD_IDS } },
      });
      const scores = await tx.scoreResult.deleteMany({
        where: { targetType: TargetType.LANDLORD, targetId: { in: FICTITIOUS_LANDLORD_IDS } },
      });
      const landlords = await tx.landlord.deleteMany({ where: { id: { in: FICTITIOUS_LANDLORD_IDS } } });
      return {
        removedPropertyParties: parties.count,
        propertiesWithoutLandlord: properties.count,
        usersUnlinked: users.count,
        removedReviews: reviews.count,
        removedSnapshots: snapshots.count,
        removedScores: scores.count,
        removedLandlords: landlords.count,
      };
    });
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
