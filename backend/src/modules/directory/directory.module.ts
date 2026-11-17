import { Module } from "@nestjs/common";
import { DataSourcesModule } from "../data-sources/data-sources.module";
import { DirectoryController } from "./directory.controller";
import { DirectoryService } from "./directory.service";

@Module({
  imports: [DataSourcesModule],
  controllers: [DirectoryController],
  providers: [DirectoryService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
