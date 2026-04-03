import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ConsentPreferences = {
  essential: true;
  externalMedia: boolean;
};

type ConsentContextValue = {
  consent: ConsentPreferences | null;
  hasAnswered: boolean;
  canLoadExternalMedia: boolean;
  acceptAll: () => void;
  rejectOptional: () => void;
};

const CONSENT_STORAGE_KEY = "wohnweise-consent-v1";

const ConsentContext = createContext<ConsentContextValue | null>(null);

function readStoredConsent(): ConsentPreferences | null {
  if (typeof window === "undefined") return null;

  const rawValue = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  if (!rawValue) return null;

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<ConsentPreferences>;

    if (typeof parsedValue.externalMedia !== "boolean") return null;

    return {
      essential: true,
      externalMedia: parsedValue.externalMedia,
    };
  } catch {
    return null;
  }
}

function writeStoredConsent(consent: ConsentPreferences) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentPreferences | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setConsent(readStoredConsent());
    setHasHydrated(true);
  }, []);

  const value = useMemo<ConsentContextValue>(() => {
    const updateConsent = (nextConsent: ConsentPreferences) => {
      setConsent(nextConsent);
      writeStoredConsent(nextConsent);
    };

    return {
      consent,
      hasAnswered: hasHydrated && consent !== null,
      canLoadExternalMedia: consent?.externalMedia ?? false,
      acceptAll: () => updateConsent({ essential: true, externalMedia: true }),
      rejectOptional: () => updateConsent({ essential: true, externalMedia: false }),
    };
  }, [consent, hasHydrated]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent() {
  const context = useContext(ConsentContext);

  if (!context) {
    throw new Error("useConsent must be used within ConsentProvider");
  }

  return context;
}
