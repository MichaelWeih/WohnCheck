import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";

/**
 * Identity of landlords: normalization, matching, resolver, merge, erasure, profile and /admin/companies
 * (contract: company.types.ts). Global: every module can inject PublicLandlordLookupService,
 * LandlordNameSearchService, CompanyResolverService and CompanyMergeService.
 * Skeleton: providers, controllers and exports are added by the module's implementation.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [],
  providers: [],
  exports: [],
})
export class CompaniesModule {}
