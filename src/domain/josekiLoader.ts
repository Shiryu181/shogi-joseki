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
import shikenbishaVsIbishaBasic from "../data/joseki/shikenbisha-vs-ibisha--basic.json";
import shikenbishaVsAnagumaBasic from "../data/joseki/shikenbisha-vs-anaguma--basic.json";
import ibishaVsSankenbishaBougin from "../data/joseki/ibisha-vs-sankenbisha--bougin.json";
import ibishaVsSankenbisha37 from "../data/joseki/ibisha-vs-sankenbisha--37kei.json";
import sankenbishaVsIbishaBasic from "../data/joseki/sankenbisha-vs-ibisha--basic.json";
import kakugawariBougin from "../data/joseki/kakugawari--bougin.json";
import kakugawariHayakurigin from "../data/joseki/kakugawari--hayakurigin.json";
import aigakariBougin from "../data/joseki/aigakari--bougin.json";
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
  /** どの戦法カードから辿れるか(Strategy.id)。選択画面はこれで絞り込む。 */
  strategyId: string;
  /** 選択肢に出す短い名前。 */
  label: string;
  kind: CourseKind;
  /** どういう作戦かの一行説明。 */
  summary: string;
  /** 相手の戦法(選択画面の表示用)。 */
  opponentLabel: string;
  /** 自分の手番(選択画面の表示用)。 */
  sideLabel: "先手" | "後手";
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
    strategyId: "ibisha",
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "棒銀",
    kind: "急戦",
    summary: "銀をまっすぐ繰り出して2筋を破る、最も有名な急戦。",
    load: () => assertJosekiCourse(ibishaVsShikenbishaBougin, "ibisha-vs-shikenbisha--bougin.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--sente",
    strategyId: "ibisha",
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "斜め棒銀(4六銀左)",
    kind: "急戦",
    summary: "左の銀を4六へ運び、3五歩から仕掛ける急戦。",
    load: () => assertJosekiCourse(ibishaVsShikenbishaSente, "ibisha-vs-shikenbisha--sente.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--45hayashikake",
    strategyId: "ibisha",
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "４五歩早仕掛け",
    kind: "急戦",
    summary: "4六歩から4五歩と突き、4筋で戦いを起こす急戦。",
    load: () => assertJosekiCourse(ibishaVsShikenbisha45, "ibisha-vs-shikenbisha--45hayashikake.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--anaguma",
    strategyId: "ibisha",
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "居飛車穴熊",
    kind: "持久戦",
    summary: "玉を隅まで運んで固く囲い、じっくり戦う持久戦。",
    load: () => assertJosekiCourse(ibishaVsShikenbishaAnaguma, "ibisha-vs-shikenbisha--anaguma.json"),
  },
  {
    id: "ibisha-vs-sankenbisha--bougin",
    strategyId: "ibisha",
    opponentLabel: "三間飛車",
    sideLabel: "先手",
    label: "対三間飛車・急戦",
    kind: "急戦",
    summary: "三間飛車が相手のとき。舟囲いから4六歩と攻めの形を作る。",
    load: () => assertJosekiCourse(ibishaVsSankenbishaBougin, "ibisha-vs-sankenbisha--bougin.json"),
  },
  {
    id: "ibisha-vs-sankenbisha--37kei",
    strategyId: "ibisha",
    opponentLabel: "三間飛車",
    sideLabel: "先手",
    label: "対三間飛車・▲3七桂早仕掛け",
    kind: "急戦",
    summary: "桂を3七へ跳ね、4五歩から角交換して飛車先の突破を狙う。",
    load: () => assertJosekiCourse(ibishaVsSankenbisha37, "ibisha-vs-sankenbisha--37kei.json"),
  },
  {
    id: "shikenbisha-vs-ibisha--basic",
    strategyId: "shikenbisha",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "基本の組み方",
    kind: "持久戦",
    summary: "飛車を4二へ振り、美濃囲いに収めるまで。四間飛車の土台。",
    load: () => assertJosekiCourse(shikenbishaVsIbishaBasic, "shikenbisha-vs-ibisha--basic.json"),
  },
  {
    id: "shikenbisha-vs-anaguma--basic",
    strategyId: "shikenbisha",
    opponentLabel: "居飛車穴熊",
    sideLabel: "後手",
    label: "対居飛車穴熊",
    kind: "持久戦",
    summary: "相手が穴熊に組む前に、6四歩〜7三桂と動いて主導権を取る。",
    load: () => assertJosekiCourse(shikenbishaVsAnagumaBasic, "shikenbisha-vs-anaguma--basic.json"),
  },
  {
    id: "sankenbisha-vs-ibisha--basic",
    strategyId: "sankenbisha",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "基本の組み方",
    kind: "持久戦",
    summary: "飛車を3二へ振り、美濃囲いに収めるまで。三間飛車の土台。",
    load: () => assertJosekiCourse(sankenbishaVsIbishaBasic, "sankenbisha-vs-ibisha--basic.json"),
  },
  {
    id: "kakugawari--bougin",
    strategyId: "kakugawari",
    opponentLabel: "角換わり",
    sideLabel: "先手",
    label: "棒銀",
    kind: "急戦",
    summary: "角を交換したあと、銀を2七→2六と繰り出して2筋を攻める。",
    load: () => assertJosekiCourse(kakugawariBougin, "kakugawari--bougin.json"),
  },
  {
    id: "kakugawari--hayakurigin",
    strategyId: "kakugawari",
    opponentLabel: "角換わり",
    sideLabel: "先手",
    label: "早繰り銀",
    kind: "急戦",
    summary: "銀を3七→4六と早めに使い、幅広く攻める。棒銀と対になる指し方。",
    load: () => assertJosekiCourse(kakugawariHayakurigin, "kakugawari--hayakurigin.json"),
  },
  {
    id: "aigakari--bougin",
    strategyId: "aigakari",
    opponentLabel: "相掛かり",
    sideLabel: "先手",
    label: "棒銀",
    kind: "急戦",
    summary: "お互いに飛車先の歩を交換したあと、銀を2七へ繰り出す。",
    load: () => assertJosekiCourse(aigakariBougin, "aigakari--bougin.json"),
  },
];

/** 指定した戦法カードから選べるコース一覧。 */
export function courseEntriesFor(strategyId: string): CourseEntry[] {
  return COURSE_ENTRIES.filter((c) => c.strategyId === strategyId);
}

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
