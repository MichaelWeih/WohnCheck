import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  getLandlords() {
    return this.prisma.landlord.findMany({
      orderBy: { name: "asc" },
    });
  }

  getLandlordById(id: string) {
    return this.prisma.landlord.findUnique({
      where: { id },
      include: {
        properties: true,
      },
    });
  }

  getProperties() {
    return this.prisma.property.findMany({
      include: {
        landlord: true,
        neighborhood: true,
      },
      orderBy: [{ city: "asc" }, { street: "asc" }],
    });
  }

  getPropertyById(id: string) {
    return this.prisma.property.findUnique({
      where: { id },
      include: {
        landlord: true,
        neighborhood: true,
      },
    });
  }

  getNeighborhoods() {
    return this.prisma.neighborhood.findMany({
      include: {
        properties: true,
      },
      orderBy: [{ city: "asc" }, { districtName: "asc" }],
    });
  }

  getNeighborhoodById(id: string) {
    return this.prisma.neighborhood.findUnique({
      where: { id },
      include: {
        properties: true,
      },
    });
  }

  async search(query: string) {
    const q = query.trim();

    const [landlords, properties, neighborhoods] = await Promise.all([
      this.prisma.landlord.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
      }),
      this.prisma.property.findMany({
        where: {
          OR: [
            { street: { contains: q, mode: "insensitive" } },
            { postalCode: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
      }),
      this.prisma.neighborhood.findMany({
        where: {
          OR: [
            { districtName: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { postalCode: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
      }),
    ]);

    return {
      landlords,
      properties,
      neighborhoods,
    };
  }
}
