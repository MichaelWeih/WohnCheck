import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AuthResponse, AuthUser, UserRole } from "./auth-types";
import { clearStoredAuth, readStoredAuth, writeStoredAuth } from "./auth-storage";

type RegisterPayload = {
  displayName: string;
  email: string;
  password: string;
  role: Exclude<UserRole, "ADMIN">;
  landlordId?: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedAuth = readStoredAuth();

    if (!storedAuth?.accessToken) {
      setIsLoading(false);
      return;
    }

    setAccessToken(storedAuth.accessToken);

    void apiRequest<{ user: AuthUser }>("/auth/me", {
      method: "GET",
      token: storedAuth.accessToken,
    })
      .then((response) => {
        setUser(response.user);
      })
      .catch((error) => {
        if (error instanceof ApiError) {
          clearStoredAuth();
          setAccessToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const persistAuth = (response: AuthResponse) => {
    writeStoredAuth({ accessToken: response.accessToken });
    setAccessToken(response.accessToken);
    setUser(response.user);
  };

  const login = async (payload: LoginPayload) => {
    const response = await apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    persistAuth(response);
    return response.user;
  };

  const register = async (payload: RegisterPayload) => {
    const response = await apiRequest<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    persistAuth(response);
    return response.user;
  };

  const logout = () => {
    clearStoredAuth();
    setAccessToken(null);
    setUser(null);
  };

  const value: AuthContextValue = {
    user,
    accessToken,
    isAuthenticated: Boolean(user && accessToken),
    isLoading,
    login,
    register,
    logout,
    hasRole: (...roles: UserRole[]) => Boolean(user && roles.includes(user.role)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
