#!/usr/bin/env node
/**
 * UI 監査用の素材集め。スマホ幅(390x844)・ライト/ダークで全画面・全状態を撮り、
 * その場で文字のコントラスト・タップ領域・色・字・文言・数字・アニメーションを計測する。
 *
 * 使い方: npm run ui-audit
 * 出力   : ui-audit/ (screens/, contact-*.png, metrics.json, strings.json, summary.md)
 *
 * アプリのソースは変えない。Vite の開発サーバーをこのスクリプトから起動し、
 * playwright-core でキャッシュ済みの Chromium を動かす。
 * 画面へは UI を実際に押して到達する(学習の局面操作だけは store を直接呼ぶ)。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "ui-audit");
const T0 = Date.now();
const THEMES = ["light", "dark"];
const VIEWPORT = { width: 390, height: 844 };

/** 撮る状態の並び。番号(NN)はこの並びで決まる。 */
const ORDER = [
  "dashboard-fresh", "home", "side-both", "about",
  "settings-fresh", "exam-list-fresh",
  "learn-opponent-moving", "learn-first-question", "learn-piece-selected", "learn-wrong",
  "learn-trymove", "learn-accepted", "learn-correct-explain", "learn-revealed", "learn-chapter-complete",
  "learn-sente-first-question", "learn-chapter-intro",
  "learn-correct-demo-button", "learn-demo-playing", "learn-demo-finished",
  "learn-opponent-wait-branchnav", "learn-branch-selected",
  "learn-deviation-quiz", "learn-deviation-wrong", "learn-deviation-solved", "learn-all-done",
  "dashboard-records", "dashboard-all-done",
  "review-question", "review-wrong", "review-accepted", "review-correct", "review-result",
  "exam-list", "exam-question", "exam-result-pass", "exam-list-after", "exam-result-fail",
  "settings", "settings-confirm",
];
const ORDER_NUM = Object.fromEntries(ORDER.map((n, i) => [n, i + 1]));

const unreached = []; // {state, reason}
const metrics = { meta: {}, states: {}, pageErrors: [] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[ui-audit ${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

// ─────────────────────────────────────────────────────────────
// ブラウザの場所
// ─────────────────────────────────────────────────────────────
function findChromium() {
  if (process.env.UI_AUDIT_CHROMIUM) return process.env.UI_AUDIT_CHROMIUM;
  const base = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  // playwright-core 1.56 は revision 1194 を期待する。あればそれを優先。
  dirs.sort((a, b) => (b === "chromium-1194") - (a === "chromium-1194"));
  for (const d of dirs) {
    for (const sub of ["chrome-mac-arm64", "chrome-mac"]) {
      const p = path.join(base, d, sub, "Chromium.app", "Contents", "MacOS", "Chromium");
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error("Chromium が見つかりません。UI_AUDIT_CHROMIUM で実行ファイルを指定してください。");
}

// ─────────────────────────────────────────────────────────────
// ページ内で動かす計測関数(自己完結させること)
// ─────────────────────────────────────────────────────────────
function measureInPage() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const parse = (c) => {
    if (cache.has(c)) return cache.get(c);
    let r;
    const m = /^rgba?\(([^)]+)\)$/.exec(c);
    if (m && !m[1].includes("%")) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
      r = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    } else {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = "#000";
      cx.fillStyle = c;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      r = [d[0], d[1], d[2], d[3] / 255];
    }
    cache.set(c, r);
    return r;
  };
  const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  const hex = (rgba) => "#" + hex2(rgba[0]) + hex2(rgba[1]) + hex2(rgba[2]) + (rgba[3] < 0.995 ? hex2(rgba[3] * 255) : "");
  const over = (top, bot) => {
    const a = top[3];
    return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1];
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratioOf = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const sel = (el) => {
    const c = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
    return el.tagName.toLowerCase() + (c ? "." + c : "");
  };

  /** 要素の実効背景色。不透明な背景に当たるまで祖先をたどり、半透明は下から重ねる。 */
  const effBg = (el) => {
    const layers = [];
    let bgImg = false;
    let e = el;
    let opaque = false;
    while (e && e.nodeType === 1) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      if (cs.backgroundImage && cs.backgroundImage !== "none") bgImg = true;
      if (c[3] > 0) {
        layers.push(c);
        if (c[3] >= 0.995) { opaque = true; break; }
      }
      e = e.parentElement;
    }
    let base = [255, 255, 255, 1];
    if (!opaque) {
      // 何も不透明でなければ、ブラウザの下地(色の方式に応じた白/黒)。
      const sch = getComputedStyle(document.documentElement).colorScheme || "";
      if (sch.includes("dark") && !sch.includes("light")) base = [18, 18, 18, 1];
    }
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { rgba: base, bgImg };
  };
  const chainOpacity = (el) => {
    let o = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
    return o;
  };
  const visibleBox = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible" || cs.display === "none") return null;
    return r;
  };

  const sy = window.scrollY, sx = window.scrollX;
  const doc = {
    w: window.innerWidth, h: document.documentElement.scrollHeight,
    scrollW: document.documentElement.scrollWidth, vh: window.innerHeight,
  };

  // ── テキスト ──
  const text = [];
  const strings = [];
  const seenStr = new Set();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let n;
  while ((n = tw.nextNode())) {
    const raw = n.nodeValue;
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el) continue;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "OPTION" || tag === "TITLE") continue;
    range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (rects.length === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible") continue;
    const op = chainOpacity(el);
    if (op <= 0.01) continue;
    const bg = effBg(el);
    const col = parse(cs.color);
    const colA = [col[0], col[1], col[2], col[3] * op];
    const fg = over(colA, bg.rgba);
    const ratio = ratioOf(fg, bg.rgba);
    const fs = parseFloat(cs.fontSize);
    const fw = parseInt(cs.fontWeight, 10) || 400;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const transient = op < 0.6; // 出現/消滅の途中(ポイントの +10 など)は判定しない
    const low = !transient && ratio < (large ? 3 : 4.5);
    const r0 = rects[0];
    text.push({
      t: t.slice(0, 80), tag: tag.toLowerCase(), sel: sel(el), fs, fw, ff: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      color: hex(colA), fg: hex(fg), bg: hex(bg.rgba), bgImg: bg.bgImg, op: +op.toFixed(2),
      ratio: +ratio.toFixed(2), large, low, transient,
      dis: !!el.closest("button:disabled,[disabled],.disabled,[aria-disabled=true]"),
      x: Math.round(r0.left + sx), y: Math.round(r0.top + sy),
    });
    if (!seenStr.has(t)) { seenStr.add(t); strings.push(t); }
  }
  // 入力欄の値・placeholder・select の表示値も見える文字として数える
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (!visibleBox(el)) continue;
    let t = "";
    if (el.tagName === "SELECT") t = el.selectedOptions[0]?.textContent?.trim() || "";
    else t = el.value || el.placeholder || "";
    t = t.replace(/\s+/g, " ").trim();
    if (t && !seenStr.has(t)) { seenStr.add(t); strings.push(t); }
  }
  const aria = [];
  for (const el of document.querySelectorAll("[aria-label]")) {
    const a = el.getAttribute("aria-label");
    if (a && !aria.includes(a)) aria.push(a);
  }

  // ── 操作できる要素 ──
  const interSel =
    'button, a, input, select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=radio], [tabindex]:not([tabindex="-1"])';
  const set = new Set(document.querySelectorAll(interSel));
  for (const el of document.body.querySelectorAll("*")) {
    if (set.has(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.cursor !== "pointer") continue;
    const pc = el.parentElement ? getComputedStyle(el.parentElement).cursor : "";
    if (pc !== "pointer") set.add(el);
  }
  const controls = [];
  for (const el of set) {
    const r = visibleBox(el);
    if (!r) continue;
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === "none") continue;
    let label = el.getAttribute("aria-label") || "";
    if (!label) {
      label = (el.tagName === "SELECT" ? (el.selectedOptions[0]?.textContent || "") : el.innerText || el.value || el.getAttribute("title") || el.placeholder || "");
    }
    label = String(label).replace(/\s+/g, " ").trim().slice(0, 40);
    const parent = el.parentElement;
    const pbg = parent ? effBg(parent).rgba : [255, 255, 255, 1];
    const myBg = parse(cs.backgroundColor);
    const bgDiffers =
      myBg[3] > 0.05 &&
      Math.abs(over(myBg, pbg)[0] - pbg[0]) + Math.abs(over(myBg, pbg)[1] - pbg[1]) + Math.abs(over(myBg, pbg)[2] - pbg[2]) > 12;
    let border = false;
    for (const s of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(cs["border" + s + "Width"]) > 0 && cs["border" + s + "Style"] !== "none" && parse(cs["border" + s + "Color"])[3] > 0.05) border = true;
    }
    const shadow = cs.boxShadow && cs.boxShadow !== "none";
    const group = el.closest(".board") ? "board-cell" : el.closest(".tray") ? "hand-piece" : null;
    controls.push({
      tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || "", sel: sel(el), label,
      x: Math.round(r.left + sx), y: Math.round(r.top + sy), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      small: r.width < 44 || r.height < 44,
      pressable: !!(border || bgDiffers || shadow), border: !!border, bgDiffers, shadow: !!shadow,
      disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true" || el.classList.contains("disabled"),
      cursor: cs.cursor, fs: parseFloat(cs.fontSize), group,
    });
  }
  // 隣り合う要素の間隔(盤の升・持ち駒は対象外)
  const sp = controls.filter((c) => !c.group);
  const gaps = [];
  for (const a of sp) {
    let below = null, right = null;
    for (const b of sp) {
      if (a === b) continue;
      const hOver = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const vOver = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (hOver > 1 && b.y >= a.y + a.h - 1) {
        const g = b.y - (a.y + a.h);
        if (!below || g < below.gap) below = { gap: +g.toFixed(1), a: a.label, b: b.label };
      }
      if (vOver > 1 && b.x >= a.x + a.w - 1) {
        const g = b.x - (a.x + a.w);
        if (!right || g < right.gap) right = { gap: +g.toFixed(1), a: a.label, b: b.label };
      }
    }
    if (below) gaps.push({ dir: "v", ...below });
    if (right) gaps.push({ dir: "h", ...right });
  }

  // ── 色の一覧 ──
  const colors = { text: {}, bg: {}, border: {} };
  const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const t of text) inc(colors.text, t.color);
  for (const el of [document.documentElement, ...document.body.querySelectorAll("*")]) {
    const cs = getComputedStyle(el);
    if (el !== document.documentElement && !visibleBox(el)) continue;
    const b = parse(cs.backgroundColor);
    if (b[3] > 0) inc(colors.bg, hex(b));
    for (const s of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(cs["border" + s + "Width"]) > 0 && cs["border" + s + "Style"] !== "none") {
        const c = parse(cs["border" + s + "Color"]);
        if (c[3] > 0) inc(colors.border, hex(c));
      }
    }
  }

  // ── 字の大きさ・太さ ──
  const fontSizes = {}, fontWeights = {};
  for (const t of text) { inc(fontSizes, String(+t.fs.toFixed(2))); inc(fontWeights, String(t.fw)); }

  // ── 数字の書き方 ──
  const leadingZero = [];
  const patterns = {};
  for (const s of strings) {
    for (const m of s.matchAll(/(?<![0-9０-９.])[0０][0-9０-９]+/g)) leadingZero.push({ num: m[0], str: s.slice(0, 60) });
    for (const m of s.matchAll(/(.{0,1})([0-9０-９]+(?:\.[0-9]+)?)(.{0,2})/g)) {
      const pat = (m[1] || "") + "#" + (m[3] || "");
      const key = (/[０-９]/.test(m[2]) ? "[全角]" : "") + pat;
      if (!patterns[key]) patterns[key] = { count: 0, ex: m[0] };
      patterns[key].count++;
    }
  }

  // ── アニメーション ──
  const toMs = (v) => {
    const t = v.trim();
    if (t.endsWith("ms")) return parseFloat(t);
    if (t.endsWith("s")) return parseFloat(t) * 1000;
    return parseFloat(t) || 0;
  };
  const anim = [];
  const seenAnim = new Set();
  for (const el of [document.documentElement, ...document.body.querySelectorAll("*")]) {
    for (const pseudo of [null, "::before", "::after"]) {
      const cs = pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el);
      const tds = cs.transitionDuration.split(",").map(toMs);
      const tdl = cs.transitionDelay.split(",").map(toMs);
      const tp = cs.transitionProperty.split(",").map((s) => s.trim());
      tds.forEach((d, i) => {
        if (d > 300) {
          const k = `t|${sel(el)}${pseudo || ""}|${tp[i % tp.length]}|${d}`;
          if (!seenAnim.has(k)) { seenAnim.add(k); anim.push({ kind: "transition", sel: sel(el) + (pseudo || ""), prop: tp[i % tp.length], durMs: d, delayMs: tdl[i % tdl.length] || 0 }); }
        }
      });
      if (cs.animationName && cs.animationName !== "none") {
        const names = cs.animationName.split(",").map((s) => s.trim());
        const ads = cs.animationDuration.split(",").map(toMs);
        const iters = cs.animationIterationCount.split(",").map((s) => s.trim());
        names.forEach((nm, i) => {
          const d = ads[i % ads.length];
          if (d > 300) {
            const k = `a|${sel(el)}${pseudo || ""}|${nm}|${d}`;
            if (!seenAnim.has(k)) { seenAnim.add(k); anim.push({ kind: "animation", sel: sel(el) + (pseudo || ""), prop: nm, durMs: d, iter: iters[i % iters.length] }); }
          }
        });
      }
    }
  }
  const running = document.getAnimations().map((a) => {
    const t = a.effect?.getComputedTiming?.();
    return { name: a.animationName || a.transitionProperty || a.constructor.name, dur: t ? +t.duration : null, iters: t ? String(t.iterations) : null };
  });

  // ── はみ出し ──
  const overflow = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = visibleBox(el);
    if (!r) continue;
    if (r.right > window.innerWidth + 1 || r.left < -1) {
      let inScroller = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") { inScroller = true; break; }
      }
      if (!inScroller && !el.closest(".board") ) overflow.push({ sel: sel(el), left: Math.round(r.left), right: Math.round(r.right) });
    }
    if (overflow.length >= 8) break;
  }

  return { doc, text, controls, gaps, colors, fontSizes, fontWeights, strings, aria, numbers: { leadingZero, patterns }, anim, running, overflow };
}

// ─────────────────────────────────────────────────────────────
// ページ内の補助(学習・復習・試験の局面を store 経由で動かす)
// ─────────────────────────────────────────────────────────────
async function installHelpers(page) {
  await page.evaluate(async () => {
    const SH = await import("/src/domain/shogi.ts");
    const LSm = await import("/src/store/learnStore.ts");
    const RV = await import("/src/store/reviewStore.ts");
    const EX = await import("/src/store/examStore.ts");
    const LS = LSm.useLearnStore;
    const au = {};
    au.mainBranch = (node) => node.branches.find((b) => b.kind === "main") ?? node.branches[0] ?? null;
    au.myColor = () => (LS.getState().course.mySide === "sente" ? SH.Color.BLACK : SH.Color.WHITE);
    au.status = () => {
      const s = LS.getState();
      const node = s.currentNode;
      const main = au.mainBranch(node);
      return {
        bq: s.bookQuiz ? { wrong: !!s.bookQuiz.wrong, revealed: s.bookQuiz.revealed, accepted: !!s.bookQuiz.wrong?.accepted } : null,
        ack: s.pendingAck ? { by: s.pendingAck.by, demos: (s.pendingAck.demos || []).length } : null,
        quiz: s.quiz ? { solved: s.quiz.solved, step: s.quiz.step, wrong: !!s.quiz.wrong } : null,
        goal: node.branches.length === 0,
        myTurn: s.position.color === au.myColor(),
        nb: node.branches.length,
        hasDev: node.branches.some((b) => b.kind === "deviation" && b.child),
        asked: s.askedQuizIds.includes(node.id),
        accN: ((main && main.accepted) || []).filter((u) => u !== main.usi).length,
        sharp: !!(main && main.sharp),
        course: s.course.id,
        hist: s.nodeHistory.length,
      };
    };
    /** usi の手を、指定した store の選択関数で指す。 */
    au.play = (getState, sqName, handName, usi) => {
      const p = SH.parseUSIMove(usi);
      if (!p) return false;
      const st = getState();
      if (p.from instanceof SH.Square) {
        st[sqName](p.from);
        getState()[sqName](p.to);
      } else {
        st[handName](p.from, getState().position.color);
        getState()[sqName](p.to);
      }
      return true;
    };
    au.playLearn = (mode) => {
      const s = LS.getState();
      const a = au.mainBranch(s.currentNode);
      if (!a) return false;
      return au.play(LS.getState, mode === "quiz" ? "quizSelectSquare" : "bookSelectSquare", mode === "quiz" ? "quizSelectHand" : "bookSelectHand", a.usi);
    };
    au.playAcceptedLearn = () => {
      const s = LS.getState();
      const a = au.mainBranch(s.currentNode);
      const alt = (a?.accepted || []).find((u) => u !== a.usi);
      if (!alt) return false;
      return au.play(LS.getState, "bookSelectSquare", "bookSelectHand", alt);
    };
    au.selectFromLearn = () => {
      const s = LS.getState();
      const a = au.mainBranch(s.currentNode);
      const p = a && SH.parseUSIMove(a.usi);
      if (!p) return false;
      if (p.from instanceof SH.Square) s.bookSelectSquare(p.from);
      else s.bookSelectHand(p.from, s.position.color);
      return true;
    };
    au.clearSel = () => LS.setState({ selected: null });
    /** 正解でも許容手でもない手を探して指す。成功したら true。 */
    au.wrongLearn = (mode) => {
      const quiz = mode === "quiz";
      const sqName = quiz ? "quizSelectSquare" : "bookSelectSquare";
      const handName = quiz ? "quizSelectHand" : "bookSelectHand";
      const cands = [];
      const s0 = LS.getState();
      for (const [fromUsi, dests] of s0.moveDests) {
        const from = SH.Square.newByUSI(fromUsi);
        if (!from || s0.position.board.at(from)?.color !== s0.position.color) continue;
        for (const d of dests) cands.push({ from, to: d });
      }
      for (const [pt, dests] of s0.dropDests) for (const d of dests) cands.push({ hand: pt, to: d });
      for (const c of cands) {
        const s = LS.getState();
        const stBefore = quiz ? s.quiz : s.bookQuiz;
        if (!stBefore) return false;
        if (c.hand !== undefined) { s[handName](c.hand, s.position.color); LS.getState()[sqName](c.to); }
        else { s[sqName](c.from); LS.getState()[sqName](c.to); }
        const after = LS.getState();
        if (quiz) {
          if (after.quiz && after.quiz.wrong) return true;
        } else if (after.bookQuiz && after.bookQuiz.wrong) {
          const w = after.bookQuiz.wrong;
          if (!w.accepted && !w.openEnded && w.attemptedUsi !== w.correctUsi) return true;
          after.bookRetry();
        }
        LS.setState({ selected: null });
      }
      return false;
    };
    au.pause = () => LS.getState().pauseAutoAdvance();
    au.resume = () => LS.getState().resumeAutoAdvance();
    au.chooseBranchNonMain = () => {
      const s = LS.getState();
      const i = s.currentNode.branches.findIndex((b) => b.kind !== "main");
      if (i < 0) return -1;
      s.chooseBranch(i);
      return i;
    };
    au.chooseBranch = (i) => LS.getState().chooseBranch(i);
    au.bookReveal = () => LS.getState().bookReveal();
    au.bookRetry = () => LS.getState().bookRetry();

    // 復習・試験
    au.review = {
      st: () => {
        const s = RV.useReviewStore.getState();
        const c = s.cards[s.index];
        return { done: s.done, n: s.cards.length, i: s.index, answered: !!s.answer, kind: s.answer?.kind || null, usi: c?.usi, accN: ((c && c.accepted) || []).filter((u) => u !== c.usi).length };
      },
      play: () => { const c = RV.useReviewStore.getState().cards[RV.useReviewStore.getState().index]; return au.play(RV.useReviewStore.getState, "selectSquare", "selectHand", c.usi); },
      playAccepted: () => {
        const s = RV.useReviewStore.getState(); const c = s.cards[s.index];
        const alt = (c.accepted || []).find((u) => u !== c.usi); if (!alt) return false;
        return au.play(RV.useReviewStore.getState, "selectSquare", "selectHand", alt);
      },
      wrong: () => {
        const R = RV.useReviewStore;
        const s0 = R.getState(); const c = s0.cards[s0.index];
        const cands = [];
        for (const [fromUsi, dests] of s0.moveDests) {
          const from = SH.Square.newByUSI(fromUsi);
          if (!from || s0.position.board.at(from)?.color !== s0.position.color) continue;
          for (const d of dests) cands.push({ from, to: d });
        }
        for (const cd of cands) {
          const s = R.getState();
          s.selectSquare(cd.from); R.getState().selectSquare(cd.to);
          const a = R.getState().answer;
          if (a && a.kind === "wrong") return true;
          if (a) return false;
        }
        return false;
      },
    };
    au.exam = {
      st: () => { const s = EX.useExamStore.getState(); return { finished: s.finished, n: s.cards.length, i: s.index }; },
      play: () => { const s = EX.useExamStore.getState(); const c = s.cards[s.index]; return au.play(EX.useExamStore.getState, "selectSquare", "selectHand", c.usi); },
    };
    window.__au = au;
  });
}

// ─────────────────────────────────────────────────────────────
// 撮影と計測
// ─────────────────────────────────────────────────────────────
let CUR = null; // { theme, page }

async function settle(page, ms = 450) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await sleep(ms);
}

async function capture(name, opts = {}) {
  const { theme, page } = CUR;
  if (!(name in ORDER_NUM)) throw new Error("未登録の状態名: " + name);
  await settle(page, opts.settle ?? 450);
  const nn = String(ORDER_NUM[name]).padStart(2, "0");
  const dir = path.join(OUT, "screens", theme);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${nn}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const m = await page.evaluate(measureInPage);
  m.shot = path.relative(OUT, file);
  const entry = (metrics.states[name] ??= { order: ORDER_NUM[name], themes: {} });
  entry.themes[theme] = m;
  log(`captured ${theme}/${nn}-${name}  (text ${m.text.length}, controls ${m.controls.length})`);
}

/** 失敗しても次の状態へ進む。理由は unreached に残す(ライトのときだけ)。 */
async function step(state, fn) {
  try {
    await fn();
    return true;
  } catch (e) {
    const reason = String(e && e.message || e).split("\n")[0].slice(0, 200);
    log(`!! ${CUR.theme}/${state}: ${reason}`);
    if (!unreached.some((u) => u.state === state && u.theme === CUR.theme)) unreached.push({ state, theme: CUR.theme, reason });
    return false;
  }
}

async function waitFor(page, fn, timeout = 8000, every = 60) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn);
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error("待ちが時間切れ: " + String(fn).slice(0, 80));
    await sleep(every);
  }
}

// ─────────────────────────────────────────────────────────────
// 保存データの種(localStorage)
// ─────────────────────────────────────────────────────────────
function seedInit({ seed, theme }) {
  try {
    if (sessionStorage.getItem("__ui_seeded")) return;
    sessionStorage.setItem("__ui_seeded", "1");
    const utc = (off) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
    const loc = (off) => {
      const d = new Date(); d.setDate(d.getDate() + off);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    localStorage.setItem("joseki-dojo:settings:v1", JSON.stringify({ theme }));
    if (!seed) return;
    if (seed.learning) localStorage.setItem("joseki-dojo:learning:v1", JSON.stringify(seed.learning));
    if (seed.items) {
      const items = {};
      for (const r of seed.items) items[r.key] = { streak: r.streak, due: utc(r.due), last: utc(r.last), misses: r.misses };
      const days = [];
      for (const o of seed.days || []) { for (const d of [utc(-o), loc(-o)]) if (!days.includes(d)) days.push(d); }
      days.sort().reverse();
      localStorage.setItem("joseki-dojo:progress:v1", JSON.stringify({ items, days }));
    }
    if (seed.exams) {
      const ex = {};
      for (const [id, r] of Object.entries(seed.exams)) ex[id] = { best: r.best, passed: r.passed, at: utc(-r.ago), attempts: r.attempts };
      localStorage.setItem("joseki-dojo:exams:v1", JSON.stringify(ex));
    }
    if (seed.points) localStorage.setItem("joseki-dojo:points:v1", JSON.stringify({ total: seed.points.total, today: seed.points.today, todayDate: utc(0) }));
  } catch (e) { /* 種が入らなくても続ける */ }
}

// ─────────────────────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────────────────────
async function main() {
  fs.rmSync(path.join(OUT, "screens"), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "screens"), { recursive: true });

  // エンジン資産(TryMove が使う)が無ければ、アプリの predev と同じコピーを走らせる。
  if (!fs.existsSync(path.join(ROOT, "public", "engine", "yaneuraou.k-p.js"))) {
    const { execFileSync } = await import("node:child_process");
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "copy-engine-assets.mjs")], { stdio: "inherit" });
  }

  const server = await createServer({
    root: ROOT,
    logLevel: "warn",
    clearScreen: false,
    server: { host: "127.0.0.1", port: 5290, strictPort: false, hmr: false, open: false },
  });
  await server.listen();
  const base = server.resolvedUrls.local[0].replace(/\/$/, "");
  log("dev server", base);

  const exe = findChromium();
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  metrics.meta = { chromium: exe, viewport: VIEWPORT, deviceScaleFactor: 2, base, startedAt: new Date().toISOString() };

  try {
    // ── 種のデータを node 側で組み立てる ──
    const L = await server.ssrLoadModule("/src/domain/josekiLoader.ts");
    const RQ = await server.ssrLoadModule("/src/domain/reviewQueue.ts");
    const PS = await server.ssrLoadModule("/src/store/progressStore.ts");
    const STR = await server.ssrLoadModule("/src/data/strategies.ts");
    const gote = L.buildLearnPath("mine", "gokigen", "ゴキゲン中飛車", "gote");
    const chKeys = gote.chapters.map((c) => [...new Set(RQ.quizItemsOf(c.course).map((q) => PS.itemKey(q.sfen, q.usi)))]);
    const chLabels = gote.chapters.map((c) => c.entry.label);
    const chIds = gote.chapters.map((c) => c.course.id);
    const learnedItems = (n, due = 12) => {
      const seen = new Set(); const out = [];
      for (let i = 0; i < n; i++) for (const k of chKeys[i]) if (!seen.has(k)) { seen.add(k); out.push({ key: k, streak: 2, due: due + (out.length % 20), last: -2, misses: 0 }); }
      return out;
    };
    log("chapters", chLabels.join(" / "), "");

    const SEEDS = {
      fresh: null,
      ch1: { items: learnedItems(1), days: [0], },
      ch2: { items: learnedItems(2), days: [0] },
      last: { items: learnedItems(8), days: [0] },
      records: (() => {
        const items = learnedItems(4, 6);
        // 第5章は途中まで(覚えた→昨日が期日→未学習の混在)
        const seen = new Set(items.map((i) => i.key));
        const k5 = chKeys[4].filter((k) => !seen.has(k));
        k5.forEach((k, i) => {
          if (i < k5.length * 0.45) items.push({ key: k, streak: 2, due: 5, last: -1, misses: 0 });
          else if (i < k5.length * 0.65) items.push({ key: k, streak: 1, due: -1, last: -2, misses: 1 });
        });
        return {
          items, days: [0, 1, 2, 3, 4, 8, 9],
          points: { total: 1240, today: 60 },
          exams: { [chIds[0]]: { best: 100, passed: true, ago: 3, attempts: 1 }, [chIds[1]]: { best: 60, passed: false, ago: 1, attempts: 2 } },
        };
      })(),
      alldone: { items: learnedItems(gote.chapters.length, 20), days: [0, 1, 2, 3, 4, 5, 6, 7], points: { total: 5000, today: 120 } },
    };

    /** 1つの場面(新しいブラウザ文脈)を、テーマごとに実行する。 */
    async function scenario(label, seedName, fn) {
      for (const theme of THEMES) {
        const ctx = await browser.newContext({
          viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
          colorScheme: theme, locale: "ja-JP", timezoneId: "Asia/Tokyo",
        });
        await ctx.addInitScript(seedInit, { seed: SEEDS[seedName], theme });
        const page = await ctx.newPage();
        page.on("pageerror", (e) => metrics.pageErrors.push({ scenario: label, theme, error: String(e).slice(0, 300) }));
        page.on("console", (m) => { if (m.type() === "error") metrics.pageErrors.push({ scenario: label, theme, console: m.text().slice(0, 300) }); });
        CUR = { theme, page };
        try {
          await page.goto(base, { waitUntil: "networkidle" });
          await page.waitForSelector(".app-shell", { timeout: 20000 });
          await installHelpers(page);
          await fn(page);
        } catch (e) {
          log(`!! scenario ${label}/${theme} が途中で止まった:`, String(e.message || e).split("\n")[0]);
          unreached.push({ state: `(scenario ${label})`, theme, reason: String(e.message || e).split("\n")[0].slice(0, 200) });
        }
        await ctx.close();
      }
    }
    const reload = async (page) => {
      await page.goto(base, { waitUntil: "networkidle" });
      await page.waitForSelector(".app-shell");
      await installHelpers(page);
    };
    const clickText = (page, re) => page.getByRole("button", { name: re }).first().click();

    // 学習画面を自動で進める共通ループ。hooks.before(st) が 'stop' を返すと止まる。
    async function driveLearn(page, hooks = {}, maxMs = 120000) {
      const t0 = Date.now();
      let lastKey = "", stuck = 0;
      while (Date.now() - t0 < maxMs) {
        const st = await page.evaluate(() => window.__au.status());
        if (hooks.before) { const r = await hooks.before(st); if (r === "stop") return "stopped"; if (r === "again") continue; }
        if (st.goal && !st.ack && !st.quiz) return "goal";
        const key = JSON.stringify(st);
        stuck = key === lastKey ? stuck + 1 : 0;
        lastKey = key;
        if (stuck > 400) throw new Error("学習の自動進行が止まった: " + key.slice(0, 160));
        if (st.quiz) {
          if (st.quiz.solved) await page.getByRole("button", { name: /本線に戻って続ける/ }).click();
          else if (st.myTurn) await page.evaluate(() => window.__au.playLearn("quiz"));
          else await sleep(60);
        } else if (st.ack) {
          await page.locator(".learn-navrow button.primary").click();
        } else if (st.bq && st.bq.revealed) {
          await page.locator(".learn-navrow button.primary").click();
        } else if (st.bq) {
          if (st.bq.wrong) await page.evaluate(() => window.__au.bookRetry());
          await page.evaluate(() => window.__au.playLearn("book"));
        } else await sleep(60);
        await sleep(15);
      }
      throw new Error("学習の自動進行が時間切れ");
    }

    // ───────────── 場面1: 記録なしの各画面 ─────────────
    log("== shell (記録なし) ==");
    await scenario("shell", "fresh", async (page) => {
      await step("dashboard-fresh", () => capture("dashboard-fresh"));
      await step("settings-fresh", async () => {
        await page.locator(".dash-tri button", { hasText: "設定" }).click();
        await page.waitForSelector(".set-wrap");
        await capture("settings-fresh");
        await reload(page);
      });
      await step("exam-list-fresh", async () => {
        await page.locator(".dash-tri button", { hasText: "認定試験" }).click();
        await page.waitForSelector(".exam-wrap");
        await capture("exam-list-fresh");
        await reload(page);
      });
      await step("about", async () => {
        await page.locator(".dash-foot").click();
        await page.waitForSelector(".about-wrap, .about-frame, [class*=about]");
        await capture("about");
        await reload(page);
      });
      await step("home", async () => {
        await page.locator(".dash-tri button", { hasText: "戦法を選ぶ" }).click();
        await page.waitForSelector(".home-wrap");
        await capture("home");
      });
      await step("side-both", async () => {
        await page.locator(".lcard", { hasText: "ゴキゲン中飛車" }).first().click();
        await page.waitForSelector(".matchup-wrap");
        await capture("side-both");
      });
      // 先手で始める → 学習(先手側の盤)
      await step("learn-sente-first-question", async () => {
        await page.locator(".sidebtn", { hasText: "先手" }).first().click();
        await page.waitForSelector(".learn-wrap");
        await waitFor(page, () => window.__au.status().bq !== null, 12000);
        await capture("learn-sente-first-question");
      });
    });

    // ───────────── 場面2: 第1章(短い章)を最初から最後まで ─────────────
    log("== learn ch0 ==");
    await scenario("learn0", "fresh", async (page) => {
      await clickText(page, /続きから/);
      await page.waitForSelector(".learn-wrap");
      await step("learn-opponent-moving", async () => {
        await page.waitForSelector(".waitpill", { timeout: 4000 });
        await page.evaluate(() => window.__au.pause());
        await capture("learn-opponent-moving", { settle: 200 });
        await page.evaluate(() => window.__au.resume());
      });
      await waitFor(page, () => window.__au.status().bq !== null, 12000);
      await step("learn-first-question", () => capture("learn-first-question"));
      await step("learn-piece-selected", async () => {
        await page.evaluate(() => window.__au.selectFromLearn());
        await capture("learn-piece-selected");
        await page.evaluate(() => window.__au.clearSel());
      });
      await step("learn-wrong", async () => {
        const ok = await page.evaluate(() => window.__au.wrongLearn("book"));
        if (!ok) throw new Error("誤答を作れなかった");
        await capture("learn-wrong");
      });
      await step("learn-trymove", async () => {
        await page.locator(".demo-btn").first().click();
        await page.waitForSelector(".trypanel");
        // エンジンの読みが終わるまで待つ(最大25秒)。終わらなければ途中の姿を撮る。
        await page.waitForFunction(() => !document.querySelector(".try-note")?.textContent?.includes("読んでいます"), null, { timeout: 25000 }).catch(() => {});
        await capture("learn-trymove");
        await page.locator(".try-actions button").nth(1).click();
        await sleep(200);
      });
      await step("learn-accepted", async () => {
        await page.evaluate(() => window.__au.bookRetry());
        const st = await page.evaluate(() => window.__au.status());
        if (!st.accN) throw new Error("この局面には許容手が無い");
        const ok = await page.evaluate(() => window.__au.playAcceptedLearn());
        if (!ok) throw new Error("許容手を指せなかった");
        await waitFor(page, () => window.__au.status().bq?.accepted === true, 3000);
        await capture("learn-accepted");
      });
      await step("learn-correct-explain", async () => {
        await page.evaluate(() => window.__au.bookRetry());
        await page.evaluate(() => window.__au.playLearn("book"));
        await waitFor(page, () => window.__au.status().ack !== null, 3000);
        await capture("learn-correct-explain");
      });
      let revealed = false;
      const r = await step("learn-revealed", async () => {
        const res = await driveLearn(page, {
          async before(st) {
            if (!revealed && st.bq && !st.bq.revealed && !st.bq.wrong) {
              revealed = true;
              await page.evaluate(() => window.__au.bookReveal());
              await capture("learn-revealed");
              return "again";
            }
          },
        });
        await capture("learn-chapter-complete");
        return res;
      });
      if (!r) await step("learn-chapter-complete", async () => { await driveLearn(page); await capture("learn-chapter-complete"); });
    });

    // ───────────── 場面3: 第2章(実演・分岐・逸れ手) ─────────────
    log("== learn ch1 ==");
    await scenario("learn1", "ch1", async (page) => {
      await clickText(page, /続きから/);
      await page.waitForSelector(".learn-wrap");
      const done = { demo: false, branch: false, dev: false, devWrong: false, devSolved: false };
      await step("learn-correct-demo-button", async () => {
        await driveLearn(page, {
          async before(st) {
            if (!done.demo && st.ack && st.ack.by === "me" && st.ack.demos > 0) {
              done.demo = true;
              await capture("learn-correct-demo-button");
              await page.locator(".demo-btn").first().click();
              await sleep(1300);
              await step("learn-demo-playing", () => capture("learn-demo-playing", { settle: 100 }));
              await page.waitForSelector(".demo-text", { timeout: 12000 }).catch(() => {});
              await step("learn-demo-finished", () => capture("learn-demo-finished"));
              await page.getByRole("button", { name: /実演を閉じる/ }).click();
              return "again";
            }
            if (!done.branch && !st.myTurn && !st.bq && !st.ack && !st.quiz && !st.goal && st.nb > 1) {
              done.branch = true;
              await page.evaluate(() => window.__au.pause());
              await step("learn-opponent-wait-branchnav", () => capture("learn-opponent-wait-branchnav", { settle: 250 }));
              await step("learn-branch-selected", async () => {
                const i = await page.evaluate(() => window.__au.chooseBranchNonMain());
                if (i < 0) throw new Error("本線以外の枝が無い");
                await capture("learn-branch-selected", { settle: 250 });
              });
              await page.evaluate(() => window.__au.chooseBranch(0));
              await page.evaluate(() => window.__au.resume());
              return "again";
            }
            if (st.quiz && !st.quiz.solved && st.myTurn && st.quiz.step === 0 && !done.dev) {
              done.dev = true;
              await step("learn-deviation-quiz", () => capture("learn-deviation-quiz"));
              await step("learn-deviation-wrong", async () => {
                const ok = await page.evaluate(() => window.__au.wrongLearn("quiz"));
                if (!ok) throw new Error("咎めクイズの誤答を作れなかった");
                await capture("learn-deviation-wrong");
              });
              return "again";
            }
            if (st.quiz && st.quiz.solved && !done.devSolved) {
              done.devSolved = true;
              await step("learn-deviation-solved", () => capture("learn-deviation-solved"));
              return "again";
            }
            if (done.demo && done.branch && done.devSolved) return "stop";
          },
        }, 180000);
      });
      for (const [k, name] of [["demo", "learn-correct-demo-button"], ["branch", "learn-opponent-wait-branchnav"], ["dev", "learn-deviation-quiz"], ["devSolved", "learn-deviation-solved"]]) {
        if (!done[k] && !unreached.some((u) => u.state === name && u.theme === CUR.theme)) unreached.push({ state: name, theme: CUR.theme, reason: "第2章を通しても該当の局面に当たらなかった" });
      }
    });

    log("== learn ch2 intro ==");
    await scenario("learn2", "ch2", async (page) => {
      await clickText(page, /続きから/);
      await page.waitForSelector(".learn-wrap");
      await step("learn-chapter-intro", async () => {
        await page.waitForSelector(".chapter-intro", { timeout: 5000 });
        await waitFor(page, () => window.__au.status().bq !== null, 12000);
        await capture("learn-chapter-intro");
      });
    });

    log("== learn last chapter ==");
    await scenario("learnLast", "last", async (page) => {
      await clickText(page, /続きから/);
      await page.waitForSelector(".learn-wrap");
      await step("learn-all-done", async () => {
        await driveLearn(page, {}, 150000);
        await page.getByRole("button", { name: /すべての章を修了/ }).waitFor({ timeout: 4000 });
        await capture("learn-all-done");
      });
    });

    // ───────────── 場面4: 記録あり(ダッシュボード・復習・試験・設定) ─────────────
    log("== records ==");
    await scenario("records", "records", async (page) => {
      await step("dashboard-records", () => capture("dashboard-records"));

      await step("settings", async () => {
        await page.locator(".dash-tri button", { hasText: "設定" }).click();
        await page.waitForSelector(".set-wrap");
        await capture("settings");
      });
      await step("settings-confirm", async () => {
        await page.locator(".set-del").first().click();
        await page.waitForSelector(".set-confirm");
        await capture("settings-confirm");
        await reload(page);
      });

      // 復習
      await step("review-question", async () => {
        await page.locator(".dash-rvbtn").click();
        await page.waitForSelector(".review-wrap");
        await waitFor(page, () => window.__au.review.st().n > 0, 4000);
        await capture("review-question");
      });
      await step("review-wrong", async () => {
        const ok = await page.evaluate(() => window.__au.review.wrong());
        if (!ok) throw new Error("復習で誤答を作れなかった");
        await capture("review-wrong");
        await page.locator(".review-actions .review-btn").click();
      });
      // 許容手のある問題まで進める(答えを見て次へ。最大8問)
      let gotAccepted = false;
      await step("review-accepted", async () => {
        for (let i = 0; i < 25; i++) {
          const st = await page.evaluate(() => window.__au.review.st());
          if (st.done) break;
          if (st.accN > 0 && !st.answered) {
            await page.evaluate(() => window.__au.review.playAccepted());
            await waitFor(page, () => window.__au.review.st().kind === "accepted", 2000);
            await capture("review-accepted");
            gotAccepted = true;
            await page.locator(".review-actions .review-btn").click();
            return;
          }
          await page.evaluate(() => window.__au.review.play());
          await page.locator(".review-actions .review-btn").click();
          await sleep(30);
        }
        throw new Error("許容手のある復習問題に当たらなかった");
      });
      await step("review-correct", async () => {
        const st = await page.evaluate(() => window.__au.review.st());
        if (st.done) throw new Error("すでに終了");
        await page.evaluate(() => window.__au.review.play());
        await waitFor(page, () => window.__au.review.st().kind === "correct", 2000);
        await capture("review-correct");
        await page.locator(".review-actions .review-btn").click();
      });
      await step("review-result", async () => {
        for (let i = 0; i < 40; i++) {
          const st = await page.evaluate(() => window.__au.review.st());
          if (st.done) break;
          if (!st.answered) await page.evaluate(() => window.__au.review.play());
          await page.locator(".review-actions .review-btn").click();
          await sleep(20);
        }
        await page.waitForSelector(".review-done");
        await capture("review-result");
        await page.getByRole("button", { name: /ホームへ戻る/ }).click();
      });
      if (!gotAccepted && !unreached.some((u) => u.state === "review-accepted" && u.theme === CUR.theme)) unreached.push({ state: "review-accepted", theme: CUR.theme, reason: "該当なし" });

      // 試験
      await step("exam-list", async () => {
        await page.locator(".dash-tri button", { hasText: "認定試験" }).click();
        await page.waitForSelector(".exam-wrap");
        await capture("exam-list");
      });
      await step("exam-result-pass", async () => {
        const row = page.locator(".exam-row", { hasText: chLabels[3] });
        await row.locator(".exam-go").click();
        await page.waitForSelector(".exam-board");
        await capture("exam-question");
        for (let i = 0; i < 12; i++) {
          const st = await page.evaluate(() => window.__au.exam.st());
          if (st.finished) break;
          await page.evaluate(() => window.__au.exam.play());
          await sleep(30);
        }
        await page.waitForSelector(".exam-result");
        await capture("exam-result-pass");
      });
      await step("exam-list-after", async () => {
        await page.locator(".exam-btn").click();
        await page.waitForSelector(".exam-card");
        await capture("exam-list-after");
      });
      await step("exam-result-fail", async () => {
        const row = page.locator(".exam-row", { hasText: chLabels[1] });
        await row.locator(".exam-go").click();
        await page.waitForSelector(".exam-board");
        for (let i = 0; i < 12; i++) {
          const st = await page.evaluate(() => window.__au.exam.st());
          if (st.finished) break;
          await page.locator(".exam-skip").click();
          await sleep(30);
        }
        await page.waitForSelector(".exam-result");
        await capture("exam-result-fail");
      });
    });

    log("== all done ==");
    await scenario("alldone", "alldone", async (page) => {
      await step("dashboard-all-done", () => capture("dashboard-all-done"));
    });
    unreached.push({ state: "home-search-empty(検索0件)", theme: "both", reason: "公開中の戦法カードが1枚(ゴキゲン中飛車のみ)で、4枚以下だと検索欄とカテゴリタブが出ない" });
    unreached.push({ state: "side-partial(片方の手番が準備中)", theme: "both", reason: "公開中の戦法が先手・後手の両方を持つため、準備中表示は出ない" });
    unreached.push({ state: "review-empty(今日の復習はありません)", theme: "both", reason: "復習が0問のとき「はじめる」は無効になり、画面へ到達できない(通常の導線では出ない)" });
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }

  metrics.meta.finishedAt = new Date().toISOString();
  metrics.meta.runtimeSec = Math.round((Date.now() - T0) / 1000);
  metrics.unreached = unreached;
  const states = Object.keys(metrics.states).sort((a, b) => metrics.states[a].order - metrics.states[b].order);
  const reached = states.filter((s) => metrics.states[s].themes.light && metrics.states[s].themes.dark);
  metrics.meta.states = states;
  metrics.meta.missingStates = ORDER.filter((s) => !states.includes(s));

  fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(metrics));
  const strings = {};
  for (const s of states) strings[s] = (metrics.states[s].themes.light ?? metrics.states[s].themes.dark).strings;
  fs.writeFileSync(path.join(OUT, "strings.json"), JSON.stringify(strings, null, 1));

  await contactSheets(states);
  fs.writeFileSync(path.join(OUT, "summary.md"), buildSummary(states));
  log(`完了 ${metrics.meta.runtimeSec}s  状態 ${states.length}/${ORDER.length}  (両テーマ ${reached.length})`);
}

// ─────────────────────────────────────────────────────────────
// 一覧画像
// ─────────────────────────────────────────────────────────────
async function contactSheets(states) {
  const COLS = 8, ROWS = 5, TW = 190, CAP = 430;
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
  for (const theme of THEMES) {
    const items = states.filter((s) => metrics.states[s].themes[theme]).map((s) => ({ name: s, nn: String(ORDER_NUM[s]).padStart(2, "0"), shot: metrics.states[s].themes[theme].shot, h: metrics.states[s].themes[theme].doc.h }));
    const pages = [];
    for (let i = 0; i < items.length; i += COLS * ROWS) pages.push(items.slice(i, i + COLS * ROWS));
    for (let p = 0; p < pages.length; p++) {
      const dark = theme === "dark";
      const html = `<!doctype html><meta charset="utf-8"><style>
        body{margin:0;padding:10px;background:${dark ? "#111" : "#e9e6e0"};font:11px/1.3 -apple-system,"Hiragino Sans",sans-serif;color:${dark ? "#ddd" : "#222"}}
        .g{display:grid;grid-template-columns:repeat(${COLS},${TW}px);gap:12px 10px}
        .c{width:${TW}px}.t{height:26px;overflow:hidden}
        .im{width:${TW}px;height:${CAP}px;overflow:hidden;border:1px solid ${dark ? "#444" : "#bbb"};background:#888;position:relative}
        .im img{width:${TW}px;display:block}
        .h{position:absolute;right:2px;bottom:2px;background:rgba(0,0,0,.65);color:#fff;font-size:9px;padding:1px 3px;border-radius:2px}
      </style><div class="g">${pages[p].map((it) =>
        `<div class="c"><div class="t"><b>${it.nn}</b> ${it.name}</div><div class="im"><img src="${pathToFileUrl(path.join(OUT, it.shot))}">${it.h > 844 ? `<span class="h">全長 ${it.h}px</span>` : ""}</div></div>`).join("")}</div>`;
      const f = path.join(OUT, `.contact-${theme}-${p + 1}.html`);
      fs.writeFileSync(f, html);
      const ctx = await browser.newContext({ viewport: { width: COLS * TW + (COLS - 1) * 10 + 20, height: 600 }, deviceScaleFactor: 1 });
      const pg = await ctx.newPage();
      await pg.goto("file://" + f);
      await pg.waitForFunction(() => [...document.images].every((i) => i.complete));
      const out = path.join(OUT, p === 0 ? `contact-${theme}.png` : `contact-${theme}-${p + 1}.png`);
      await pg.screenshot({ path: out, fullPage: true });
      await ctx.close();
      fs.rmSync(f);
    }
  }
  await browser.close();
}
const pathToFileUrl = (p) => "file://" + encodeURI(p);

// ─────────────────────────────────────────────────────────────
// 要約(summary.md)
// ─────────────────────────────────────────────────────────────
function buildSummary(states) {
  const L = [];
  const push = (s = "") => L.push(s);
  const M = metrics.states;
  const themes = THEMES;
  const gen = (s, f) => themes.map((t) => M[s].themes[t]).filter(Boolean).map(f);
  const uniq = (a) => [...new Set(a)];

  push("# UI 監査サマリー");
  push(`390x844 @2x / ライト・ダーク / ${states.length}状態 / 実行 ${metrics.meta.runtimeSec}s。詳細は metrics.json、文言は strings.json。`);
  push("基準: 文字コントラスト(出現途中の半透明文字は除外) 4.5 未満(大きい文字は 3 未満)、タップ領域 44px 未満、隣り合う操作の間隔 8px 未満、300ms 超のアニメーション。");
  push("盤の升(81個)と持ち駒は「盤」として1行にまとめて数える。");
  push();

  // ── 状態ごと ──
  push("## 状態ごとの指摘(指摘のあるものだけ)");
  const clean = [];
  for (const s of states) {
    const parts = [];
    for (const t of themes) {
      const m = M[s].themes[t];
      if (!m) continue;
      const low = m.text.filter((x) => x.low);
      const small = m.controls.filter((c) => c.small && !c.group);
      const tight = m.gaps.filter((g) => g.gap >= 0 && g.gap < 8 && g.dir === "v");
      const bits = [];
      if (low.length) bits.push(`低コントラスト${low.length}(最低${Math.min(...low.map((x) => x.ratio)).toFixed(2)} 「${low.sort((a, b) => a.ratio - b.ratio)[0].t.slice(0, 12)}」)`);
      if (small.length) bits.push(`小さい操作${small.length}(${uniq(small.map((c) => c.label || c.sel)).slice(0, 3).map((x) => x.slice(0, 10)).join("/")})`);
      if (tight.length) bits.push(`間隔<8px:${tight.length}`);
      const tightH = m.gaps.filter((g) => g.gap >= 0 && g.gap < 8 && g.dir === "h");
      if (tightH.length) bits.push(`横間隔<8px:${tightH.length}`);
      if (m.doc.scrollW > m.doc.w + 1) bits.push(`横スクロール(${m.doc.scrollW}px)`);
      if (m.overflow.length) bits.push(`はみ出し${m.overflow.length}`);
      if (m.numbers.leadingZero.length) bits.push(`先頭ゼロ${m.numbers.leadingZero.length}`);
      if (bits.length) parts.push(`${t === "light" ? "L" : "D"}: ${bits.join(" ")}`);
    }
    if (parts.length) push(`- **${String(ORDER_NUM[s]).padStart(2, "0")} ${s}** ${parts.join(" | ")}`);
    else clean.push(s);
  }
  if (clean.length) push(`- 指摘なし: ${clean.join(", ")}`);
  push();

  // ── 色 ──
  push("## 色の一覧(状態をまたいだ使用要素数。上位)");
  for (const t of themes) {
    const agg = { text: {}, bg: {}, border: {} };
    const nst = { text: {}, bg: {}, border: {} };
    for (const s of states) {
      const m = M[s].themes[t]; if (!m) continue;
      for (const k of ["text", "bg", "border"]) for (const [c, n] of Object.entries(m.colors[k])) { agg[k][c] = (agg[k][c] || 0) + n; nst[k][c] = (nst[k][c] || 0) + 1; }
    }
    const total = Object.fromEntries(["text", "bg", "border"].map((k) => [k, Object.keys(agg[k]).length]));
    push(`- ${t}: 文字色${total.text}種 / 背景色${total.bg}種 / 罫線色${total.border}種`);
    for (const k of ["text", "bg", "border"]) {
      const top = Object.entries(agg[k]).sort((a, b) => b[1] - a[1]).slice(0, 10);
      push(`  - ${k}: ${top.map(([c, n]) => `${c}×${n}`).join(" ")}`);
    }
  }
  push();

  // ── 字の大きさ ──
  push("## 字の大きさ(px×テキスト数、全状態の合計)");
  for (const t of themes.slice(0, 1)) {
    const agg = {}, aggW = {};
    for (const s of states) { const m = M[s].themes[t]; if (!m) continue; for (const [k, n] of Object.entries(m.fontSizes)) agg[k] = (agg[k] || 0) + n; for (const [k, n] of Object.entries(m.fontWeights)) aggW[k] = (aggW[k] || 0) + n; }
    push(`- ${Object.entries(agg).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([k, n]) => `${k}×${n}`).join(" ")}`);
    push(`- 太さ: ${Object.entries(aggW).sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}×${n}`).join(" ")}`);
  }
  push();

  // ── 低コントラスト ──
  push("## 低コントラストの組み合わせ(文字色/背景色/サイズ。多い順)");
  for (const t of themes) {
    const g = new Map();
    for (const s of states) {
      const m = M[s].themes[t]; if (!m) continue;
      for (const x of m.text.filter((x) => x.low)) {
        const k = `${x.fg}|${x.bg}|${x.fs}|${x.fw}`;
        const e = g.get(k) || { n: 0, ratio: x.ratio, ex: x.t, dis: x.dis, large: x.large, st: new Set(), fg: x.fg, bg: x.bg, fs: x.fs, fw: x.fw };
        e.n++; e.st.add(s); g.set(k, e);
      }
    }
    const list = [...g.values()].sort((a, b) => b.n - a.n);
    push(`- ${t}: ${list.length}組 / 計${list.reduce((a, b) => a + b.n, 0)}件`);
    for (const e of list.slice(0, 9)) push(`  - ${e.fg} on ${e.bg} ${e.fs}px/${e.fw} → ${e.ratio}${e.large ? "(大)" : ""}${e.dis ? " 無効時" : ""} ×${e.n} (${e.st.size}状態) 例「${e.ex.slice(0, 14)}」`);
  }
  push();

  // ── 小さいタップ領域 ──
  push("## 小さいタップ領域(<44px。ラベル別、全状態で1つにまとめる)");
  {
    const g = new Map();
    for (const s of states) {
      const m = M[s].themes.light ?? M[s].themes.dark; if (!m) continue;
      for (const c of m.controls.filter((c) => c.small)) {
        const key = c.group ? `盤:${c.group}` : `${c.label || c.sel}`;
        const e = g.get(key) || { n: 0, w: c.w, h: c.h, st: new Set(), press: c.pressable, sel: c.sel };
        e.n++; e.st.add(s); g.set(key, e);
      }
    }
    const list = [...g.entries()].sort((a, b) => b[1].st.size - a[1].st.size);
    push(`- ${list.length}種`);
    for (const [k, e] of list.slice(0, 26)) push(`  - 「${k.slice(0, 18)}」${e.w}x${e.h} ${e.sel.slice(0, 22)} ${e.press ? "枠/面あり" : "**枠も面も無い**"} (${e.st.size}状態)`);
  }
  push();

  // ── 数字 ──
  push("## 先頭ゼロの数字・数字の書き方");
  {
    const lz = [];
    const pats = {};
    for (const s of states) {
      const m = M[s].themes.light ?? M[s].themes.dark; if (!m) continue;
      for (const z of m.numbers.leadingZero) lz.push(`${s}:「${z.num}」${z.str.slice(0, 24)}`);
      for (const [k, v] of Object.entries(m.numbers.patterns)) { if (!pats[k]) pats[k] = { n: 0, ex: v.ex }; pats[k].n += v.count; }
    }
    push(lz.length ? `- 先頭ゼロ ${lz.length}件: ${uniq(lz).slice(0, 6).join(" ; ")}` : "- 先頭ゼロの数字: なし");
    const top = Object.entries(pats).sort((a, b) => b[1].n - a[1].n).slice(0, 22);
    push(`- 書き方(#=数字、前後1〜2字つき): ${top.map(([k, v]) => `${k}×${v.n}`).join("  ")}`);
  }
  push();

  // ── アニメーション ──
  push("## 300ms を超えるアニメーション・トランジション");
  {
    const g = new Map();
    for (const s of states) for (const t of themes) {
      const m = M[s].themes[t]; if (!m) continue;
      for (const a of m.anim) { const k = `${a.kind}|${a.sel}|${a.prop}|${a.durMs}`; const e = g.get(k) || { a, st: new Set() }; e.st.add(s); g.set(k, e); }
    }
    if (g.size === 0) push("- なし");
    for (const { a, st } of [...g.values()].slice(0, 14)) push(`- ${a.kind} ${a.sel} ${a.prop} ${a.durMs}ms${a.iter ? " ×" + a.iter : ""} (${st.size}状態)`);
    if (g.size > 14) push(`- …ほか${g.size - 14}件`);
  }
  push();

  // ── 未到達 ──
  push("## 撮れなかった状態");
  const miss = uniq(unreached.map((u) => `${u.state}[${u.theme}]: ${u.reason}`));
  if (!miss.length) push("- なし");
  for (const m of miss.slice(0, 10)) push(`- ${m}`);
  if (metrics.pageErrors.length) push(`- ページのエラー/コンソールエラー ${metrics.pageErrors.length}件(metrics.json の pageErrors)`);

  if (L.length > 150) { L.length = 149; L.push("…(150行で切り詰め。全データは metrics.json)"); }
  return L.join("\n") + "\n";
}

main().catch((e) => { console.error(e); process.exit(1); });
