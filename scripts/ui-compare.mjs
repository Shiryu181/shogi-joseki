#!/usr/bin/env node
/**
 * アプリの画面(ui-audit/screens)と確定版モック(mockup-final.html)を並べた比較表を作る。
 * 先に `npm run ui-audit` で画面を撮っておくこと。
 * 出力: ui-audit/compare-light.png / compare-dark.png(左=モック、右=アプリ。1組ずつラベル付き)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "ui-audit");
const TMP = path.join(OUT, "_cmp");

/** [モックの番号, アプリの場面名] */
const PAIRS = [
  [1, "home-due"], [2, "home-nodue"], [3, "home-first"], [4, "strategy"], [5, "strategy-sheet"], [6, "exam-list"], [7, "chapter"],
  [8, "learn-opponent-auto"], [9, "learn-your-turn"], [10, "learn-wrong-1"], [11, "learn-wrong-2"], [12, "learn-correct"],
  [13, "learn-correct-expanded"], [14, "learn-accepted"], [15, "learn-demo"], [16, "learn-deviation"], [17, "learn-chapter-complete"],
  [18, "review-question"], [19, "review-hint"], [20, "review-end"], [21, "exam-question"], [22, "exam-result-pass"], [23, "exam-result-fail"],
  [24, "settings"], [25, "about"],
];
const ORDER = fs.readFileSync(path.join(ROOT, "scripts/ui-audit.mjs"), "utf8").match(/const ORDER = \[([\s\S]*?)\];/)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));

function findChromium() {
  const base = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  dirs.sort((a, b) => (b === "chromium-1194") - (a === "chromium-1194"));
  for (const d of dirs) for (const sub of ["chrome-mac-arm64", "chrome-mac"]) {
    const p = path.join(base, d, sub, "Chromium.app", "Contents", "MacOS", "Chromium");
    if (fs.existsSync(p)) return p;
  }
  throw new Error("Chromium が見つかりません");
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
try {
  const mp = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  await mp.goto("file://" + path.join(ROOT, "mockup-final.html"));
  for (const theme of ["light", "dark"]) {
    await mp.click(`#t-${theme}`);
    await mp.waitForTimeout(300);
    const frames = mp.locator(".frame");
    for (const [no] of PAIRS) await frames.nth(no - 1).screenshot({ path: path.join(TMP, `m-${theme}-${no}.png`) });
  }
  await mp.close();

  for (const theme of ["light", "dark"]) {
    const cells = PAIRS.map(([no, name]) => {
      const nn = String(ORDER.indexOf(name) + 1).padStart(2, "0");
      const app = path.join(OUT, "screens", theme, `${nn}-${name}.png`);
      const has = fs.existsSync(app);
      const url = (f) => "file://" + f;
      return `<div class="c"><div class="l">${String(no).padStart(2, "0")} ${name}</div><div class="p"><img src="${url(path.join(TMP, `m-${theme}-${no}.png`))}"><img ${has ? `src="${url(app)}"` : ""}></div></div>`;
    }).join("");
    const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:${theme === "light" ? "#fff" : "#111"};color:${theme === "light" ? "#000" : "#eee"};font:14px sans-serif}
      .g{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:14px;width:1760px}.l{font-weight:700;margin-bottom:4px}
      .p{display:flex;gap:4px;align-items:flex-start}.p img{width:211px;height:auto;display:block;border:1px solid #888}</style><div class="g">${cells}</div>`;
    const f = path.join(TMP, `sheet-${theme}.html`);
    fs.writeFileSync(f, html);
    const pg = await browser.newPage({ viewport: { width: 1760, height: 900 } });
    await pg.goto("file://" + f);
    await pg.waitForTimeout(800);
    await pg.screenshot({ path: path.join(OUT, `compare-${theme}.png`), fullPage: true });
    await pg.close();
  }
} finally {
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log("done");
