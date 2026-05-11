import { Injectable } from "@nestjs/common";
import { ProviderKind } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class LandlordResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveByName(name?: string | null, city?: string | null, providerKind: ProviderKind = ProviderKind.UNKNOWN) {
    if (!name) return null;

    const normalizedName = this.normalizeName(name);
    const existing = await this.prisma.landlord.findFirst({
      where: {
        OR: [
          { normalizedName },
          { name: { equals: name, mode: "insensitive" } },
        ],
      },
    });

    if (existing) return existing;

    return this.prisma.landlord.create({
      data: {
        name,
        normalizedName,
        companyType: this.providerKindLabel(providerKind),
        landlordType: providerKind,
        city: city ?? "Unbekannt",
        slug: `${normalizedName}-${city ?? "unbekannt"}`.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      },
    });
  }

  private normalizeName(value: string) {
    return value
      .toLocaleLowerCase("de-DE")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private providerKindLabel(providerKind: ProviderKind) {
    const labels: Record<ProviderKind, string> = {
      MUNICIPAL: "Kommunale Wohnungsgesellschaft",
      COOPERATIVE: "Genossenschaft",
      NON_PROFIT: "Gemeinnütziger Wohnungsanbieter",
      PRIVATE_COMPANY: "Private Wohnungsgesellschaft",
      PROPERTY_MANAGER: "Hausverwaltung",
      AGENCY: "Makler",
      INSTITUTIONAL: "Institutioneller Vermieter",
      PRIVATE_INDIVIDUAL: "Privater Vermieter",
      PARTNER_FEED: "Partneranbieter",
      MANUAL: "Manuell erfasster Anbieter",
      UNKNOWN: "Vermieter",
    };

    return labels[providerKind];
  }
}
