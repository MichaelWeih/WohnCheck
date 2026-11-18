import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { LandlordPicker, PickedLandlord } from "@/components/landlord/LandlordPicker";
import { toast } from "sonner";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "LANDLORD">("USER");
  const [landlordId, setLandlordId] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickedLandlord, setPickedLandlord] = useState<PickedLandlord | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (role === "LANDLORD" && !landlordId) {
      toast.error("Bitte ordne das Konto einem Vermieter zu.");
      return;
    }

    try {
      setIsSubmitting(true);
      await register({
        displayName: name,
        email,
        password,
        role,
        landlordId: role === "LANDLORD" ? landlordId : undefined,
      });
      toast.success("Registrierung erfolgreich.");
      navigate("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registrierung fehlgeschlagen.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container auth-shell flex justify-center">
      <Card className="auth-panel w-full max-w-md">
        <h1 className="text-2xl font-bold text-foreground mb-2 text-center">Konto erstellen</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">Registriere dich, um Bewertungen abzugeben und zu kommentieren.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoComplete="name" className="mt-1.5" placeholder="Max Mustermann" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="email">E-Mail</Label>
            <Input className="mt-1.5" id="email" autoComplete="email" type="email" placeholder="deine@email.de" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="role">Ich bin</Label>
            <Select value={role} onValueChange={(value: "USER" | "LANDLORD") => { setRole(value); if (value !== "LANDLORD") setLandlordId(""); }}>
              <SelectTrigger id="role" className="mt-1.5">
                <SelectValue placeholder="Rolle wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">Nutzer</SelectItem>
                <SelectItem value="LANDLORD">Vermieter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "LANDLORD" && (
            <div>
              <Label htmlFor="landlord">Vermieter-Zuordnung</Label>
              <LandlordPicker
                label="Unternehmen im Verzeichnis"
                value={pickedLandlord}
                onChange={(landlord) => { setPickedLandlord(landlord); setLandlordId(landlord?.id ?? ""); }}
              />
            </div>
          )}
          <div>
            <Label htmlFor="password">Passwort</Label>
            <Input className="mt-1.5" id="password" autoComplete="new-password" type="password" placeholder="Mindestens 8 Zeichen" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Registrierung läuft..." : "Registrieren"}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground text-center mt-4">
          Bereits ein Konto? <Link to="/login" className="text-primary hover:underline">Anmelden</Link>
        </p>
      </Card>
    </div>
  );
}
