import { Injectable } from "@nestjs/common";
import { ImportJobStatus, ReportStatus, ReviewStatus } from "@prisma/client";
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
}
