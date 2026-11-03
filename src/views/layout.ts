import { esc } from "../util";

type LayoutOptions = {
  title: string;
  path: string;
  /** Name der Seiten-Styles unter /css/<name>.css */
  css?: string;
  head?: string;
  content: string;
  scripts?: string;
};

const NAV = [
  { href: "/", label: "Eintragen" },
  { href: "/overview", label: "Übersicht" },
  { href: "/players", label: "Spieler" },
  { href: "/statistics", label: "Statistik" },
];

export function layout({ title, path, css, head = "", content, scripts = "" }: LayoutOptions): string {
  const nav = NAV.map(
    (n) => `<li><a href="${n.href}"${path === n.href ? ' class="active"' : ""}>${n.label}</a></li>`
  ).join("\n      ");

  return `<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css" />
  <link rel="stylesheet" href="/css/base.css" />
  ${css ? `<link rel="stylesheet" href="/css/${css}.css" />` : ""}
  ${head}
</head>
<body>
  <nav class="container-fluid">
    <ul class="tabs">
      ${nav}
    </ul>
  </nav>
  <main class="container">
${content}
  </main>
  ${scripts}
</body>
</html>`;
}
