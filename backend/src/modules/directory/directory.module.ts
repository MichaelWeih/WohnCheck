import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DiscoveryModule } from "../discovery/discovery.module";
import { AdminDirectoryController, DirectoryController } from "./directory.controller";
import { DirectoryService } from "./directory.service";
import { PropertyReportsService } from "./property-reports.service";

@Module({
  imports: [AuthModule, DiscoveryModule],
  controllers: [DirectoryController, AdminDirectoryController],
  providers: [DirectoryService, PropertyReportsService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
