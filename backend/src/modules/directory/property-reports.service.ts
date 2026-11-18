import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CompanyKind,
  MappingReportKind,
  MappingReportStatus,
  PartyVerificationStatus,
  PropertyRole,
  RecordStatus,
  ReporterRole,
  VerificationStatus,
} from "@prisma/client";
import { CreatePropertyReportRequest, CreatePropertyReportResponse } from "../../common/api/api-types";
import { PublicLandlordLookupService } from "../companies/company.types";
import { companyKindLabel } from "../companies/company-kind";
import { addressKey, normalizeCompanyName, safeHttpUrl } from "../companies/normalization";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Stage 4 of the address lookup: users report who owns, lets or manages a building. A report is never shown
 * as a landlord; it only counts as "unverified report" until an admin checks it. Approving creates (or reuses)
 * the building and a VERIFIED PropertyParty with the report as evidence. Private landlords are never named.
 */
@Injectable()
export class PropertyReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: PublicLandlordLookupService,
  ) {}

  async create(userId: string, input: CreatePropertyReportRequest): Promise<CreatePropertyReportResponse> {
    const key = addressKey({ postalCode: input.postalCode, street: input.street, houseNumber: input.houseNumber });
    if (!key || !input.houseNumber.trim()) throw new BadRequestException("Bitte gib eine vollständige Adresse mit Hausnummer an.");
    const privateLandlord = Boolean(input.privateLandlord);
    let landlordId: string | null = null;
    if (input.landlordId && !privateLandlord) landlordId = (await this.lookup.resolve(input.landlordId)).landlord.id;
    const organization = privateLandlord ? null : input.organizationName?.trim() || null;
    if (!privateLandlord && !landlordId && !organization)
      throw new BadRequestException("Bitte wähle ein Unternehmen aus dem Verzeichnis oder gib den Firmennamen an.");
    if (organization && !normalizeCompanyName(organization).legalForm && organization.split(/\s+/).length < 2)
      throw new BadRequestException("Bitte gib den vollständigen Firmennamen an.");
    let evidenceUrl: string | null = null;
    if (input.evidenceUrl) {
      evidenceUrl = safeHttpUrl(input.evidenceUrl);
      if (!evidenceUrl) throw new BadRequestException("Der Beleg muss ein http- oder https-Link sein.");
    }
    const duplicate = await this.prisma.mappingReport.findFirst({
      where: {
        kind: MappingReportKind.PROPERTY_ASSIGNMENT,
        reporterUserId: userId,
        addressKey: key,
        status: { in: [MappingReportStatus.OPEN, MappingReportStatus.IN_PROGRESS] },
      },
    });
    if (duplicate) throw new ConflictException("Du hast für diese Adresse bereits eine offene Meldung.");
    const property = await this.prisma.property.findFirst({ where: { addressKey: key }, select: { id: true } });
    const report = await this.prisma.mappingReport.create({
      data: {
        kind: MappingReportKind.PROPERTY_ASSIGNMENT,
        reporterRole: input.reporterRole ?? ReporterRole.TENANT,
        reporterUserId: userId,
        landlordId,
        propertyId: property?.id ?? null,
        street: input.street.trim(),
        houseNumber: input.houseNumber.trim(),
        postalCode: input.postalCode.trim(),
        city: input.city.trim(),
        addressKey: key,
        reportedRole: input.role,
        reportedOrganization: organization,
        privateLandlord,
        evidenceUrl,
        message: (input.message ?? "").trim().slice(0, 1000),
      },
    });
    return {
      id: report.id,
      status: "OPEN",
      message: "Danke! Deine Meldung ist eingegangen. Sie wird erst nach einer Prüfung durch WohnCheck als Zuordnung angezeigt.",
    };
  }

  async list(status: MappingReportStatus = MappingReportStatus.OPEN) {
    return this.prisma.mappingReport.findMany({
      where: { kind: MappingReportKind.PROPERTY_ASSIGNMENT, status },
      include: { landlord: { select: { id: true, name: true, status: true } }, property: { select: { id: true, slug: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
  }

  /**
   * Admin approval: the organisation must be an ACTIVE directory entry (create it first for a new company).
   * Creates the building when it is not known yet. An existing current relation of the SAME role becomes
   * HISTORIC when `replacesCurrent` is set (change of landlord); otherwise both stay and the admin decides.
   */
  async approve(
    reportId: string,
    adminId: string,
    input: { landlordId: string; role?: PropertyRole; validFrom?: string; unitLabel?: string; replacesCurrent?: boolean; note?: string },
  ) {
    const report = await this.prisma.mappingReport.findUnique({ where: { id: reportId } });
    if (!report || report.kind !== MappingReportKind.PROPERTY_ASSIGNMENT) throw new NotFoundException("Meldung nicht gefunden.");
    if (report.status === MappingReportStatus.RESOLVED || report.status === MappingReportStatus.DISMISSED)
      throw new ConflictException("Die Meldung ist bereits abgeschlossen.");
    const { landlord } = await this.lookup.resolve(input.landlordId);
    const role = input.role ?? report.reportedRole ?? PropertyRole.LANDLORD;
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      let property = report.propertyId ? await tx.property.findUnique({ where: { id: report.propertyId } }) : null;
      property ??= await tx.property.findFirst({ where: { addressKey: report.addressKey } });
      if (!property) {
        const slugBase = `${report.street}-${report.houseNumber}-${report.postalCode}-${report.city}`
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/ß/g, "ss")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        property = await tx.property.create({
          data: {
            street: report.street!,
            houseNumber: report.houseNumber!,
            postalCode: report.postalCode!,
            city: report.city!,
            addressKey: report.addressKey,
            slug: `${slugBase}-${report.id.slice(-6)}`,
          },
        });
      }
      if (input.replacesCurrent) {
        await tx.propertyParty.updateMany({
          where: { propertyId: property.id, role, verificationStatus: PartyVerificationStatus.VERIFIED, landlordId: { not: landlord.id } },
          data: { verificationStatus: PartyVerificationStatus.HISTORIC, validTo: input.validFrom ? new Date(input.validFrom) : now },
        });
      }
      const party = await tx.propertyParty.upsert({
        where: { propertyId_landlordId_role: { propertyId: property.id, landlordId: landlord.id, role } },
        create: {
          propertyId: property.id,
          landlordId: landlord.id,
          role,
          source: `mapping_report:${report.id}`,
          confidence: 1,
          verificationStatus: PartyVerificationStatus.VERIFIED,
          validFrom: input.validFrom ? new Date(input.validFrom) : null,
          unitLabel: input.unitLabel?.trim() || null,
          lastCheckedAt: now,
          evidenceRef: report.evidenceUrl ?? `mapping_report:${report.id}`,
        },
        update: { verificationStatus: PartyVerificationStatus.VERIFIED, validTo: null, lastCheckedAt: now },
      });
      if (role === PropertyRole.LANDLORD && !input.unitLabel && (!property.landlordId || input.replacesCurrent))
        await tx.property.update({ where: { id: property.id }, data: { landlordId: landlord.id } });
      await tx.mappingReport.updateMany({
        where: {
          kind: MappingReportKind.PROPERTY_ASSIGNMENT,
          addressKey: report.addressKey,
          status: { in: [MappingReportStatus.OPEN, MappingReportStatus.IN_PROGRESS] },
          OR: [{ id: report.id }, { landlordId: landlord.id, reportedRole: role }],
        },
        data: {
          status: MappingReportStatus.RESOLVED,
          resolvedAt: now,
          resolvedByUserId: adminId,
          resolutionNote: input.note ?? "Zuordnung geprüft und übernommen.",
          propertyId: property.id,
          // Personal data is cleared when a report is closed.
          contactEmail: null,
          message: "",
          personalDataClearedAt: now,
        },
      });
      return { propertyId: property.id, partyId: party.id };
    });
  }

  async dismiss(reportId: string, adminId: string, note?: string) {
    const report = await this.prisma.mappingReport.findUnique({ where: { id: reportId } });
    if (!report || report.kind !== MappingReportKind.PROPERTY_ASSIGNMENT) throw new NotFoundException("Meldung nicht gefunden.");
    const now = new Date();
    await this.prisma.mappingReport.update({
      where: { id: reportId },
      data: { status: MappingReportStatus.DISMISSED, resolvedAt: now, resolvedByUserId: adminId, resolutionNote: note ?? null, contactEmail: null, message: "", personalDataClearedAt: now },
    });
    return { id: reportId, status: "DISMISSED" };
  }

  /** Ends a relation (change of landlord or manager): it stays visible as "früher zuständig". */
  async endRelation(partyId: string, validTo?: string) {
    const party = await this.prisma.propertyParty.findUnique({ where: { id: partyId } });
    if (!party) throw new NotFoundException("Zuordnung nicht gefunden.");
    const end = validTo ? new Date(validTo) : new Date();
    await this.prisma.$transaction([
      this.prisma.propertyParty.update({ where: { id: partyId }, data: { verificationStatus: PartyVerificationStatus.HISTORIC, validTo: end, lastCheckedAt: new Date() } }),
      this.prisma.property.updateMany({ where: { id: party.propertyId, landlordId: party.landlordId }, data: { landlordId: null } }),
    ]);
    return { id: partyId, status: "HISTORIC", validTo: end.toISOString() };
  }

  /** Candidates found by the importer that are not public yet (e.g. "likely" real-estate companies). */
  async listCandidates(limit = 100) {
    return this.prisma.landlord.findMany({
      where: { status: RecordStatus.CANDIDATE },
      select: { id: true, name: true, city: true, kind: true, relevance: true, websiteDomain: true, createdAt: true, sourceRecords: { select: { sourceKey: true, externalId: true, url: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
    });
  }

  /** Admin decision about an imported record: publish (manually verified) or reject. */
  async decideCandidate(id: string, decision: "ACTIVE" | "REJECTED", adminId: string, kind?: CompanyKind) {
    const landlord = await this.prisma.landlord.findUnique({ where: { id } });
    if (!landlord) throw new NotFoundException("Vermieter nicht gefunden.");
    if (landlord.kind === CompanyKind.PRIVATE_LANDLORD && decision === "ACTIVE")
      throw new BadRequestException("Privatvermieter werden nicht als öffentliches Profil geführt.");
    const data =
      decision === "ACTIVE"
        ? {
            status: RecordStatus.ACTIVE,
            verificationStatus: VerificationStatus.MANUALLY_VERIFIED,
            confidence: 1,
            ...(kind ? { kind, companyType: companyKindLabel(kind) } : {}),
          }
        : { status: RecordStatus.REJECTED };
    await this.prisma.$transaction([
      this.prisma.landlord.update({ where: { id }, data }),
      this.prisma.changeLog.create({
        data: { landlordId: id, action: "STATUS_CHANGED", actorUserId: adminId, changes: { status: { from: landlord.status, to: data.status } } },
      }),
    ]);
    return { id, status: data.status };
  }
}
