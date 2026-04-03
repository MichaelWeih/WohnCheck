export type UserRole = "USER" | "LANDLORD" | "ADMIN";

export interface AuthLandlord {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isVerified: boolean;
  landlordId?: string | null;
  landlord?: AuthLandlord | null;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}
