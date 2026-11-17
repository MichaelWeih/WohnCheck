import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { searchDirectory } from "@/features/directory/directory-api";
import { adaptSearchResults } from "@/features/directory/directory-adapter";

import { resultRoutes } from "@/features/directory/routes";
export function SearchBar({ large = false, defaultValue = "", scope = "all" }: { large?: boolean; defaultValue?: string; scope?: string }) {
  const [query, setQuery] = useState(defaultValue);
  const [debounced, setDebounced] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const navigate = useNavigate();
  useEffect(() => { setQuery(defaultValue); setOpen(false); setActive(-1); }, [defaultValue]);
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 220); return () => clearTimeout(timer); }, [query]);
  const suggestions = useQuery({ queryKey: ["directory-search", debounced], queryFn: () => searchDirectory(debounced), enabled: open && debounced.length >= 2, staleTime: 30_000, retry: 1 });
  const results = suggestions.data && query.trim() === debounced ? adaptSearchResults(suggestions.data).filter(item => scope === "all" || item.type === scope).slice(0, 5) : [];
  const expanded = open && query.trim().length >= 2;
  function submit() {
    setOpen(false);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (scope !== "all") params.set("type", scope);
    navigate(`/suche${params.size ? `?${params}` : ""}`);
  }
  return <form role="search" className={`search-control ${large ? "search-control-large" : ""}`} onSubmit={e => { e.preventDefault(); if (expanded && active >= 0 && results[active]) { const item = results[active]; setOpen(false); navigate(resultRoutes[item.type] + item.id); } else submit(); }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <div className="search-field">
      <Search size={20} aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>Adresse, Wohngegend oder Vermieter suchen</label>
      <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-results`} aria-activedescendant={expanded && active >= 0 && results[active] ? `${id}-option-${active}` : undefined} autoComplete="off" placeholder="Adresse, Ort oder Vermieter suchen" value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); setActive(-1); }} onKeyDown={e => {
        if (e.key === "Escape") { setOpen(false); setActive(-1); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive(current => results.length ? (current < 0 ? (e.key === "ArrowDown" ? 0 : results.length - 1) : (current + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length) : -1); }
      }} />
      {query && <button type="button" className="clear-search" aria-label="Suchfeld leeren" onClick={() => { setQuery(""); setActive(-1); input.current?.focus(); }}><X size={18} /></button>}
      <button type="submit" className="search-submit" aria-label="Suchen"><span>Suchen</span><ArrowRight size={18} /></button>
    </div>
    {expanded && <div className="search-suggestions">
      <ul id={`${id}-results`} role="listbox" aria-label="Suchvorschläge">
        {results.map((item, index) => <li key={`${item.type}-${item.id}`} id={`${id}-option-${index}`} role="option" aria-selected={active === index} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => { setOpen(false); navigate(resultRoutes[item.type] + item.id); }}><span>{item.title}</span><small>{item.subtitle}</small></li>)}
      </ul>
      <p role="status" className="suggestion-status">{suggestions.isFetching || query.trim() !== debounced ? "Suche läuft …" : suggestions.isError ? "Vorschläge nicht verfügbar. Du kannst die Suche trotzdem starten." : !results.length ? "Keine Vorschläge. Mit Enter nach weiteren Treffern suchen." : "Mit ↑ ↓ auswählen und mit Enter öffnen."}</p>
    </div>}
  </form>;
}
