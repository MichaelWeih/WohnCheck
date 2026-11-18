import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MappingReportKindApi } from "@/features/api-types";
import { useAuth } from "@/features/auth/auth-context";
import { reportLandlord } from "@/features/directory/directory-api";

const KINDS: Array<{ value: MappingReportKindApi; label: string }> = [
  { value: "WRONG_COMPANY_DATA", label: "Unternehmensangaben sind falsch" },
  { value: "DUPLICATE", label: "Unternehmen ist doppelt eingetragen" },
  { value: "WRONG_RELATION", label: "Konzernzugehörigkeit stimmt nicht" },
  { value: "WRONG_EXTERNAL_LINK", label: "Externer Link ist falsch" },
  { value: "REMOVAL_REQUEST", label: "Löschung / Berichtigung beantragen" },
  { value: "OTHER", label: "Sonstiges" },
];

/** Correction and removal requests for a landlord profile; handled manually by WohnCheck. */
export function ProfileReportForm({ landlordId }: { landlordId: string }) {
  const { accessToken } = useAuth();
  const [kind, setKind] = useState<MappingReportKindApi>("WRONG_COMPANY_DATA");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  if (state === "sent") return <p role="status">Danke! WohnCheck prüft deinen Hinweis.</p>;

  return (
    <form
      className="report-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (message.trim().length < 10) {
          setError("Bitte beschreibe das Problem in mindestens 10 Zeichen.");
          return;
        }
        setState("sending");
        try {
          await reportLandlord(landlordId, { kind, message: message.trim(), contactEmail: contactEmail.trim() || undefined }, accessToken);
          setState("sent");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Der Hinweis konnte nicht gesendet werden.");
          setState("idle");
        }
      }}
    >
      <label className="field-label" htmlFor="profile-report-kind">Art des Hinweises</label>
      <select id="profile-report-kind" className="field-input" value={kind} onChange={(e) => setKind(e.target.value as MappingReportKindApi)}>
        {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </select>
      <label className="field-label" htmlFor="profile-report-message">Beschreibung</label>
      <textarea id="profile-report-message" className="field-input" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
      <label className="field-label" htmlFor="profile-report-email">E-Mail für Rückfragen (optional)</label>
      <input id="profile-report-email" className="field-input" type="email" maxLength={200} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
      <p className="field-hint">Die E-Mail-Adresse wird nach Abschluss der Prüfung gelöscht.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <Button type="submit" variant="outline" disabled={state === "sending"}>{state === "sending" ? "Wird gesendet …" : "Hinweis senden"}</Button>
    </form>
  );
}
