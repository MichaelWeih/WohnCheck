import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthUser } from "../interfaces/auth-user.interface";

type RequestWithUser = Request & { user?: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Authentifizierung erforderlich.");
    }

    const token = authHeader.replace("Bearer ", "").trim();

    try {
      const payload = this.jwtService.verify<AuthUser>(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Ungueltiges oder abgelaufenes Token.");
    }
  }
}
