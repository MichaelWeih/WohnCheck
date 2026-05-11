import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("districts")
export class DistrictsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id/rent-prices")
  async getRentPrices(@Param("id") id: string) {
    const district = await this.prisma.district.findUnique({
      where: { id },
      include: {
        rentPrices: { orderBy: { updatedAt: "desc" } },
      },
    });

    if (!district) {
      throw new NotFoundException("Stadtteil nicht gefunden");
    }

    return {
      district: {
        id: district.id,
        name: district.name,
        city: district.city,
        postalCode: district.postalCode,
      },
      rentPrices: district.rentPrices.map((price) => ({
        id: price.id,
        metric: price.metric,
        valuePerSqm: Number(price.valuePerSqm),
        p25: price.p25 ? Number(price.p25) : null,
        p75: price.p75 ? Number(price.p75) : null,
        sampleSize: price.sampleSize,
        sourceKey: price.sourceKey,
        sourceUrl: price.sourceUrl,
        periodLabel: price.periodLabel,
        quality: price.quality,
      })),
    };
  }
}
