import { Injectable } from "@nestjs/common";
import { DuplicateStatus, ImportJobStatus, ListingStatus, ReportStatus, ReviewStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScoresService } from "../scores/scores.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoresService: ScoresService,
  ) {}

  getModerationQueue() {
    return this.prisma.review.findMany({
      where: {
        OR: [
          { status: ReviewStatus.REPORTED },
          { status: ReviewStatus.PENDING },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
          },
        },
        reports: {
          where: { status: ReportStatus.PENDING },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async triggerScoreRecalculation(targetType: string, targetId: string) {
    return this.scoresService.recalculate(targetType, targetId);
  }

  async createImportJob(sourceKey: string) {
    return this.prisma.importJob.create({
      data: {
        sourceKey,
        status: ImportJobStatus.QUEUED,
      },
    });
  }

  approveListing(id: string) {
    return this.prisma.listing.update({
      where: { id },
      data: {
        status: ListingStatus.AVAILABLE,
        approvedAt: new Date(),
      },
    });
  }

  async mergeListing(id: string, duplicateId: string) {
    const duplicate = await this.prisma.duplicateCandidate.upsert({
      where: {
        listingId_possibleDuplicateId: {
          listingId: id,
          possibleDuplicateId: duplicateId,
        },
      },
      update: {
        status: DuplicateStatus.MERGED,
      },
      create: {
        listingId: id,
        possibleDuplicateId: duplicateId,
        confidence: 100,
        reasons: ["Manuell im Admin zusammengeführt"],
        status: DuplicateStatus.MERGED,
      },
    });

    await this.prisma.listing.update({
      where: { id: duplicateId },
      data: { status: ListingStatus.OFFLINE },
    });

    return duplicate;
  }
}
