import { Link } from "react-router-dom";
import { SearchBar } from "./SearchBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/auth-context";
import { Home, LogIn, LogOut, UserPlus, Shield, PenSquare } from "lucide-react";

export function Navbar() {
  const { isAuthenticated, user, logout, hasRole } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex items-center h-16 gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Home size={18} className="text-primary-foreground" />
          </div>
          <span className="font-bold text-lg text-foreground hidden sm:inline">WohnCheck</span>
        </Link>

        <div className="flex-1 flex justify-center">
          <SearchBar />
        </div>

        <nav className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/bewertung/neu" className="gap-1.5">
              <PenSquare size={16} />
              <span className="hidden md:inline">Bewerten</span>
            </Link>
          </Button>
          {isAuthenticated && user ? (
            <>
              <div className="hidden lg:flex items-center gap-2 ml-2">
                <span className="text-sm text-foreground">{user.displayName}</span>
                <Badge variant="secondary">{user.role}</Badge>
              </div>
              {hasRole("ADMIN") && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/admin" className="gap-1.5">
                    <Shield size={16} />
                    <span className="hidden md:inline">Admin</span>
                  </Link>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={logout} className="gap-1.5">
                <LogOut size={16} />
                <span className="hidden md:inline">Logout</span>
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login" className="gap-1.5">
                  <LogIn size={16} />
                  <span className="hidden md:inline">Login</span>
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/registrieren" className="gap-1.5">
                  <UserPlus size={16} />
                  <span className="hidden md:inline">Registrieren</span>
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
