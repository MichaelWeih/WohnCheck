import { NavLink, Link } from "react-router-dom";
import { House, Check, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
export function Navbar() {
  const { isAuthenticated, logout, hasRole } = useAuth();
  return (
    <header className="site-header">
      <a href="#main-content" className="skip-link">
        Zum Inhalt
      </a>
      <div className="container header-inner">
        <Link to="/" className="brand" aria-label="WohnCheck Startseite">
          <span className="brand-symbol">
            <House size={23} strokeWidth={1.7} />
            <Check size={13} strokeWidth={3} />
          </span>
          <span>
            Wohn<span className="brand-accent">Check</span>
          </span>
        </Link>
        <nav aria-label="Hauptnavigation" className="main-nav">
          <NavLink to="/check">Umgebung prüfen</NavLink>
          <NavLink to="/suche">Entdecken</NavLink>
          {hasRole("ADMIN") && <NavLink to="/admin">Moderation</NavLink>}
          {isAuthenticated ? (
            <Button variant="ghost" onClick={logout}>
              Abmelden
            </Button>
          ) : (
            <NavLink to="/login">Anmelden</NavLink>
          )}
          <NavLink className="nav-review" to="/bewertung/neu">
            <PenLine size={16} />
            <span>Bewertung schreiben</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
