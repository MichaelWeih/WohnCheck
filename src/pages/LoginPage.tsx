import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Login erfolgreich! (Demo)");
  };

  return (
    <div className="container py-20 flex justify-center">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-foreground mb-2 text-center">Anmelden</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">Melde dich an, um Bewertungen abzugeben.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>E-Mail</Label>
            <Input className="mt-1.5" type="email" placeholder="deine@email.de" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label>Passwort</Label>
            <Input className="mt-1.5" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full">Anmelden</Button>
        </form>
        <p className="text-sm text-muted-foreground text-center mt-4">
          Noch kein Konto? <Link to="/registrieren" className="text-primary hover:underline">Jetzt registrieren</Link>
        </p>
      </Card>
    </div>
  );
}
