import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthUser } from "../interfaces/auth-user.interface";

type RequestWithUser = Request & { user?: AuthUser };

/**
 * For endpoints that are public but want to know the user when one is logged in
 * (e.g. reporting a wrong mapping). Never rejects: a missing or invalid token simply
 * leaves `request.user` undefined.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (authHeader?.startsWith("Bearer ")) {
      try {
        request.user = this.jwtService.verify<AuthUser>(authHeader.slice("Bearer ".length).trim());
      } catch {
        request.user = undefined;
      }
    }

    return true;
  }
}
