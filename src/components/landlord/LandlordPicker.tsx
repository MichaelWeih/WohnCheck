import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { suggestDirectory } from "@/features/directory/directory-api";

export interface PickedLandlord {
  id: string;
  label: string;
  sublabel: string;
}

/**
 * Accessible combobox that searches the landlord directory on the server (fuzzy, all entries, not only the first
 * page). Used wherever a landlord has to be chosen: reviews, address reports, landlord accounts.
 */
export function LandlordPicker({
  value,
  onChange,
  label = "Vermieter oder Hausverwaltung",
  placeholder = "Firmennamen eingeben, z. B. Vonovia",
  disabled = false,
}: {
  value: PickedLandlord | null;
  onChange: (landlord: PickedLandlord | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value?.label ?? "");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => setText(value?.label ?? ""), [value?.id, value?.label]);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const query = useQuery({
    queryKey: ["landlord-suggest", debounced],
    queryFn: ({ signal }) => suggestDirectory(debounced, signal),
    enabled: open && debounced.length >= 2 && debounced !== value?.label,
    staleTime: 60_000,
  });
  const options = (query.data?.suggestions ?? []).filter((s) => s.type === "landlord");
  const expanded = open && debounced.length >= 2 && debounced !== value?.label;

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange({ id: option.id, label: option.label, sublabel: option.sublabel });
    setText(option.label);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="landlord-picker" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <label htmlFor={id} className="field-label">{label}</label>
      <input
        id={id}
        className="field-input"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
          if (value) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!options.length) return;
            setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
          }
          if (e.key === "Enter" && expanded && active >= 0) {
            e.preventDefault();
            choose(active);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {expanded && (
        <div className="picker-popover">
          <ul id={`${id}-list`} role="listbox" aria-label="Vermieter im Verzeichnis">
            {options.map((option, index) => (
              <li
                key={option.id}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={active === index}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <strong>{option.label}</strong>
                <small>{option.sublabel}</small>
              </li>
            ))}
          </ul>
          <p role="status" className="picker-status">
            {query.isFetching ? "Suche läuft …" : options.length ? "Mit ↑ ↓ auswählen" : "Kein Eintrag im Verzeichnis gefunden."}
          </p>
        </div>
      )}
    </div>
  );
}
