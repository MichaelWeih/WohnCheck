import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { MergeCandidateStatus, UserRole } from "@prisma/client";
import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Request } from "express";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthUser } from "../auth/interfaces/auth-user.interface";
import { JobQueueService } from "../jobs/job.types";
import { PrismaService } from "../prisma/prisma.service";
import { CompanyMergeServiceImpl } from "./company-merge.service";
import { COMPANY_JOBS } from "./company.types";

type AuthRequest = Request & { user?: AuthUser };

class CandidateListQuery {
  @IsOptional() @IsEnum(MergeCandidateStatus) status?: MergeCandidateStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

class MergeDto {
  @IsString() @MaxLength(200) survivorId!: string;
  @IsOptional() @IsBoolean() force?: boolean;
}

const LANDLORD_BRIEF = {
  select: {
    id: true, name: true, legalName: true, legalForm: true, city: true, postalCode: true, website: true, status: true, kind: true,
    identifiers: { select: { scheme: true, value: true } },
    sourceRecords: { select: { sourceKey: true, externalId: true, url: true } },
  },
} as const;

/** Duplicate review queue (role ADMIN). Nothing here runs automatically. */
@Controller("admin/companies")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCompaniesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merges: CompanyMergeServiceImpl,
    private readonly jobs: JobQueueService,
  ) {}

  @Get("merge-candidates")
  async candidates(@Query() query: CandidateListQuery) {
    const where = { status: query.status ?? MergeCandidateStatus.PENDING };
    const [items, total] = await Promise.all([
      this.prisma.mergeCandidate.findMany({
        where,
        include: { landlordA: LANDLORD_BRIEF, landlordB: LANDLORD_BRIEF },
        orderBy: [{ score: "desc" }, { createdAt: "asc" }],
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
      }),
      this.prisma.mergeCandidate.count({ where }),
    ]);
    return { items, total, limit: query.limit ?? 50, offset: query.offset ?? 0 };
  }

  @Post("merge-candidates/:id/merge")
  async mergeCandidate(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: MergeDto) {
    const candidate = await this.prisma.mergeCandidate.findUniqueOrThrow({ where: { id } });
    const loserId = candidate.landlordAId === body.survivorId ? candidate.landlordBId : candidate.landlordAId;
    return this.merges.merge(body.survivorId, loserId, { userId: req.user!.sub }, { force: body.force });
  }

  @Post("merge-candidates/:id/distinct")
  async distinct(@Req() req: AuthRequest, @Param("id") id: string) {
    await this.merges.markDistinct(id, { userId: req.user!.sub });
    return { id, status: "DISTINCT" };
  }

  @Post("merges/:id/undo")
  async undo(@Req() req: AuthRequest, @Param("id") id: string) {
    await this.merges.unmerge(id, { userId: req.user!.sub });
    return { id, undone: true };
  }

  @Post("find-duplicates")
  async findDuplicates() {
    const { job } = await this.jobs.enqueue({ type: COMPANY_JOBS.FIND_DUPLICATES, dedupeKey: COMPANY_JOBS.FIND_DUPLICATES });
    return { jobId: job.id };
  }
}
