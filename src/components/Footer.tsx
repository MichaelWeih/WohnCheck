import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t bg-card mt-auto">
      <div className="container py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <img
                src="/branding/wohncheck-icon.svg"
                alt=""
                aria-hidden="true"
                className="h-11 w-11 shrink-0"
              />
              <span className="text-xl font-bold tracking-tight text-foreground">WohnCheck</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Transparenz im Wohnungsmarkt - echte Erfahrungsberichte von Mietern.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-3 text-sm">Entdecken</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/suche?q=Berlin" className="hover:text-foreground transition-colors">Vermieter Berlin</Link>
              <Link to="/suche?q=München" className="hover:text-foreground transition-colors">Vermieter München</Link>
              <Link to="/suche?q=Hamburg" className="hover:text-foreground transition-colors">Vermieter Hamburg</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-3 text-sm">Mitmachen</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/bewertung/neu" className="hover:text-foreground transition-colors">Bewertung abgeben</Link>
              <Link to="/registrieren" className="hover:text-foreground transition-colors">Konto erstellen</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-3 text-sm">Rechtliches</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
              <Link to="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
            </div>
          </div>
        </div>
        <div className="border-t mt-8 pt-6 text-center text-xs text-muted-foreground">
          <p>© 2025 WohnCheck. Alle Bewertungen sind subjektive Nutzererfahrungen und stellen keine objektive Beurteilung dar.</p>
        </div>
      </div>
    </footer>
  );
}
