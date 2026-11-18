import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NORMALIZATION_VERSION, addressKey, normalizeCompanyName, registrableDomain } from "./normalization";

const BATCH = 200;

/**
 * Brings stored search keys up to the current normalization rules before anything else uses them:
 * Landlord.normalizedName / legalForm / websiteDomain, LandlordAlias.normalizedName and Property.addressKey.
 * Runs on every start and only touches stale rows, so it is cheap after the first run.
 */
@Injectable()
export class NormalizationBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger("Normalization");

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    try {
      const result = await this.run();
      if (result.landlords || result.aliases || result.properties)
        this.logger.log(`Re-normalized ${result.landlords} landlords, ${result.aliases} aliases, ${result.properties} properties.`);
    } catch (error) {
      this.logger.error(`Normalization failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async run(): Promise<{ landlords: number; aliases: number; properties: number }> {
    let landlords = 0;
    let aliases = 0;
    let properties = 0;

    for (;;) {
      const rows = await this.prisma.landlord.findMany({
        where: { normalizationVersion: { lt: NORMALIZATION_VERSION } },
        select: { id: true, name: true, website: true, legalForm: true, websiteDomain: true },
        take: BATCH,
      });
      if (!rows.length) break;
      for (const row of rows) {
        const n = normalizeCompanyName(row.name);
        await this.prisma.landlord.update({
          where: { id: row.id },
          data: {
            normalizedName: n.normalized,
            legalForm: row.legalForm ?? n.legalForm,
            websiteDomain: row.websiteDomain ?? registrableDomain(row.website),
            normalizationVersion: NORMALIZATION_VERSION,
          },
        });
        const aliasRows = await this.prisma.landlordAlias.findMany({ where: { landlordId: row.id } });
        for (const alias of aliasRows) {
          const an = normalizeCompanyName(alias.name);
          if (an.normalized !== alias.normalizedName) {
            await this.prisma.landlordAlias.update({
              where: { id: alias.id },
              data: { normalizedName: an.normalized, legalForm: alias.legalForm ?? an.legalForm },
            });
            aliases++;
          }
        }
      }
      landlords += rows.length;
    }

    for (;;) {
      const rows = await this.prisma.property.findMany({
        where: { addressKey: null },
        select: { id: true, street: true, houseNumber: true, postalCode: true },
        take: BATCH,
      });
      if (!rows.length) break;
      for (const row of rows) {
        await this.prisma.property.update({ where: { id: row.id }, data: { addressKey: addressKey(row) ?? "" } });
      }
      properties += rows.length;
    }

    return { landlords, aliases, properties };
  }
}
