import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminCompaniesController } from "./admin-companies.controller";
import { CompanyMergeServiceImpl } from "./company-merge.service";
import { CompanyResolverServiceImpl } from "./company-resolver.service";
import {
  CompanyMergeService,
  CompanyResolverService,
  LandlordNameSearchService,
  LandlordSummaryService,
  PublicLandlordLookupService,
} from "./company.types";
import { LandlordNameSearchServiceImpl } from "./landlord-name-search.service";
import { DuplicateFinderService } from "./duplicate-finder.service";
import { LandlordSummaryServiceImpl } from "./landlord-summary.service";
import { NormalizationBootstrapService } from "./normalization-bootstrap.service";
import { PublicLandlordLookupServiceImpl } from "./public-landlord-lookup.service";

/**
 * Identity of landlords: normalization, matching, resolver, name search, public lookup and cards
 * (contract: company.types.ts). Global: every module can inject the exported services.
 * Uncertain matches become MergeCandidate rows; admins merge or separate them under /admin/companies.
 * Erasure on request (CompanyErasureService) is not implemented yet.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AdminCompaniesController],
  providers: [
    NormalizationBootstrapService,
    LandlordSummaryServiceImpl,
    { provide: LandlordSummaryService, useExisting: LandlordSummaryServiceImpl },
    { provide: LandlordNameSearchService, useClass: LandlordNameSearchServiceImpl },
    { provide: PublicLandlordLookupService, useClass: PublicLandlordLookupServiceImpl },
    { provide: CompanyResolverService, useClass: CompanyResolverServiceImpl },
    CompanyMergeServiceImpl,
    { provide: CompanyMergeService, useExisting: CompanyMergeServiceImpl },
    DuplicateFinderService,
  ],
  exports: [
    LandlordSummaryServiceImpl,
    LandlordSummaryService,
    LandlordNameSearchService,
    PublicLandlordLookupService,
    CompanyResolverService,
    CompanyMergeService,
    CompanyMergeServiceImpl,
    DuplicateFinderService,
    NormalizationBootstrapService,
  ],
})
export class CompaniesModule {}
