import schemaSql from "./migrations/0001_schema.sql";
import seedSql from "./migrations/0002_seed.sql";
import { recalculateAllElo } from "./elo";

/**
 * Der Worker richtet die Datenbank selbst ein – es muss nichts lokal oder per
 * Kommandozeile ausgeführt werden. Beim ersten Request nach einem Deploy wird
 * geprüft, welche Migrationen fehlen, und diese werden einmalig angewendet.
 *
 * Neue Schema-Änderungen: einfach unten in MIGRATIONS anhängen (nie bestehende ändern!).
 */
const MIGRATIONS: Array<{ name: string; sql: string; recalcElo?: boolean }> = [
  { name: "0001_schema", sql: schemaSql },
  { name: "0002_seed", sql: seedSql, recalcElo: true },
];

/** Zerlegt eine SQL-Datei in einzelne Statements (eins pro ";" am Zeilenende). */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  for (const line of sql.split(/\r?\n/)) {
    if (current.length === 0 && (line.trim() === "" || line.trim().startsWith("--"))) continue;
    current.push(line);
    if (line.trimEnd().endsWith(";")) {
      statements.push(current.join("\n"));
      current = [];
    }
  }
  if (current.join("").trim() !== "") statements.push(current.join("\n"));
  return statements;
}

async function runMigrations(db: D1Database): Promise<void> {
  await db
    .prepare("CREATE TABLE IF NOT EXISTS _app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
    .run();
  const { results } = await db.prepare("SELECT name FROM _app_migrations").all<{ name: string }>();
  const applied = new Set(results.map((r) => r.name));

  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    const statements = splitStatements(m.sql).map((s) => db.prepare(s));
    // Migrations-Eintrag im selben Batch -> atomar. Laufen zwei Requests gleichzeitig,
    // scheitert der zweite am PRIMARY KEY und rollt komplett zurück.
    statements.push(
      db.prepare("INSERT INTO _app_migrations (name, applied_at) VALUES (?, datetime('now'))").bind(m.name)
    );
    try {
      await db.batch(statements);
    } catch (e) {
      const again = await db.prepare("SELECT 1 FROM _app_migrations WHERE name = ?").bind(m.name).first();
      if (again) continue; // wurde parallel von einem anderen Request erledigt
      throw new Error(`Migration ${m.name} fehlgeschlagen: ${(e as Error).message}`);
    }
    console.log(`Migration ${m.name} angewendet.`);
    if (m.recalcElo) await recalculateAllElo(db);
  }
}

let ready: Promise<void> | null = null;

/** Einmal pro Worker-Instanz ausführen; bei Fehler beim nächsten Request erneut versuchen. */
export function ensureMigrated(db: D1Database): Promise<void> {
  if (!ready) {
    ready = runMigrations(db).catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}
