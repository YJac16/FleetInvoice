"use client";

import { Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SEARCH_DEBOUNCE_MS,
  isSearchableQuery,
  newSessionToken,
  retrievePlaceText,
  suggestPlaces,
  type PlaceSuggestion,
} from "@/features/places/lib/search-box";
import { MAX_PLACE_LENGTH } from "@/features/trips/lib/trip-route-text";
import { cn } from "@/lib/utils";

type Status = "idle" | "loading" | "error" | "empty" | "results";

export type PlacePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Mapbox public token. Search runs only when `searchEnabled` and set. */
  accessToken?: string;
  /** Feature flag. When false this is a plain, required text input. */
  searchEnabled: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** Test seam. */
  fetchImpl?: typeof fetch;
};

/**
 * Mobile-first combobox for a pickup / drop-off place.
 *
 * Free text ALWAYS works: whatever is typed is the value. Mapbox suggestions
 * are an optional convenience; on error / no coverage / no network the user
 * simply keeps their own text. Only the visible, editable text is stored.
 */
export function PlacePicker({
  label,
  value,
  onChange,
  accessToken,
  searchEnabled,
  required,
  placeholder,
  className,
  fetchImpl,
}: PlacePickerProps) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const statusId = `${uid}-status`;

  const canSearch = searchEnabled && Boolean(accessToken);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // One Search Box session per pick (suggest... then a single retrieve).
  const sessionRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cancelInFlight, [cancelInFlight]);

  useEffect(() => {
    if (!canSearch) return;
    if (!isSearchableQuery(query)) {
      cancelInFlight();
      setSuggestions([]);
      setStatus("idle");
      return;
    }
    const timer = setTimeout(async () => {
      cancelInFlight();
      const controller = new AbortController();
      abortRef.current = controller;
      sessionRef.current ??= newSessionToken();
      setStatus("loading");
      try {
        const results = await suggestPlaces(query, {
          accessToken: accessToken!,
          sessionToken: sessionRef.current,
          signal: controller.signal,
          fetchImpl,
        });
        if (controller.signal.aborted) return;
        setSuggestions(results);
        setActive(-1);
        setStatus(results.length ? "results" : "empty");
      } catch {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setStatus("error");
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, canSearch, accessToken, fetchImpl, cancelInFlight]);

  function handleInput(next: string) {
    onChange(next);
    setQuery(next);
    setOpen(true);
  }

  async function pick(suggestion: PlaceSuggestion) {
    const session = sessionRef.current ?? newSessionToken();
    // Optimistic: fill immediately so the user is never blocked on retrieve.
    const fallbackText = suggestion.name.slice(0, MAX_PLACE_LENGTH);
    onChange(fallbackText);
    setQuery("");
    setSuggestions([]);
    setStatus("idle");
    setOpen(false);
    setActive(-1);
    cancelInFlight();
    sessionRef.current = null; // next search starts a new session
    try {
      const text = await retrievePlaceText(suggestion, {
        accessToken: accessToken!,
        sessionToken: session,
        fetchImpl,
      });
      onChange(text);
    } catch {
      // Keep the optimistic text; the user can edit it freely.
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!canSearch) return;
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // pick instead of submitting the form
      void pick(suggestions[active]);
    }
  }

  const showList = canSearch && open && suggestions.length > 0;
  const statusText =
    status === "loading"
      ? "Searching places…"
      : status === "error"
        ? "Place search unavailable — type the place yourself."
        : status === "empty"
          ? "No matches — keep what you typed."
          : "";

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={inputId} className="text-zinc-300">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Let a tap on an option register before closing.
            setTimeout(() => setOpen(false), 150);
          }}
          className="border-zinc-700 bg-zinc-900"
          required={required}
          maxLength={MAX_PLACE_LENGTH}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="next"
          {...(canSearch
            ? {
                role: "combobox",
                "aria-autocomplete": "list" as const,
                "aria-expanded": showList,
                "aria-controls": listId,
                "aria-describedby": statusId,
                "aria-activedescendant":
                  showList && active >= 0 ? `${listId}-${active}` : undefined,
              }
            : {})}
        />
        {canSearch && status === "loading" ? (
          <Loader2
            aria-hidden
            className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-zinc-400"
          />
        ) : null}
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} suggestions`}
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.mapboxId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // onMouseDown keeps focus in the input so blur doesn't win.
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(s);
                }}
                className={cn(
                  "min-h-11 cursor-pointer px-3 py-2 text-sm text-zinc-100",
                  i === active && "bg-zinc-800"
                )}
              >
                <div className="font-medium">{s.name}</div>
                {s.placeFormatted ? (
                  <div className="text-xs text-zinc-400">{s.placeFormatted}</div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p id={statusId} role="status" aria-live="polite" className="min-h-4 text-xs text-zinc-400">
        {canSearch ? statusText : ""}
      </p>
    </div>
  );
}
