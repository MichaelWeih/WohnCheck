import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useConsent } from "@/components/consent/ConsentProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function CookieBanner() {
  const { hasAnswered, acceptAll, rejectOptional } = useConsent();

  if (hasAnswered) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 px-4">
      <Card className="mx-auto max-w-4xl border-primary/20 bg-background/95 p-5 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck size={16} className="text-primary" />
              Datenschutz und externe Inhalte
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Wir speichern nur deine Consent-Auswahl lokal. Karteninhalte laden wir erst
              nach deiner Zustimmung, weil dabei Anfragen an OpenStreetMap und verbundene
              Server gesendet werden.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Mehr Details findest du in unserer{" "}
              <Link to="/datenschutz" className="font-medium text-primary hover:underline">
                Datenschutzerklärung
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={rejectOptional}>
              Nur notwendige
            </Button>
            <Button onClick={acceptAll}>Externe Inhalte erlauben</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
