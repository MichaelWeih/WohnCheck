import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
type DetailPageStateProps = { isLoading: boolean; error: unknown; notFoundText: string };
export function DetailPageState({ isLoading, error, notFoundText }: DetailPageStateProps) {
  if (isLoading) return <div className="container page-shell"><p role="status" className="state-message">Profil wird geladen …</p></div>;
  if (!error) return null;
  const notFound = error instanceof ApiError && error.status === 404;
  return <div className="container page-shell max-w-2xl"><h1>{notFound ? notFoundText : "Das Profil konnte nicht geladen werden."}</h1><p role="alert" className="state-message">{notFound ? "Suche nach einem anderen Vermieter oder Wohnort." : "Bitte überprüfe deine Verbindung und versuche es erneut."}</p><div className="flex flex-wrap gap-3">{!notFound && <Button onClick={() => window.location.reload()}>Erneut versuchen</Button>}<Button variant="outline" asChild><Link to="/suche">Zur Suche</Link></Button></div></div>;
}
