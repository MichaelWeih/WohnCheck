import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
const NotFound = () => <div className="container page-shell max-w-2xl"><p className="eyebrow">Fehler 404</p><h1>Diese Seite gibt es nicht.</h1><p className="text-muted-foreground mt-4 mb-6">Finde den gesuchten Vermieter oder Wohnort über das Verzeichnis.</p><Button asChild><Link to="/suche">Zur Suche</Link></Button></div>;
export default NotFound;
