import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-context";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    try {
      setIsSubmitting(true);
      const user = await login({ email, password });
      toast.success("Login erfolgreich.");

      const redirectTarget =
        user.role === "ADMIN"
          ? "/admin"
          : typeof location.state === "object" &&
              location.state &&
              "from" in location.state &&
              typeof location.state.from === "string"
            ? location.state.from
            : "/";

      navigate(redirectTarget, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login fehlgeschlagen.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container auth-shell flex justify-center">
      <Card className="auth-panel w-full max-w-md">
        <h1 className="text-2xl font-bold text-foreground mb-2 text-center">Anmelden</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">Melde dich an, um Bewertungen abzugeben.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div>
            <Label htmlFor="email">E-Mail</Label>
            <Input className="mt-1.5" id="email" autoComplete="email" type="email" placeholder="deine@email.de" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Passwort</Label>
            <Input className="mt-1.5" id="password" autoComplete="current-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Anmeldung läuft..." : "Anmelden"}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground text-center mt-4">
          Noch kein Konto? <Link to="/registrieren" className="text-primary hover:underline">Jetzt registrieren</Link>
        </p>
      </Card>
    </div>
  );
}
