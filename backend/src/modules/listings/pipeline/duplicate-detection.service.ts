import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  async findCandidates(params: {
    listingId?: string;
    city: string;
    street?: string | null;
    houseNumber?: string | null;
    livingAreaSqm?: number | null;
    rooms?: number | null;
    coldRent?: number | null;
  }) {
    const candidates = await this.prisma.listing.findMany({
      where: {
        id: params.listingId ? { not: params.listingId } : undefined,
        city: { equals: params.city, mode: "insensitive" },
        street: params.street ? { equals: params.street, mode: "insensitive" } : undefined,
      },
      take: 20,
    });

    return candidates
      .map((candidate) => {
        let confidence = 0;
        const reasons: string[] = [];

        if (params.street && candidate.street?.toLocaleLowerCase("de-DE") === params.street.toLocaleLowerCase("de-DE")) {
          confidence += 35;
          reasons.push("gleiche Straße");
        }
        if (params.houseNumber && candidate.houseNumber === params.houseNumber) {
          confidence += 20;
          reasons.push("gleiche Hausnummer");
        }
        if (params.livingAreaSqm && candidate.livingAreaSqm && Math.abs(Number(candidate.livingAreaSqm) - params.livingAreaSqm) <= 3) {
          confidence += 15;
          reasons.push("ähnliche Wohnfläche");
        }
        if (params.rooms && candidate.rooms && Math.abs(Number(candidate.rooms) - params.rooms) <= 0.5) {
          confidence += 10;
          reasons.push("ähnliche Zimmeranzahl");
        }
        if (params.coldRent && candidate.coldRent && Math.abs(Number(candidate.coldRent) - params.coldRent) <= 75) {
          confidence += 20;
          reasons.push("ähnliche Kaltmiete");
        }

        return { candidate, confidence, reasons };
      })
      .filter((result) => result.confidence >= 65)
      .sort((a, b) => b.confidence - a.confidence);
  }
}
