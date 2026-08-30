/**
 * 定石データ(JSON)のロード + 簡易ランタイム検証。
 * DESIGN.md §3.2 の JosekiCourse/JosekiNode/JosekiMove 構造に沿った JSON を
 * import し、最低限の形状チェックをしてから返す。
 */
import type { JosekiCourse, JosekiMove, JosekiNode } from "./types";
import ibishaVsShikenbishaSente from "../data/joseki/ibisha-vs-shikenbisha--sente.json";
import ibishaVsShikenbishaBougin from "../data/joseki/ibisha-vs-shikenbisha--bougin.json";
import ibishaVsShikenbisha45 from "../data/joseki/ibisha-vs-shikenbisha--45hayashikake.json";
import ibishaVsShikenbishaAnaguma from "../data/joseki/ibisha-vs-shikenbisha--anaguma.json";
import branchNavDemo from "../data/joseki/_branchNavDemo.json";

function isJosekiMove(value: unknown): value is JosekiMove {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.usi === "string" &&
    (m.kind === "main" || m.kind === "alt" || m.kind === "deviation") &&
    (m.child === null || isJosekiNode(m.child))
  );
}

function isJosekiNode(value: unknown): value is JosekiNode {
  if (typeof value !== "object" || value === null) return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.sfen === "string" &&
    Array.isArray(n.branches) &&
    n.branches.every(isJosekiMove)
  );
}

function assertJosekiCourse(value: unknown, source: string): JosekiCourse {
  if (typeof value !== "object" || value === null) {
    throw new Error(`定石データが不正です(${source}): オブジェクトではありません`);
  }
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || !c.id) {
    throw new Error(`定石データが不正です(${source}): id がありません`);
  }
  if (c.mySide !== "sente" && c.mySide !== "gote") {
    throw new Error(`定石データが不正です(${source}): mySide が sente/gote ではありません`);
  }
  if ("source" in c && typeof c.source !== "string") {
    throw new Error(`定石データが不正です(${source}): source は文字列である必要があります`);
  }
  if (!isJosekiNode(c.root)) {
    throw new Error(`定石データが不正です(${source}): root が JosekiNode の形をしていません`);
  }
  return c as unknown as JosekiCourse;
}

/** 居飛車 vs 四間飛車(先手・斜め棒銀)コースをロードする */
export function loadIbishaVsShikenbishaSente(): JosekiCourse {
  return assertJosekiCourse(ibishaVsShikenbishaSente, "ibisha-vs-shikenbisha--sente.json");
}

/** 収録済みコースの分類。選択画面の見出しに使う。 */
export type CourseKind = "急戦" | "持久戦";

/** 選択画面に出すコースの一覧項目。 */
export interface CourseEntry {
  id: string;
  /** 選択肢に出す短い名前。 */
  label: string;
  kind: CourseKind;
  /** どういう作戦かの一行説明。 */
  summary: string;
  load: () => JosekiCourse;
}

/**
 * 収録済みの定石コース一覧。
 * 並び順は学びやすさ順(素直な攻め → 応用 → 持久戦)にしている。
 * コースを追加したらここに足すだけで選択画面に出る。
 */
export const COURSE_ENTRIES: CourseEntry[] = [
  {
    id: "ibisha-vs-shikenbisha--bougin",
    label: "棒銀",
    kind: "急戦",
    summary: "銀をまっすぐ繰り出して2筋を破る、最も有名な急戦。",
    load: () => assertJosekiCourse(ibishaVsShikenbishaBougin, "ibisha-vs-shikenbisha--bougin.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--sente",
    label: "斜め棒銀(4六銀左)",
    kind: "急戦",
    summary: "左の銀を4六へ運び、3五歩から仕掛ける急戦。",
    load: () => assertJosekiCourse(ibishaVsShikenbishaSente, "ibisha-vs-shikenbisha--sente.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--45hayashikake",
    label: "４五歩早仕掛け",
    kind: "急戦",
    summary: "4六歩から4五歩と突き、4筋で戦いを起こす急戦。",
    load: () => assertJosekiCourse(ibishaVsShikenbisha45, "ibisha-vs-shikenbisha--45hayashikake.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--anaguma",
    label: "居飛車穴熊",
    kind: "持久戦",
    summary: "玉を隅まで運んで固く囲い、じっくり戦う持久戦。",
    load: () => assertJosekiCourse(ibishaVsShikenbishaAnaguma, "ibisha-vs-shikenbisha--anaguma.json"),
  },
];

/** id からコースをロードする。見つからなければ先頭のコースにフォールバックする。 */
export function loadCourseById(id: string): JosekiCourse {
  const entry = COURSE_ENTRIES.find((c) => c.id === id) ?? COURSE_ENTRIES[0];
  return entry.load();
}

/**
 * 分岐ナビ(本線/変化/逸れ手の切替)の仕組みを動作確認するためだけのデモ用フィクスチャ。
 * 実際の定跡データではない(内容はすべて【デモ】と明記済み)。ユーザー向け画面の
 * デフォルト表示には使わず、開発・検証用の画面からのみ読み込むこと。
 */
export function loadBranchNavDemo(): JosekiCourse {
  return assertJosekiCourse(branchNavDemo, "_branchNavDemo.json");
}

/** ノードの本線(branches[0])を辿り、末端(理想陣形)までのノード列を返す。UI外のテスト・検証にも使える。 */
export function listMainLineNodes(course: JosekiCourse): JosekiNode[] {
  const nodes: JosekiNode[] = [course.root];
  let current = course.root;
  while (current.branches.length > 0) {
    const child = current.branches[0].child;
    if (!child) break;
    nodes.push(child);
    current = child;
  }
  return nodes;
}
