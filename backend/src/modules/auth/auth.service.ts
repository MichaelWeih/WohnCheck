import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.role === UserRole.ADMIN) {
      throw new BadRequestException("Diese Rolle kann nicht frei registriert werden.");
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException("Es existiert bereits ein Konto mit dieser E-Mail.");
    }

    if (dto.role === UserRole.LANDLORD && !dto.landlordId) {
      throw new BadRequestException("Vermieter-Konten brauchen eine zugeordnete landlordId.");
    }

    if (dto.landlordId) {
      const landlord = await this.prisma.landlord.findUnique({
        where: { id: dto.landlordId },
        select: { id: true },
      });

      if (!landlord) {
        throw new BadRequestException("Der angegebene Vermieter existiert nicht.");
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        displayName: dto.displayName,
        passwordHash,
        role: dto.role,
        landlordId: dto.role === UserRole.LANDLORD ? dto.landlordId : null,
      },
      include: {
        landlord: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        landlord: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException("E-Mail oder Passwort ist falsch.");
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isValid) {
      throw new UnauthorizedException("E-Mail oder Passwort ist falsch.");
    }

    return this.buildAuthResponse(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        landlord: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Benutzer nicht gefunden.");
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isVerified: user.isVerified,
        landlordId: user.landlordId,
        landlord: user.landlord,
      },
    };
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    isVerified: boolean;
    landlordId: string | null;
    landlord?: { id: string; name: string } | null;
  }) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isVerified: user.isVerified,
        landlordId: user.landlordId,
        landlord: user.landlord ?? null,
      },
    };
  }
}
