import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { PropertyRoleApi } from "@/features/api-types";
import { useAuth } from "@/features/auth/auth-context";
import { reportPropertyLandlord } from "@/features/directory/directory-api";
import { LandlordPicker, PickedLandlord } from "./LandlordPicker";

export interface ReportAddress {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
}

const ROLES: Array<{ value: PropertyRoleApi; label: string }> = [
  { value: "LANDLORD", label: "Vermieter" },
  { value: "MANAGER", label: "Hausverwaltung" },
  { value: "OWNER", label: "Eigentümer" },
];

/**
 * "Vermieter melden": a user tells WohnCheck who lets, manages or owns a building. The report is stored as
 * unverified and is never displayed as an assignment before WohnCheck has checked it. Private landlords are never
 * named — only the fact is recorded.
 */
export function ReportLandlordForm({ address, onDone }: { address: ReportAddress; onDone?: () => void }) {
  const { accessToken } = useAuth();
  const location = useLocation();
  const [role, setRole] = useState<PropertyRoleApi>("LANDLORD");
  const [landlord, setLandlord] = useState<PickedLandlord | null>(null);
  const [notListed, setNotListed] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [privateLandlord, setPrivateLandlord] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!accessToken)
    return (
      <div className="report-form">
        <p>Um Missbrauch zu vermeiden, können nur angemeldete Nutzer Zuordnungen melden.</p>
        <Button asChild variant="outline">
          <Link to="/login" state={{ from: `${location.pathname}${location.search}` }}>Anmelden und melden</Link>
        </Button>
      </div>
    );

  if (result)
    return (
      <div className="report-form" role="status">
        <p>{result}</p>
      </div>
    );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const usesPrivate = role === "LANDLORD" && privateLandlord;
    if (!usesPrivate && !landlord && !(notListed && organizationName.trim())) {
      setError("Bitte wähle ein Unternehmen aus oder gib den Firmennamen an.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await reportPropertyLandlord(
        {
          ...address,
          role,
          privateLandlord: usesPrivate || undefined,
          landlordId: !usesPrivate && landlord ? landlord.id : undefined,
          organizationName: !usesPrivate && !landlord && notListed ? organizationName.trim() : undefined,
          evidenceUrl: evidenceUrl.trim() || undefined,
          message: message.trim() || undefined,
          reporterRole: "TENANT",
        },
        accessToken!,
      );
      setResult(response.message);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Meldung konnte nicht gesendet werden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="report-form" onSubmit={submit} noValidate>
      <p className="report-address">
        {address.street} {address.houseNumber}, {address.postalCode} {address.city}
      </p>
      <fieldset>
        <legend className="field-label">Wer ist zuständig?</legend>
        <div className="role-choice">
          {ROLES.map((r) => (
            <label key={r.value}>
              <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      {role === "LANDLORD" && (
        <label className="checkbox-row">
          <input type="checkbox" checked={privateLandlord} onChange={(e) => setPrivateLandlord(e.target.checked)} />
          Privatperson (der Name wird nicht gespeichert)
        </label>
      )}
      {!(role === "LANDLORD" && privateLandlord) && (
        <>
          <LandlordPicker value={landlord} onChange={setLandlord} disabled={notListed} label={role === "MANAGER" ? "Hausverwaltung" : "Unternehmen"} />
          <label className="checkbox-row">
            <input type="checkbox" checked={notListed} onChange={(e) => { setNotListed(e.target.checked); if (e.target.checked) setLandlord(null); }} />
            Das Unternehmen ist noch nicht im Verzeichnis
          </label>
          {notListed && (
            <div>
              <label className="field-label" htmlFor="report-org">Vollständiger Firmenname</label>
              <input id="report-org" className="field-input" value={organizationName} maxLength={200} onChange={(e) => setOrganizationName(e.target.value)} placeholder="z. B. Musterverwaltung GmbH" />
            </div>
          )}
        </>
      )}
      <div>
        <label className="field-label" htmlFor="report-evidence">Beleg (optional)</label>
        <input id="report-evidence" className="field-input" type="url" value={evidenceUrl} maxLength={500} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="Link zu einer öffentlichen Quelle" />
      </div>
      <div>
        <label className="field-label" htmlFor="report-message">Hinweis für die Prüfung (optional, nicht öffentlich)</label>
        <textarea id="report-message" className="field-input" rows={3} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <p className="field-hint">
        Deine Meldung wird erst nach einer Prüfung durch WohnCheck als Zuordnung angezeigt. Lade keine Mietverträge oder andere
        persönlichen Unterlagen hoch.
      </p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <Button type="submit" disabled={submitting}>{submitting ? "Wird gesendet …" : "Meldung senden"}</Button>
    </form>
  );
}
