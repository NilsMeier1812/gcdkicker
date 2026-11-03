import { esc } from "../util";

type LayoutOptions = {
  title: string;
  path: string;
  head?: string;
  content: string;
  scripts?: string;
};

const ICONS: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
};

export function icon(name: keyof typeof ICONS | string, size = 22): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

const NAV = [
  { href: "/", label: "Eintragen", icon: "plus" },
  { href: "/overview", label: "Übersicht", icon: "list" },
  { href: "/players", label: "Spieler", icon: "users" },
  { href: "/statistics", label: "Statistik", icon: "chart" },
];

export function layout({ title, path, head = "", content, scripts = "" }: LayoutOptions): string {
  const nav = NAV.map(
    (n) =>
      `<a href="${n.href}"${path === n.href ? ' class="active" aria-current="page"' : ""}>${icon(n.icon)}<span>${n.label}</span></a>`
  ).join("\n      ");

  return `<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#11191f" />
  <title>${esc(title)} · GCD Kicker</title>
  <link rel="icon" href="data:," />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1.5.13/css/pico.min.css" />
  <link rel="stylesheet" href="/css/app.css?v=3" />
  ${head}
</head>
<body>
  <header class="app-header">
    <div class="container app-header-inner">
      <a href="/" class="brand">GCD Kicker</a>
      <nav class="app-nav" aria-label="Hauptnavigation">
      ${nav}
      </nav>
    </div>
  </header>
  <main class="container">
${content}
  </main>
  ${scripts}
</body>
</html>`;
}

/** Hinweisbox oben auf einer Seite. */
export function flash(kind: "success" | "error" | "info", text: string): string {
  return `<div class="flash flash-${kind}" role="${kind === "error" ? "alert" : "status"}">${esc(text)}</div>`;
}

/** Fehlerseite im normalen Layout statt nacktem Text. */
export function errorPage(message: string, back = "/"): string {
  return layout({
    title: "Fehler",
    path: "",
    content: `
  <div class="page-head"><h1>Das hat nicht geklappt</h1></div>
  ${flash("error", message)}
  <a href="${esc(back)}" role="button" class="secondary btn-auto">Zurück</a>`,
  });
}
