#!/usr/bin/env node
/**
 * 通しの動作確認。実際に盤のマスを押して、記録なしの状態から
 * ホーム → 戦法 → 章 → 学習(正解・誤答2回・許容手)→ 第一章を終える → 復習 → 認定試験 → 設定(テーマ)→ このアプリについて
 * まで一通り通す。コンソールエラー・ページエラーがあれば失敗にする。
 * 使い方: node scripts/ui-playthrough.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[play]", ...a);

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

const RANK = "一二三四五六七八九";
const cellLabel = (sq) => `${sq[0]}${RANK["abcdefghi".indexOf(sq[1])]}`;
const errors = [];
const problems = [];
const check = (ok, msg) => { log(ok ? "OK  " : "NG  ", msg); if (!ok) problems.push(msg); };

const server = await createServer({ root: ROOT, logLevel: "warn", clearScreen: false, server: { host: "127.0.0.1", port: 5291, strictPort: false, hmr: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const btn = (re) => page.getByRole("button", { name: re }).first();
const click = async (re) => { await btn(re).click(); await sleep(250); };
const text = () => page.evaluate(() => document.body.innerText);

/** USI の手を、盤のマス(と持ち駒)を押して指す。 */
async function playUsi(usi) {
  if (usi[1] === "*") {
    await page.locator('button[aria-label^="持ち駒"]').first().click();
    await page.locator(`button.cell[aria-label="${cellLabel(usi.slice(2, 4))}"]`).click();
  } else {
    await page.locator(`button.cell[aria-label="${cellLabel(usi.slice(0, 2))}"]`).click();
    await page.locator(`button.cell[aria-label="${cellLabel(usi.slice(2, 4))}"]`).click();
  }
  await sleep(250);
  // 成る・成らずの選択が出たら、手に合わせて選ぶ
  const dlg = page.locator('[role="dialog"][aria-label="成りますか"]');
  if (await dlg.count()) await dlg.getByRole("button", { name: usi.endsWith("+") ? /成る/ : /成らない|不成/ }).first().click();
}
const learnState = () => page.evaluate(async () => {
  const { useLearnStore: LS } = await import("/src/store/learnStore.ts");
  const s = LS.getState();
  const main = s.currentNode.branches.find((b) => b.kind === "main") ?? s.currentNode.branches[0] ?? null;
  const legal = [];
  for (const [f, ds] of s.moveDests) for (const d of ds) legal.push(f + d.usi);
  return {
    phase: s.chapterDone ? "complete" : s.pendingAck ? "result" : s.bookQuiz ? "question" : "wait",
    usi: main?.usi, alt: (main?.accepted || []).find((u) => u !== main.usi) ?? null,
    misses: s.bookQuiz?.misses ?? 0, wrongKind: s.bookQuiz?.wrong?.kind ?? null, legal,
  };
});

try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".app-shell");
  check((await text()).includes("今日の復習はありません"), "ホーム(はじめて)");

  // 戦法 → 章 → 学習
  await click(/この戦法で学ぶ/);
  await page.waitForSelector(".strategy-screen");
  await page.locator(".dj-rows li button").first().click();
  await page.waitForSelector(".chapter-screen");
  check((await text()).includes("第一章"), "章のページ(第一章)");
  await click(/学習をはじめる|続きから/);
  await page.waitForSelector(".learn-wrap");

  let q = 0, wrongDone = false, accDone = false, sawWrongMsg = false, sawAnswerArrow = false, sawAccMsg = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const st = await learnState();
    if (st.phase === "complete") break;
    if (st.phase === "result") { await click(/^次へ$/); continue; }
    if (st.phase !== "question") { await sleep(120); continue; }
    q++;
    if (!wrongDone && q === 2) {
      // 定跡手でも許容手でもない手(誤答が "bad" になる手)を2回続けて指す
      const cands = st.legal.filter((u) => u !== st.usi && u !== st.alt);
      let missesNow = 0, ci = 0, firstText = "";
      while (missesNow < 2 && ci < cands.length) {
        await playUsi(cands[ci++]);
        const s2 = await learnState();
        if (s2.phase !== "question") break;
        if (s2.wrongKind !== "bad") continue; // 許容手などを踏んだ。次の候補へ
        if (missesNow === 0) { firstText = await text(); sawWrongMsg = firstText.includes("定跡の手ではありません"); }
        missesNow = s2.misses;
      }
      const t = await text();
      sawAnswerArrow = t.includes("答えは") && /矢印のとおり/.test(t);
      check(sawWrongMsg, "誤答1回目: ×の一行が出て、もう一度指せる");
      check(sawAnswerArrow, "誤答2回目: 答えと矢印、「この手を指すとどうなる？」が出る");
      wrongDone = true;
    }
    if (!accDone && st.alt) {
      await playUsi(st.alt);
      const t = await text();
      sawAccMsg = t.includes("その手も悪くありません");
      check(sawAccMsg, "許容手: 「その手も悪くありません」と定跡の手が出る");
      accDone = true;
      // 許容手のあとも定跡の手を指して進める
      await playUsi(st.usi);
      continue;
    }
    await playUsi(st.usi);
  }
  const done = await text();
  check(done.includes("終えました"), "第一章を終えた画面");
  check(done.includes("戦法のページへ戻る") || done.includes("次の章へ"), "終了画面の遷移ボタン");

  // 戦法のページへ戻る → 章の状態
  await click(/戦法のページへ戻る|次の章へ/);
  if (await page.locator(".learn-wrap").count()) await click(/◀ やめる|◀ 戻る/);
  await page.waitForSelector(".strategy-screen, .chapter-screen, .home-screen", { timeout: 5000 }).catch(() => {});

  // 復習: 解いた問題の期日を昨日にして、ホームから始める
  await page.evaluate(() => {
    const K = "joseki-dojo:progress:v1";
    const saved = JSON.parse(localStorage.getItem(K));
    const y = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    for (const v of Object.values(saved.items)) v.due = y;
    localStorage.setItem(K, JSON.stringify(saved));
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".app-shell");
  const home = await text();
  check(/今日の復習/.test(home) && /はじめる/.test(home), "ホーム(復習あり): 「はじめる」が出る");
  await click(/^はじめる$/);
  await page.getByRole("button", { name: /ヒント/ }).first().waitFor();
  const reviewSt = () => page.evaluate(async () => {
    const { useReviewStore: R } = await import("/src/store/reviewStore.ts");
    const s = R.getState(); const c = s.cards[s.index];
    const legal = []; for (const [f, ds] of s.moveDests) for (const d of ds) legal.push(f + d.usi);
    return { done: s.done, solved: !!s.result, usi: c?.usi, legal, i: s.index };
  });
  // 1問目: ヒントを開いて正解
  let rs = await reviewSt();
  await click(/ヒント/);
  check((await text()).includes("ヒント"), "復習: ヒントが開く");
  await playUsi(rs.usi);
  check((await page.getByRole("button", { name: /次の問題|結果|次へ/ }).count()) > 0, "復習: 正解のあと次へ進むボタン");
  // 数問解く
  for (let k = 0; k < 3; k++) {
    rs = await reviewSt();
    if (rs.done) break;
    if (!rs.solved) await playUsi(rs.usi);
    const next = page.getByRole("button", { name: /次の問題|次へ|結果/ }).first();
    if (await next.count()) await next.click();
    await sleep(300);
  }
  await click(/◀ やめる|◀ 戻る|◀ ホーム/);
  await sleep(300);
  check((await text()).includes("定跡道場"), "復習をやめてホームへ戻る");

  // 認定試験: 戦法のページ → 試験一覧 → 第一章
  await page.locator(".home-learning__body, .home-strategy, [class*=home-]").first().waitFor();
  await page.evaluate(async () => {}); // 画面安定待ち
  const learningCard = page.locator(".home-learning__body");
  if (await learningCard.count()) await learningCard.click(); else await click(/ゴキゲン中飛車/);
  await page.waitForSelector(".strategy-screen");
  await page.locator(".sp-exam").click();
  await page.waitForSelector(".exam-list-screen");
  check((await page.getByRole("button", { name: /^受ける$|再挑戦/ }).count()) > 0, "試験の一覧: 第一章に「受ける」");
  await click(/^受ける$/);
  const examSt = () => page.evaluate(async () => {
    const { useExamStore: E } = await import("/src/store/examStore.ts");
    const s = E.getState(); const c = s.cards[s.index];
    return { finished: s.finished, usi: c?.usi, i: s.index };
  });
  for (let k = 0; k < 12; k++) {
    const es = await examSt();
    if (es.finished) break;
    await playUsi(es.usi);
    await sleep(300);
    const nx = page.getByRole("button", { name: /^次へ$|次の問題/ });
    if (await nx.count()) await nx.first().click();
    await sleep(200);
  }
  const ex = await text();
  check(/合格|不合格/.test(ex), "試験の結果画面: " + (ex.includes("不合格") ? "不合格" : "合格"));
  const leaveExam = page.getByRole("button", { name: /認定試験の一覧へ戻る|章のページへ戻る/ });
  if (await leaveExam.count()) await leaveExam.first().click();
  await sleep(300);
  await page.waitForSelector(".exam-list-screen");
  await click(/◀ 戻る/);
  await page.waitForSelector(".strategy-screen");
  await click(/◀ ホーム/);
  await page.waitForSelector(".home-screen");

  // 設定: テーマ切替
  await page.locator(".home-gear").click();
  await page.waitForSelector(".set-screen");
  const bgOf = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ground").trim());
  await page.getByRole("radio", { name: /明るい/ }).click();
  const light = await bgOf();
  await page.getByRole("radio", { name: /暗い/ }).click();
  const dark = await bgOf();
  check(light !== dark && (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark", `テーマ切替(${light} → ${dark})`);
  const st = await text();
  check(/解いた問題/.test(st) && /覚えた問題/.test(st) && /合格した章/.test(st) && !/連続|ポイント|学習した日/.test(st), "設定: 3つの数だけ、連続日数・ポイントなし");
  await page.getByRole("radio", { name: /端末に合わせる/ }).click();
  // このアプリについて(設定から)
  await click(/^このアプリについて$/);
  await page.waitForSelector(".about-screen");
  const hrefs = await page.locator(".about a.link-row").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  check(hrefs.length >= 6 && hrefs.every(Boolean), `このアプリについて: 外部リンク${hrefs.length}件`);
  await click(/◀ 戻る/);
  await page.waitForSelector(".set-screen");
  check(true, "このアプリについて → 設定へ戻る");
  // 記録を消す(確認ダイアログ)
  await click(/学習の記録を消す/);
  check((await page.locator(".dj-modal").count()) === 1, "記録を消す: 確認ダイアログ");
  await click(/^やめる$/);
  await click(/◀ 戻る/);
} catch (e) {
  problems.push("例外: " + e.message);
  await page.screenshot({ path: path.join(ROOT, "ui-audit", "_playthrough-fail.png") }).catch(() => {});
} finally {
  await browser.close();
  await server.close();
}
const real = errors.filter((e) => !/favicon|Failed to load resource.*(404)/i.test(e));
if (real.length) { log("コンソール/ページエラー:", real.slice(0, 10)); problems.push(`エラー${real.length}件`); }
log(problems.length ? "失敗: " + problems.join(" / ") : "すべて通りました");
process.exit(problems.length ? 1 : 0);
