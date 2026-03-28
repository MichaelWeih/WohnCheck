import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Registrierung erfolgreich! (Demo)");
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
            <Label>Passwort</Label>
            <Input className="mt-1.5" type="password" placeholder="Mindestens 8 Zeichen" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <Button type="submit" className="w-full">Registrieren</Button>
        </form>
        <p className="text-sm text-muted-foreground text-center mt-4">
          Bereits ein Konto? <Link to="/login" className="text-primary hover:underline">Anmelden</Link>
        </p>
      </Card>
    </div>
  );
}
