import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { addressSearch, locationErrorText } from "./api";
import type { ResolvedAddress } from "./types";
import { ADDRESS_DEBOUNCE_MS, ADDRESS_MIN_LENGTH, accuracyLabel } from "./utils";

/**
 * Address field with suggestions. Suggestions load from three characters after a 350 ms pause;
 * outdated requests are aborted and late answers ignored. Submitting resolves the text explicitly:
 * a single confident match is taken, otherwise the user has to choose. Nothing is picked arbitrarily.
 */
export function AddressSearch({
  onSelect,
  initial = "",
  label = "Adresse prüfen",
}: {
  onSelect: (a: ResolvedAddress) => void;
  initial?: string;
  label?: string;
}) {
  const [value, setValue] = useState(initial);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /** true: suggestions while typing, false: explicit resolution of the submitted text. */
  const [suggesting, setSuggesting] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const id = useId();
  const typed = value.trim();

  useEffect(() => setValue(initial), [initial]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed), ADDRESS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const result = useQuery({
    queryKey: ["location-address", query, suggesting],
    // The signal aborts the request as soon as the text changes or the field closes.
    queryFn: ({ signal }) => addressSearch(query, suggesting, signal),
    enabled: open && query.length >= ADDRESS_MIN_LENGTH,
    staleTime: 300000,
    retry: false,
  });
  const current = query === typed && !result.isPlaceholderData;
  const suggestions = current ? (result.data?.suggestions ?? []) : [];
  const pending = result.isFetching || query !== typed;

  function select(address: ResolvedAddress) {
    setOpen(false);
    setSubmitted(false);
    setActive(-1);
    onSelect(address);
  }

  // A submitted address with exactly one confident match needs no further choice.
  const unique =
    submitted && !suggesting && current && !result.isFetching
      ? result.data?.resolution === "unique"
        ? result.data.suggestions[0]
        : undefined
      : undefined;
  useEffect(() => {
    if (unique) select(unique);
    // select only uses stable setters and the latest onSelect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unique]);

  const error = result.isError ? locationErrorText(result.error, "address") : null;
  const status =
    typed.length < ADDRESS_MIN_LENGTH
      ? ""
      : pending
        ? "Adresse wird gesucht …"
        : error
          ? `${error.title}: ${error.text}`
          : !suggestions.length
            ? "Diese Adresse konnte nicht gefunden werden. Bitte prüfe Straße, Hausnummer, PLZ und Ort."
            : submitted
              ? "Bitte wähle die passende Adresse aus."
              : "Adresse auswählen, um die Umgebung zu laden.";

  return (
    <form
      className="location-address"
      role="search"
      aria-label="Adresssuche"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (open && active >= 0 && suggestions[active]) {
          select(suggestions[active]);
          return;
        }
        if (typed.length < ADDRESS_MIN_LENGTH) return;
        setSuggesting(false);
        setQuery(typed);
        setOpen(true);
        setSubmitted(true);
        if (query === typed && !suggesting && result.isError)
          void result.refetch();
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="search-field">
        <Search size={20} aria-hidden="true" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && typed.length >= ADDRESS_MIN_LENGTH}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-describedby={`${id}-status`}
          aria-activedescendant={
            open && active >= 0 && suggestions[active]
              ? `${id}-${active}`
              : undefined
          }
          value={value}
          placeholder="Straße, Hausnummer, PLZ und Ort"
          autoComplete="off"
          enterKeyHint="search"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setValue(e.target.value);
            setSuggesting(true);
            setOpen(true);
            setActive(-1);
            setSubmitted(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((i) =>
                suggestions.length
                  ? (i < 0 && e.key === "ArrowUp"
                      ? suggestions.length - 1
                      : i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) %
                    suggestions.length
                  : -1,
              );
            }
          }}
        />
        <button
          type="submit"
          className="search-submit"
          aria-label="Adresse suchen"
          disabled={typed.length < ADDRESS_MIN_LENGTH}
        >
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div
        className="location-address-results"
        hidden={!open || typed.length < ADDRESS_MIN_LENGTH}
      >
        <ul role="listbox" id={`${id}-options`} aria-label="Adressvorschläge">
          {suggestions.map((address, i) => (
            <li
              key={address.id}
              role="option"
              id={`${id}-${i}`}
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => select(address)}
            >
              <strong>{address.label}</strong>
              <small>{accuracyLabel(address)}</small>
            </li>
          ))}
        </ul>
        <p id={`${id}-status`} role="status">
          {status}
        </p>
        {error?.retry && !pending && (
          <button
            type="button"
            className="text-link"
            onClick={() => result.refetch()}
          >
            Erneut versuchen
          </button>
        )}
      </div>
    </form>
  );
}
