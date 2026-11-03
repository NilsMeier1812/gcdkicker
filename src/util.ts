export type Env = { DB: D1Database };

/** HTML-Escaping für alle dynamischen Werte in Templates. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON sicher in ein <script>-Tag einbetten. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** Pythons round(): "Banker's Rounding" (round half to even) – wie im alten Flask-Code. */
export function pyRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Zeitstempel im selben Format wie Pythons datetime (UTC): "YYYY-MM-DD HH:MM:SS.ffffff". */
export function nowTimestamp(): string {
  const iso = new Date().toISOString(); // 2026-11-03T10:15:30.123Z
  return iso.replace("T", " ").replace("Z", "") + "000";
}

/** Parst einen gespeicherten Zeitstempel (UTC) in ein Date-Objekt. */
export function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

const TZ = "Europe/Berlin";

export function formatDayMonth(d: Date): string {
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${day}.${month}.`;
}

export function formatDateTime(raw: string | null | undefined): string {
  const d = parseTimestamp(raw);
  if (!d) return raw ?? "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
