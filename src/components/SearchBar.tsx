import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface SearchBarProps {
  large?: boolean;
  defaultValue?: string;
}

export function SearchBar({ large = false, defaultValue = "" }: SearchBarProps) {
  const [query, setQuery] = useState(defaultValue);
  const navigate = useNavigate();

  const handleSearch = () => {
    if (query.trim()) navigate(`/suche?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className={`flex gap-2 w-full ${large ? "max-w-2xl" : "max-w-md"}`}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={large ? 20 : 18} />
        <Input
          placeholder="Adresse, Vermieter, Stadtteil oder PLZ..."
          className={`pl-10 ${large ? "h-12 text-base" : "h-10"}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
      </div>
      <Button onClick={handleSearch} className={large ? "h-12 px-8" : ""}>
        Suchen
      </Button>
    </div>
  );
}
