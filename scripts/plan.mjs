/**
 * 収録計画: 主要戦法 × 主要戦法 の組み合わせ表と、各組み合わせをカバーするコース。
 * `node scripts/coverage.mjs` でこの表と実際のコースJSONを突き合わせて空白を出す。
 *
 * 使用率の出典: 将棋ウォーズ 約5万局(有段者)の集計
 *   https://ameblo.jp/nomap/entry-11581670868.html (2013年。公開されている唯一の数表)
 *   新しい集計(2021〜2025, note.com/tora9900)は数表が無いが、四間・三間・右四間・棒銀・
 *   相振りが多いという傾向は一致している。
 *
 * 方針(2026-09-15 に決めたもの):
 *   ① 使用率上位の戦法を選ぶ ② 戦法×戦法の表を作る
 *   ③ 駒組みは出典(人間の定跡)、仕掛け以降はエンジン ④ 既存パイプラインで実装
 *   序盤はエンジンが形を作れない(定跡手と他の手の差が±30点)ため、③を分業にしている。
 */

/** 相手として遭遇する戦法。usage は先手/後手の採用率(%)。 */
export const STRATEGIES = {
  shikenbisha:   { label: "四間飛車",        usage: [11.96, 11.42] },
  hayaishida:    { label: "早石田(三間飛車)", usage: [8.36, 3.77] },
  gokigen:       { label: "ゴキゲン中飛車",  usage: [5.03, 5.04] },
  sankenbisha:   { label: "三間飛車",        usage: [4.09, 5.48] },
  aifuribisha:   { label: "相振り飛車",      usage: [3.98, 6.06] },
  anaguma:       { label: "居飛車穴熊(持久戦)", usage: [3.51, 2.66] },
  yokofudori:    { label: "横歩取り",        usage: [2.85, 0] },
  mukaibisha:    { label: "向かい飛車",      usage: [2.26, 3.26] },
  kakugawari:    { label: "角換わり(一手損含む)", usage: [1.81, 5.28] },
  bougin:        { label: "棒銀(急戦)",      usage: [1.66, 0] },
  migishiken:    { label: "右四間飛車",      usage: [0, 2.19] },
  yagura:        { label: "矢倉",            usage: [0, 0] },
  aigakari:      { label: "相掛かり",        usage: [0, 0] },
};

/**
 * 組み合わせ。mine = 自分が指す戦法, opp = 相手の戦法。
 * courses = カバーしているコースID。status: "ok" | "thin"(片方の先後のみ等) | "gap"(無し) | "skip"(定跡として確立していない)
 * priority は「自分側の需要 × 相手側の遭遇率」の目安。数字が大きいほど先に作る。
 */
export const PAIRINGS = [
  // ── 居飛車を指す ──────────────────────────────────────────────
  { mine: "居飛車", opp: "shikenbisha", priority: 10, courses: ["ibisha-vs-shikenbisha--bougin","ibisha-vs-shikenbisha--sente","ibisha-vs-shikenbisha--45hayashikake","ibisha-vs-shikenbisha--saginomiya","ibisha-vs-shikenbisha--yamada","ibisha-vs-shikenbisha--anaguma","ibisha-vs-shikenbisha--gote"] },
  { mine: "居飛車", opp: "hayaishida",  priority: 9,  courses: [] },
  { mine: "居飛車", opp: "gokigen",     priority: 8,  courses: ["ibisha-vs-nakabisha--anaguma","ibisha-vs-nakabisha--gote"], note: "超速▲3七銀が無い" },
  { mine: "居飛車", opp: "sankenbisha", priority: 8,  courses: ["ibisha-vs-sankenbisha--bougin","ibisha-vs-sankenbisha--35hayashikake","ibisha-vs-sankenbisha--37kei","ibisha-vs-sankenbisha--gote"] },
  { mine: "居飛車", opp: "mukaibisha",  priority: 5,  courses: [] },
  { mine: "居飛車", opp: "kakugawari",  priority: 6,  courses: ["kakugawari--bougin","kakugawari--hayakurigin","kakugawari--gote"] },
  { mine: "居飛車", opp: "yagura",      priority: 4,  courses: ["yagura--24te","yagura--36gin37kei","yagura--gote"] },
  { mine: "居飛車", opp: "aigakari",    priority: 3,  courses: ["aigakari--bougin","aigakari--gote"] },
  { mine: "居飛車", opp: "yokofudori",  priority: 4,  courses: [] },
  // ── 四間飛車を指す ────────────────────────────────────────────
  { mine: "四間飛車", opp: "bougin",     priority: 9, courses: ["shikenbisha-vs-ibisha--basic","shikenbisha-vs-ibisha--sente","shikenbisha-vs-bougin--kuboryu","shikenbisha-vs-torisashi--basic","shikenbisha-vs-ponponkei--basic"] },
  { mine: "四間飛車", opp: "anaguma",    priority: 7, courses: ["shikenbisha-vs-anaguma--basic","shikenbisha-vs-anaguma--sokkou"] },
  { mine: "四間飛車", opp: "migishiken", priority: 6, courses: ["shikenbisha-vs-migishiken--41kin"] },
  { mine: "四間飛車", opp: "aifuribisha",priority: 8, courses: [] },
  // ── 三間飛車を指す ────────────────────────────────────────────
  { mine: "三間飛車", opp: "bougin",     priority: 7, courses: ["sankenbisha-vs-ibisha--basic","sankenbisha-vs-ibisha--sente","sankenbisha-vs-bougin--53kin","sankenbisha-vs-45hayashikake--sabaki"] },
  { mine: "三間飛車", opp: "anaguma",    priority: 6, courses: ["sankenbisha-vs-anaguma--koyan"] },
  { mine: "三間飛車", opp: "aifuribisha",priority: 7, courses: [] },
  { mine: "早石田",   opp: "bougin",     priority: 7, courses: [], note: "自分が早石田を指すコースが無い" },
  // ── 中飛車を指す ──────────────────────────────────────────────
  { mine: "中飛車", opp: "bougin",       priority: 8, courses: ["nakabisha-vs-ibisha--gokigen24"], note: "超速▲3七銀への受けが無い" },
  { mine: "中飛車", opp: "anaguma",      priority: 6, courses: ["nakabisha-vs-anaguma--basic","nakabisha-vs-ibisha--sente"] },
  { mine: "中飛車", opp: "aifuribisha",  priority: 6, courses: [] },
  // ── 向かい飛車を指す ──────────────────────────────────────────
  { mine: "向かい飛車", opp: "bougin",   priority: 5, courses: [] },
  // ── 奇襲 ─────────────────────────────────────────────────────
  { mine: "筋違い角", opp: "bougin",     priority: 2, courses: ["sujichigaikaku--basic"] },
];
