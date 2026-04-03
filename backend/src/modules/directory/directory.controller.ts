import { Controller, Get, Param, Query } from "@nestjs/common";
import { DirectoryService } from "./directory.service";

@Controller()
export class DirectoryController {
  constructor(private readonly directoryService: DirectoryService) {}

  @Get("landlords")
  getLandlords() {
    return this.directoryService.getLandlords();
  }

  @Get("landlords/:id")
  getLandlord(@Param("id") id: string) {
    return this.directoryService.getLandlordById(id);
  }

  @Get("properties")
  getProperties() {
    return this.directoryService.getProperties();
  }

  @Get("properties/:id")
  getProperty(@Param("id") id: string) {
    return this.directoryService.getPropertyById(id);
  }

  @Get("neighborhoods")
  getNeighborhoods() {
    return this.directoryService.getNeighborhoods();
  }

  @Get("neighborhoods/:id")
  getNeighborhood(@Param("id") id: string) {
    return this.directoryService.getNeighborhoodById(id);
  }

  @Get("search")
  search(@Query("q") q = "") {
    return this.directoryService.search(q);
  }
}
