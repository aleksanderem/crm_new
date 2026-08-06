import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "quera_cookie_consent";

type ConsentState = "accepted" | "rejected" | null;

function getStoredConsent(): ConsentState {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "accepted" || v === "rejected") return v;
  } catch {
    // localStorage unavailable (e.g. private browsing with strict settings)
  }
  return null;
}

function storeConsent(value: "accepted" | "rejected") {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

export function CookieConsent() {
  const [consent, setConsent] = useState<ConsentState>(() => getStoredConsent());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Delay banner by one tick so it doesn't flash on pages that immediately
    // redirect (e.g. the index route redirecting to /login).
    const id = setTimeout(() => {
      if (getStoredConsent() === null) setVisible(true);
    }, 200);
    return () => clearTimeout(id);
  }, []);

  if (consent !== null || !visible) return null;

  function handleAccept() {
    storeConsent("accepted");
    setConsent("accepted");
    setVisible(false);
  }

  function handleReject() {
    storeConsent("rejected");
    setConsent("rejected");
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Zgoda na pliki cookie"
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background px-4 py-4 shadow-lg sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Używamy plików cookie niezbędnych do działania serwisu oraz, za Twoją zgodą, plików analitycznych i funkcjonalnych.
          Więcej informacji znajdziesz w naszej{" "}
          <Link to="/privacy" className="text-foreground underline hover:no-underline">
            Polityce prywatności
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={handleReject}>
            Odrzuć
          </Button>
          <Button size="sm" onClick={handleAccept}>
            Akceptuj wszystkie
          </Button>
        </div>
      </div>
    </div>
  );
}
