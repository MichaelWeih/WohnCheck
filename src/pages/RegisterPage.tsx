import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { landlords } from "@/data/mock-data";
import { useAuth } from "@/features/auth/auth-context";
import { fetchLandlords } from "@/features/directory/directory-api";
import { toast } from "sonner";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { data: apiLandlords } = useQuery({
    queryKey: ["landlords"],
    queryFn: fetchLandlords,
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"USER" | "LANDLORD">("USER");
  const [landlordId, setLandlordId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const landlordOptions = apiLandlords?.map((landlord) => ({
    id: landlord.id,
    name: landlord.name,
    city: landlord.city,
  })) ?? landlords.map((landlord) => ({
    id: landlord.id,
    name: landlord.name,
    city: landlord.city,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container py-20 flex justify-center">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-foreground mb-2 text-center">Konto erstellen</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">Registriere dich, um Bewertungen abzugeben und zu kommentieren.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input className="mt-1.5" placeholder="Max Mustermann" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>E-Mail</Label>
            <Input className="mt-1.5" type="email" placeholder="deine@email.de" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label>Rolle</Label>
            <Select value={role} onValueChange={(value: "USER" | "LANDLORD") => { setRole(value); if (value !== "LANDLORD") setLandlordId(""); }}>
              <SelectTrigger className="mt-1.5">
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
              <Label>Vermieter-Zuordnung</Label>
              <Select value={landlordId} onValueChange={setLandlordId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Bestehenden Vermieter wählen" />
                </SelectTrigger>
                <SelectContent>
                  {landlordOptions.map((landlord) => (
                    <SelectItem key={landlord.id} value={landlord.id}>
                      {landlord.name} ({landlord.city})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Passwort</Label>
            <Input className="mt-1.5" type="password" placeholder="Mindestens 8 Zeichen" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
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
