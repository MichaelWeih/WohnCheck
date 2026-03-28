import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => (
  <div className="container py-20 text-center">
    <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
    <p className="text-lg text-muted-foreground mb-6">Seite nicht gefunden.</p>
    <Button asChild>
      <Link to="/">Zurück zur Startseite</Link>
    </Button>
  </div>
);

export default NotFound;
