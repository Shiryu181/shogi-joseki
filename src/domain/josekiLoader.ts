/**
 * 定石データ(JSON)のロード + 簡易ランタイム検証。
 * DESIGN.md §3.2 の JosekiCourse/JosekiNode/JosekiMove 構造に沿った JSON を
 * import し、最低限の形状チェックをしてから返す。
 */
import type { JosekiCourse, JosekiMove, JosekiNode } from "./types";
import ibishaVsShikenbishaSente from "../data/joseki/ibisha-vs-shikenbisha--sente.json";
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
