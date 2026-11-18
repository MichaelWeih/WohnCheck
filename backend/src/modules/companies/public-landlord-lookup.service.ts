import { Injectable, NotFoundException } from "@nestjs/common";
import { Landlord, RecordStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PublicLandlordLookupService } from "./company.types";

const MAX_HOPS = 5;

/**
 * The only way public endpoints turn a landlord id (or slug) from a URL into a record:
 * ACTIVE -> itself, MERGED -> the surviving record, anything else -> 404. Candidates never leak.
 */
@Injectable()
export class PublicLandlordLookupServiceImpl implements PublicLandlordLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(id: string): Promise<{ landlord: Landlord; redirectedFromId: string | null }> {
    const result = await this.tryResolve(id);
    if (!result) throw new NotFoundException("Vermieter nicht gefunden.");
    return result;
  }

  async tryResolve(id: string): Promise<{ landlord: Landlord; redirectedFromId: string | null } | null> {
    if (!id || id.length > 200) return null;
    let current = await this.prisma.landlord.findFirst({ where: { OR: [{ id }, { slug: id }] } });
    const requestedId = current?.id ?? null;
    for (let hop = 0; current && current.status === RecordStatus.MERGED && hop < MAX_HOPS; hop++) {
      current = current.mergedIntoId
        ? await this.prisma.landlord.findUnique({ where: { id: current.mergedIntoId } })
        : null;
    }
    if (!current || current.status !== RecordStatus.ACTIVE) return null;
    return { landlord: current, redirectedFromId: requestedId !== current.id ? requestedId : null };
  }
}
