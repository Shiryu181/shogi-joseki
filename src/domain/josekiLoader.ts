/**
 * 定跡データ(JSON)のロード + 簡易ランタイム検証。
 * DESIGN.md §3.2 の JosekiCourse/JosekiNode/JosekiMove 構造に沿った JSON を
 * import し、最低限の形状チェックをしてから返す。
 */
import type { JosekiCourse, JosekiMove, JosekiNode } from "./types";
import ibishaVsShikenbishaSenteRaw from "../data/joseki/ibisha-vs-shikenbisha--sente.json?raw";
import ibishaVsShikenbishaBouginRaw from "../data/joseki/ibisha-vs-shikenbisha--bougin.json?raw";
import ibishaVsShikenbisha45Raw from "../data/joseki/ibisha-vs-shikenbisha--45hayashikake.json?raw";
import ibishaVsShikenbishaYamadaRaw from "../data/joseki/ibisha-vs-shikenbisha--yamada.json?raw";
import ibishaVsShikenbishaSaginomiyaRaw from "../data/joseki/ibisha-vs-shikenbisha--saginomiya.json?raw";
import ibishaVsShikenbishaAnagumaRaw from "../data/joseki/ibisha-vs-shikenbisha--anaguma.json?raw";
import shikenbishaVsIbishaBasicRaw from "../data/joseki/shikenbisha-vs-ibisha--basic.json?raw";
import shikenbishaVsAnagumaBasicRaw from "../data/joseki/shikenbisha-vs-anaguma--basic.json?raw";
import shikenbishaVsBouginKuboryuRaw from "../data/joseki/shikenbisha-vs-bougin--kuboryu.json?raw";
import shikenbishaVsAnagumaSokkouRaw from "../data/joseki/shikenbisha-vs-anaguma--sokkou.json?raw";
import shikenbishaVsMigishikenRaw from "../data/joseki/shikenbisha-vs-migishiken--41kin.json?raw";
import shikenbishaVsPonponkeiRaw from "../data/joseki/shikenbisha-vs-ponponkei--basic.json?raw";
import shikenbishaVsTorisashiRaw from "../data/joseki/shikenbisha-vs-torisashi--basic.json?raw";
import ibishaVsSankenbishaBouginRaw from "../data/joseki/ibisha-vs-sankenbisha--bougin.json?raw";
import ibishaVsSankenbisha37Raw from "../data/joseki/ibisha-vs-sankenbisha--37kei.json?raw";
import ibishaVsSankenbisha35Raw from "../data/joseki/ibisha-vs-sankenbisha--35hayashikake.json?raw";
import sankenbishaVsIbishaBasicRaw from "../data/joseki/sankenbisha-vs-ibisha--basic.json?raw";
import sankenbishaVsBougin53Raw from "../data/joseki/sankenbisha-vs-bougin--53kin.json?raw";
import sankenbishaVs45Raw from "../data/joseki/sankenbisha-vs-45hayashikake--sabaki.json?raw";
import sankenbishaVsAnagumaKoyanRaw from "../data/joseki/sankenbisha-vs-anaguma--koyan.json?raw";
import kakugawariBouginRaw from "../data/joseki/kakugawari--bougin.json?raw";
import kakugawariHayakuriginRaw from "../data/joseki/kakugawari--hayakurigin.json?raw";
import aigakariBouginRaw from "../data/joseki/aigakari--bougin.json?raw";
import yagura24teRaw from "../data/joseki/yagura--24te.json?raw";
import yagura36gin37keiRaw from "../data/joseki/yagura--36gin37kei.json?raw";
import nakabishaVsAnagumaRaw from "../data/joseki/nakabisha-vs-anaguma--basic.json?raw";
import nakabishaGokigen24Raw from "../data/joseki/nakabisha-vs-ibisha--gokigen24.json?raw";
import sujichigaikakuBasicRaw from "../data/joseki/sujichigaikaku--basic.json?raw";
import ibishaVsNakabishaAnagumaRaw from "../data/joseki/ibisha-vs-nakabisha--anaguma.json?raw";
import kakugawariGoteRaw from "../data/joseki/kakugawari--gote.json?raw";
import yaguraGoteRaw from "../data/joseki/yagura--gote.json?raw";
import aigakariGoteRaw from "../data/joseki/aigakari--gote.json?raw";
import shikenbishaSenteRaw from "../data/joseki/shikenbisha-vs-ibisha--sente.json?raw";
import ibishaVsShikenbishaGoteRaw from "../data/joseki/ibisha-vs-shikenbisha--gote.json?raw";
import sankenbishaSenteRaw from "../data/joseki/sankenbisha-vs-ibisha--sente.json?raw";
import ibishaVsSankenbishaGoteRaw from "../data/joseki/ibisha-vs-sankenbisha--gote.json?raw";
import nakabishaSenteRaw from "../data/joseki/nakabisha-vs-ibisha--sente.json?raw";
import ibishaVsNakabishaGoteRaw from "../data/joseki/ibisha-vs-nakabisha--gote.json?raw";
import ibishaVsGokigenChousokuRaw from "../data/joseki/ibisha-vs-gokigen--chousoku.json?raw";
import nakabishaVsChousokuGoteRaw from "../data/joseki/nakabisha-vs-chousoku--gote.json?raw";
import hayaishidaBasicRaw from "../data/joseki/hayaishida--basic.json?raw";
import ibishaVsHayaishida42Raw from "../data/joseki/ibisha-vs-hayaishida--42gyoku.json?raw";
import sankenbishaVsNakabishaAifuriRaw from "../data/joseki/sankenbisha-vs-nakabisha--aifuri.json?raw";
import nakabishaVsSankenbishaAifuriRaw from "../data/joseki/nakabisha-vs-sankenbisha--aifuri.json?raw";
import sankenbishaVsMukaibishaAifuriRaw from "../data/joseki/sankenbisha-vs-mukaibisha--aifuri.json?raw";
import branchNavDemoRaw from "../data/joseki/_branchNavDemo.json?raw";

/**
 * 定跡 JSON は「手 → 次の局面 → 手 → …」の入れ子構造なので、手数が増えるほど
 * ネストが深くなる。JSON を ES モジュールへ変換するビルド時プラグインは、
 * 47手のコースで再帰上限に達してビルドが落ちた。
 * そこで ?raw で文字列として読み込み、実行時に JSON.parse する
 * (こちらは深いネストでも問題なく、パースの負荷も無視できる)。
 */
function parseRaw(raw: string): unknown {
  return JSON.parse(raw);
}

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
    throw new Error(`定跡データが不正です(${source}): オブジェクトではありません`);
  }
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || !c.id) {
    throw new Error(`定跡データが不正です(${source}): id がありません`);
  }
  if (c.mySide !== "sente" && c.mySide !== "gote") {
    throw new Error(`定跡データが不正です(${source}): mySide が sente/gote ではありません`);
  }
  if ("goalLabel" in c && typeof c.goalLabel !== "string") {
    throw new Error(`定跡データが不正です(${source}): goalLabel は文字列である必要があります`);
  }
  if ("source" in c && typeof c.source !== "string") {
    throw new Error(`定跡データが不正です(${source}): source は文字列である必要があります`);
  }
  if (!isJosekiNode(c.root)) {
    throw new Error(`定跡データが不正です(${source}): root が JosekiNode の形をしていません`);
  }
  return c as unknown as JosekiCourse;
}

/** 居飛車 vs 四間飛車(先手・斜め棒銀)コースをロードする */
export function loadIbishaVsShikenbishaSente(): JosekiCourse {
  return assertJosekiCourse(parseRaw(ibishaVsShikenbishaSenteRaw), "ibisha-vs-shikenbisha--sente.json");
}

/** 収録済みコースの分類。選択画面の見出しに使う。 */
export type CourseKind = "急戦" | "持久戦";

/** 選択画面に出すコースの一覧項目。 */
export interface CourseEntry {
  id: string;
  /**
   * 「自分の戦法」タブのどのカードから辿れるか(Strategy.id)。
   * null は「自分の戦法としては学ばない」コース(対振り急戦の細かな変化など)。
   * そうしたコースは「相手に備える」タブからだけ辿れる。
   */
  strategyId: string | null;
  /** 「相手に備える」タブのどのカードから辿れるか(OPPONENTS の id)。 */
  opponentId: string;
  /** 「相手に備える」で並べる順(小さいほど推奨)。1 がその相手への第一の対策。 */
  recommend: number;
  /** 「自分の戦法」の画面で見出しにする分類(基本の組み方 / 対四間飛車 / 相振り飛車 …)。 */
  group?: string;
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
 * 収録済みの定跡コース一覧。
 * 並び順は学びやすさ順(素直な攻め → 応用 → 持久戦)にしている。
 * コースを追加したらここに足すだけで選択画面に出る。
 */
export const COURSE_ENTRIES: CourseEntry[] = [
  {
    id: "ibisha-vs-shikenbisha--bougin",
    strategyId: "bougin",
    opponentId: "shikenbisha",
    recommend: 1,
    group: "対四間飛車",
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "棒銀",
    kind: "急戦",
    summary: "銀をまっすぐ繰り出して2筋を破る、最も有名な急戦。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsShikenbishaBouginRaw), "ibisha-vs-shikenbisha--bougin.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--sente",
    strategyId: null,
    opponentId: "shikenbisha",
    recommend: 3,
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "斜め棒銀(4六銀左)",
    kind: "急戦",
    summary: "左の銀を4六へ運び、3五歩から仕掛ける急戦。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsShikenbishaSenteRaw), "ibisha-vs-shikenbisha--sente.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--45hayashikake",
    strategyId: null,
    opponentId: "shikenbisha",
    recommend: 4,
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "４五歩早仕掛け",
    kind: "急戦",
    summary: "4六歩から4五歩と突き、4筋で戦いを起こす急戦。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsShikenbisha45Raw), "ibisha-vs-shikenbisha--45hayashikake.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--yamada",
    strategyId: null,
    opponentId: "shikenbisha",
    recommend: 6,
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "山田定跡",
    kind: "急戦",
    summary: "相手が△3二銀型のときに有効な急戦。3筋を突き捨てて銀を繰り出す。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsShikenbishaYamadaRaw), "ibisha-vs-shikenbisha--yamada.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--saginomiya",
    strategyId: null,
    opponentId: "shikenbisha",
    recommend: 5,
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "鷺宮定跡",
    kind: "急戦",
    summary: "飛車を3筋へ回して角頭を攻める、青野照市九段創案の急戦。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsShikenbishaSaginomiyaRaw), "ibisha-vs-shikenbisha--saginomiya.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--anaguma",
    strategyId: "anaguma",
    opponentId: "shikenbisha",
    recommend: 2,
    group: "対四間飛車",
    opponentLabel: "四間飛車",
    sideLabel: "先手",
    label: "居飛車穴熊",
    kind: "持久戦",
    summary: "玉を隅まで運んで固く囲い、じっくり戦う持久戦。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsShikenbishaAnagumaRaw), "ibisha-vs-shikenbisha--anaguma.json"),
  },
  {
    id: "ibisha-vs-sankenbisha--bougin",
    strategyId: "bougin",
    opponentId: "sankenbisha",
    recommend: 1,
    group: "対三間飛車",
    opponentLabel: "三間飛車",
    sideLabel: "先手",
    label: "急戦",
    kind: "急戦",
    summary: "舟囲いから4六歩と突いて攻めの形を作る。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsSankenbishaBouginRaw), "ibisha-vs-sankenbisha--bougin.json"),
  },
  {
    id: "ibisha-vs-sankenbisha--37kei",
    strategyId: null,
    opponentId: "sankenbisha",
    recommend: 3,
    opponentLabel: "三間飛車",
    sideLabel: "先手",
    label: "▲3七桂早仕掛け",
    kind: "急戦",
    summary: "桂を3七へ跳ね、4五歩から角交換して飛車先の突破を狙う。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsSankenbisha37Raw), "ibisha-vs-sankenbisha--37kei.json"),
  },
  {
    id: "ibisha-vs-sankenbisha--35hayashikake",
    strategyId: null,
    opponentId: "sankenbisha",
    recommend: 2,
    opponentLabel: "三間飛車",
    sideLabel: "先手",
    label: "▲3五歩早仕掛け",
    kind: "急戦",
    summary: "いきなり3筋の歩をぶつけて、銀と飛車を働かせる急戦。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsSankenbisha35Raw), "ibisha-vs-sankenbisha--35hayashikake.json"),
  },
  {
    id: "ibisha-vs-shikenbisha--gote",
    strategyId: "bougin",
    opponentId: "shikenbisha",
    recommend: 7,
    group: "対四間飛車",
    opponentLabel: "四間飛車",
    sideLabel: "後手",
    label: "基本の組み方",
    kind: "急戦",
    summary: "飛車先を伸ばしつつ玉を囲う、後手番の組み方。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsShikenbishaGoteRaw), "ibisha-vs-shikenbisha--gote.json"),
  },
  {
    id: "ibisha-vs-sankenbisha--gote",
    strategyId: "bougin",
    opponentId: "sankenbisha",
    recommend: 4,
    group: "対三間飛車",
    opponentLabel: "三間飛車",
    sideLabel: "後手",
    label: "基本の組み方",
    kind: "急戦",
    summary: "飛車先を伸ばしつつ玉を囲う、後手番の組み方。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsSankenbishaGoteRaw), "ibisha-vs-sankenbisha--gote.json"),
  },
  {
    id: "ibisha-vs-nakabisha--gote",
    strategyId: "anaguma",
    opponentId: "gokigen",
    recommend: 3,
    group: "対中飛車",
    opponentLabel: "中飛車",
    sideLabel: "後手",
    label: "居飛車穴熊",
    kind: "持久戦",
    summary: "玉を1一まで運んで堅く囲う、後手番の穴熊。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsNakabishaGoteRaw), "ibisha-vs-nakabisha--gote.json"),
  },
  {
    id: "ibisha-vs-nakabisha--anaguma",
    strategyId: "anaguma",
    opponentId: "gokigen",
    recommend: 2,
    group: "対中飛車",
    opponentLabel: "中飛車",
    sideLabel: "先手",
    label: "居飛車穴熊",
    kind: "持久戦",
    summary: "中央から来る攻めに、穴熊の堅さで対抗する。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsNakabishaAnagumaRaw), "ibisha-vs-nakabisha--anaguma.json"),
  },
  {
    id: "shikenbisha-vs-ibisha--basic",
    strategyId: "shikenbisha",
    opponentId: "ibisha-kyusen",
    recommend: 2,
    group: "基本の組み方",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "基本の組み方",
    kind: "持久戦",
    summary: "飛車を4二へ振り、美濃囲いに収めるまで。四間飛車の土台。",
    load: () => assertJosekiCourse(parseRaw(shikenbishaVsIbishaBasicRaw), "shikenbisha-vs-ibisha--basic.json"),
  },
  {
    id: "shikenbisha-vs-bougin--kuboryu",
    strategyId: "shikenbisha",
    opponentId: "ibisha-kyusen",
    recommend: 1,
    group: "対棒銀",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "対棒銀(久保流)",
    kind: "急戦",
    summary: "棒銀の攻めを受け止めるのではなく、△4五歩から捌いて反撃する。",
    load: () => assertJosekiCourse(parseRaw(shikenbishaVsBouginKuboryuRaw), "shikenbisha-vs-bougin--kuboryu.json"),
  },
  {
    id: "shikenbisha-vs-migishiken--41kin",
    strategyId: "shikenbisha",
    opponentId: "migishiken",
    recommend: 1,
    group: "対右四間飛車",
    opponentLabel: "右四間飛車",
    sideLabel: "後手",
    label: "対右四間飛車(△4一金待機型)",
    kind: "急戦",
    summary: "4筋に集中する攻めを、△1二香と△3一金で受け止める定跡の受け方。",
    load: () => assertJosekiCourse(parseRaw(shikenbishaVsMigishikenRaw), "shikenbisha-vs-migishiken--41kin.json"),
  },
  {
    id: "shikenbisha-vs-ponponkei--basic",
    strategyId: "shikenbisha",
    opponentId: "ponponkei",
    recommend: 1,
    group: "対奇襲",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "対ポンポン桂",
    kind: "急戦",
    summary: "跳ねてきた桂は取ってよい。飛車を成らせても紐をつけて受け止める。",
    load: () => assertJosekiCourse(parseRaw(shikenbishaVsPonponkeiRaw), "shikenbisha-vs-ponponkei--basic.json"),
  },
  {
    id: "shikenbisha-vs-torisashi--basic",
    strategyId: "shikenbisha",
    opponentId: "torisashi",
    recommend: 1,
    group: "対奇襲",
    opponentLabel: "鳥刺し(嬉野流)",
    sideLabel: "後手",
    label: "対鳥刺し",
    kind: "急戦",
    summary: "無理に攻めず手厚く受け、攻めの反動を利用して好形に組む。",
    load: () => assertJosekiCourse(parseRaw(shikenbishaVsTorisashiRaw), "shikenbisha-vs-torisashi--basic.json"),
  },
  {
    id: "shikenbisha-vs-ibisha--sente",
    strategyId: "shikenbisha",
    opponentId: "ibisha-kyusen",
    recommend: 3,
    group: "基本の組み方",
    opponentLabel: "居飛車",
    sideLabel: "先手",
    label: "先手番の組み方",
    kind: "持久戦",
    summary: "先手番で四間飛車を指す場合。飛車は6八、玉は2八の美濃囲いになる。",
    load: () => assertJosekiCourse(parseRaw(shikenbishaSenteRaw), "shikenbisha-vs-ibisha--sente.json"),
  },
  {
    id: "shikenbisha-vs-anaguma--basic",
    strategyId: "shikenbisha",
    opponentId: "anaguma",
    recommend: 2,
    group: "対居飛車穴熊",
    opponentLabel: "居飛車穴熊",
    sideLabel: "後手",
    label: "対居飛車穴熊",
    kind: "持久戦",
    summary: "相手が穴熊に組む前に、6四歩〜7三桂と動いて主導権を取る。",
    load: () => assertJosekiCourse(parseRaw(shikenbishaVsAnagumaBasicRaw), "shikenbisha-vs-anaguma--basic.json"),
  },
  {
    id: "shikenbisha-vs-anaguma--sokkou",
    strategyId: "shikenbisha",
    opponentId: "anaguma",
    recommend: 1,
    group: "対居飛車穴熊",
    opponentLabel: "居飛車穴熊",
    sideLabel: "先手",
    label: "穴熊に組ませない速攻",
    kind: "急戦",
    summary: "右桂を早めに跳ね、角のラインと4筋への集中で穴熊が完成する前に攻める。",
    load: () => assertJosekiCourse(parseRaw(shikenbishaVsAnagumaSokkouRaw), "shikenbisha-vs-anaguma--sokkou.json"),
  },
  {
    id: "sankenbisha-vs-ibisha--basic",
    strategyId: "sankenbisha",
    opponentId: "ibisha-kyusen",
    recommend: 3,
    group: "基本の組み方",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "基本の組み方",
    kind: "持久戦",
    summary: "飛車を3二へ振り、美濃囲いに収めるまで。三間飛車の土台。",
    load: () => assertJosekiCourse(parseRaw(sankenbishaVsIbishaBasicRaw), "sankenbisha-vs-ibisha--basic.json"),
  },
  {
    id: "sankenbisha-vs-bougin--53kin",
    strategyId: "sankenbisha",
    opponentId: "ibisha-kyusen",
    recommend: 4,
    group: "対急戦",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "対棒銀(△5三金型)",
    kind: "急戦",
    summary: "飛車を回す一手が要らない三間飛車ならではの、手厚い棒銀の受け方。",
    load: () => assertJosekiCourse(parseRaw(sankenbishaVsBougin53Raw), "sankenbisha-vs-bougin--53kin.json"),
  },
  {
    id: "sankenbisha-vs-45hayashikake--sabaki",
    strategyId: "sankenbisha",
    opponentId: "ibisha-kyusen",
    recommend: 5,
    group: "対急戦",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "対▲4五歩早仕掛け",
    kind: "急戦",
    summary: "受けるのではなく、角を捌いて馬を作る三間飛車の考え方。",
    load: () => assertJosekiCourse(parseRaw(sankenbishaVs45Raw), "sankenbisha-vs-45hayashikake--sabaki.json"),
  },
  {
    id: "sankenbisha-vs-anaguma--koyan",
    strategyId: "sankenbisha",
    opponentId: "anaguma",
    recommend: 3,
    group: "対居飛車穴熊",
    opponentLabel: "居飛車穴熊",
    sideLabel: "先手",
    label: "コーヤン流",
    kind: "持久戦",
    summary: "玉を3九に構え、角で相手玉をにらみながら端から攻め潰す。",
    load: () => assertJosekiCourse(parseRaw(sankenbishaVsAnagumaKoyanRaw), "sankenbisha-vs-anaguma--koyan.json"),
  },
  {
    id: "sankenbisha-vs-ibisha--sente",
    strategyId: "sankenbisha",
    opponentId: "ibisha-kyusen",
    recommend: 6,
    group: "基本の組み方",
    opponentLabel: "居飛車",
    sideLabel: "先手",
    label: "先手番の組み方",
    kind: "持久戦",
    summary: "先手番で三間飛車を指す場合。飛車は7八、玉は2八の美濃囲いになる。",
    load: () => assertJosekiCourse(parseRaw(sankenbishaSenteRaw), "sankenbisha-vs-ibisha--sente.json"),
  },
  {
    id: "nakabisha-vs-ibisha--sente",
    strategyId: "gokigen",
    opponentId: "anaguma",
    recommend: 4,
    group: "対居飛車穴熊",
    opponentLabel: "居飛車穴熊",
    sideLabel: "先手",
    label: "先手番の組み方",
    kind: "持久戦",
    summary: "先手番で中飛車を指す場合。飛車は5八、玉は2八の美濃囲いになる。",
    load: () => assertJosekiCourse(parseRaw(nakabishaSenteRaw), "nakabisha-vs-ibisha--sente.json"),
  },
  {
    id: "kakugawari--bougin",
    strategyId: "kakugawari",
    opponentId: "kakugawari",
    recommend: 1,
    group: "基本と変化",
    opponentLabel: "居飛車",
    sideLabel: "先手",
    label: "角換わり・棒銀",
    kind: "急戦",
    summary: "角を交換したあと、銀を2七→2六と繰り出して2筋を攻める。",
    load: () => assertJosekiCourse(parseRaw(kakugawariBouginRaw), "kakugawari--bougin.json"),
  },
  {
    id: "kakugawari--hayakurigin",
    strategyId: "kakugawari",
    opponentId: "kakugawari",
    recommend: 2,
    group: "基本と変化",
    opponentLabel: "居飛車",
    sideLabel: "先手",
    label: "角換わり・早繰り銀",
    kind: "急戦",
    summary: "銀を3七→4六と早めに使い、幅広く攻める。棒銀と対になる指し方。",
    load: () => assertJosekiCourse(parseRaw(kakugawariHayakuriginRaw), "kakugawari--hayakurigin.json"),
  },
  {
    id: "kakugawari--gote",
    strategyId: "kakugawari",
    opponentId: "kakugawari",
    recommend: 3,
    group: "基本と変化",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "角換わり・基本の駒組み",
    kind: "急戦",
    summary: "後手番で角換わりに進む場合の組み方。相手の棒銀に備える。",
    load: () => assertJosekiCourse(parseRaw(kakugawariGoteRaw), "kakugawari--gote.json"),
  },
  {
    id: "aigakari--bougin",
    strategyId: "aigakari",
    opponentId: "aigakari",
    recommend: 1,
    group: "基本と変化",
    opponentLabel: "居飛車",
    sideLabel: "先手",
    label: "相掛かり・棒銀",
    kind: "急戦",
    summary: "お互いに飛車先の歩を交換したあと、銀を2七へ繰り出す。",
    load: () => assertJosekiCourse(parseRaw(aigakariBouginRaw), "aigakari--bougin.json"),
  },
  {
    id: "aigakari--gote",
    strategyId: "aigakari",
    opponentId: "aigakari",
    recommend: 2,
    group: "基本と変化",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "相掛かり・基本の駒組み",
    kind: "急戦",
    summary: "後手番で相掛かりを受けて立つ場合の組み方。",
    load: () => assertJosekiCourse(parseRaw(aigakariGoteRaw), "aigakari--gote.json"),
  },
  {
    id: "yagura--24te",
    strategyId: "yagura",
    opponentId: "yagura",
    recommend: 1,
    group: "基本と変化",
    opponentLabel: "居飛車",
    sideLabel: "先手",
    label: "矢倉・24手組",
    kind: "持久戦",
    summary: "金銀を組み上げる矢倉の基本形。相居飛車の代表的な駒組み。",
    load: () => assertJosekiCourse(parseRaw(yagura24teRaw), "yagura--24te.json"),
  },
  {
    id: "yagura--36gin37kei",
    strategyId: "yagura",
    opponentId: "yagura",
    recommend: 2,
    group: "基本と変化",
    opponentLabel: "矢倉",
    sideLabel: "先手",
    label: "3六銀3七桂の攻め",
    kind: "急戦",
    summary: "24手組から攻めの形を作り、2筋の継ぎ歩から急所の▲3三歩まで。",
    load: () => assertJosekiCourse(parseRaw(yagura36gin37keiRaw), "yagura--36gin37kei.json"),
  },
  {
    id: "yagura--gote",
    strategyId: "yagura",
    opponentId: "yagura",
    recommend: 3,
    group: "基本と変化",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "矢倉・24手組",
    kind: "持久戦",
    summary: "後手番で矢倉に組む場合の24手組。お互いに同じ形に組み合う。",
    load: () => assertJosekiCourse(parseRaw(yaguraGoteRaw), "yagura--gote.json"),
  },
  {
    id: "nakabisha-vs-anaguma--basic",
    strategyId: "gokigen",
    opponentId: "anaguma",
    recommend: 5,
    group: "対居飛車穴熊",
    opponentLabel: "居飛車穴熊",
    sideLabel: "後手",
    label: "対居飛車穴熊",
    kind: "持久戦",
    summary: "飛車を5二へ振り、美濃囲いに収めて4五歩と位を取るまで。",
    load: () => assertJosekiCourse(parseRaw(nakabishaVsAnagumaRaw), "nakabisha-vs-anaguma--basic.json"),
  },
  {
    id: "nakabisha-vs-ibisha--gokigen24",
    strategyId: "gokigen",
    opponentId: "ibisha-kyusen",
    recommend: 7,
    group: "基本と受け方",
    opponentLabel: "居飛車",
    sideLabel: "後手",
    label: "対速攻▲2四歩",
    kind: "急戦",
    summary: "飛車先を切られたら角交換から反撃する、ゴキゲン中飛車の主張。",
    load: () => assertJosekiCourse(parseRaw(nakabishaGokigen24Raw), "nakabisha-vs-ibisha--gokigen24.json"),
  },
  {
    id: "ibisha-vs-gokigen--chousoku",
    strategyId: "chousoku",
    opponentId: "gokigen",
    recommend: 1,
    group: "基本",
    opponentLabel: "ゴキゲン中飛車",
    sideLabel: "先手",
    label: "超速▲3七銀",
    kind: "急戦",
    summary: "右銀を素早く4六へ繰り出し、2枚銀で5五の歩を狙う現代の主流対策。攻め方まで収録。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsGokigenChousokuRaw), "ibisha-vs-gokigen--chousoku.json"),
  },
  {
    id: "ibisha-vs-hayaishida--42gyoku",
    strategyId: null,
    opponentId: "hayaishida",
    recommend: 1,
    opponentLabel: "早石田",
    sideLabel: "後手",
    label: "△4二玉で罠を消す",
    kind: "急戦",
    summary: "▲7五歩を見たらすぐ玉を上がり、早石田の王手飛車の筋を消してから普通に組む。",
    load: () => assertJosekiCourse(parseRaw(ibishaVsHayaishida42Raw), "ibisha-vs-hayaishida--42gyoku.json"),
  },
  {
    id: "nakabisha-vs-chousoku--gote",
    strategyId: "gokigen",
    opponentId: "chousoku",
    recommend: 1,
    group: "基本と受け方",
    opponentLabel: "超速▲3七銀",
    sideLabel: "後手",
    label: "銀対抗の受け方",
    kind: "急戦",
    summary: "相手の超速に銀を4四へ出して対抗し、▲4五桂や2筋の突き捨てを受け切る。",
    load: () => assertJosekiCourse(parseRaw(nakabishaVsChousokuGoteRaw), "nakabisha-vs-chousoku--gote.json"),
  },
  {
    id: "hayaishida--basic",
    strategyId: "hayaishida",
    opponentId: "ibisha-kyusen",
    recommend: 8,
    group: "基本の攻め",
    opponentLabel: "居飛車",
    sideLabel: "先手",
    label: "早石田",
    kind: "急戦",
    summary: "5手で攻めの形を作る三間飛車の速攻。相手が飛車先を交換すると王手飛車が決まる。",
    load: () => assertJosekiCourse(parseRaw(hayaishidaBasicRaw), "hayaishida--basic.json"),
  },
  {
    id: "sankenbisha-vs-nakabisha--aifuri",
    strategyId: "sankenbisha",
    opponentId: "gokigen",
    recommend: 4,
    group: "相振り飛車",
    opponentLabel: "ゴキゲン中飛車(相振り)",
    sideLabel: "先手",
    label: "相振り飛車・石田流",
    kind: "急戦",
    summary: "相手も振り飛車のとき。5筋を銀で守って石田流に組み、金無双に囲って7筋から攻める。",
    load: () => assertJosekiCourse(parseRaw(sankenbishaVsNakabishaAifuriRaw), "sankenbisha-vs-nakabisha--aifuri.json"),
  },
  {
    id: "sankenbisha-vs-mukaibisha--aifuri",
    strategyId: "sankenbisha",
    opponentId: "mukaibisha",
    recommend: 1,
    group: "相振り飛車",
    opponentLabel: "向かい飛車(相振り)",
    sideLabel: "後手",
    label: "相振り飛車・基本手筋",
    kind: "急戦",
    summary: "3筋の歩交換と、玉頭を狙う向かい飛車の受け方。相振り三間飛車の型を覚える。",
    load: () => assertJosekiCourse(parseRaw(sankenbishaVsMukaibishaAifuriRaw), "sankenbisha-vs-mukaibisha--aifuri.json"),
  },
  {
    id: "nakabisha-vs-sankenbisha--aifuri",
    strategyId: "gokigen",
    opponentId: "sankenbisha",
    recommend: 8,
    group: "相振り飛車",
    opponentLabel: "三間飛車(相振り)",
    sideLabel: "後手",
    label: "相振り飛車・受けと反撃",
    kind: "急戦",
    summary: "相手も振り飛車のとき。5筋の位を取って銀を繰り出し、美濃囲いから反撃する。",
    load: () => assertJosekiCourse(parseRaw(nakabishaVsSankenbishaAifuriRaw), "nakabisha-vs-sankenbisha--aifuri.json"),
  },
  {
    id: "sujichigaikaku--basic",
    strategyId: "sujichigaikaku",
    opponentId: "ibisha-kyusen",
    recommend: 9,
    group: "基本",
    opponentLabel: "居飛車",
    sideLabel: "先手",
    label: "基本の指し方",
    kind: "急戦",
    summary: "早い角交換から4五へ角を打ち、歩を得て8筋から攻める。",
    load: () => assertJosekiCourse(parseRaw(sujichigaikakuBasicRaw), "sujichigaikaku--basic.json"),
  },
];

/** 指定した戦法カードから選べるコース一覧(「自分の戦法」タブ)。 */
export function courseEntriesFor(strategyId: string): CourseEntry[] {
  return COURSE_ENTRIES.filter((c) => c.strategyId === strategyId);
}

/**
 * 「相手に備える」タブのカード。相手の戦法ごとに、対策のコースを推奨順に並べて見せる。
 * 自分の戦法カード(STRATEGIES)とは別に持つ: 相手としてしか現れないもの
 * (ポンポン桂・鳥刺し)や、まとめて扱うもの(居飛車の急戦)があるため。
 */
export interface Opponent {
  id: string;
  name: string;
  kana: string;
  category: "ibisha" | "furibisha" | "nakabisha" | "kishu";
  /** 人気順の並び。将棋ウォーズでの遭遇しやすさ(scripts/plan.mjs の採用率)を 5 点満点に見立てたもの。 */
  popularity: number;
  description: string;
}

export const OPPONENTS: Opponent[] = [
  { id: "shikenbisha", name: "四間飛車", kana: "しけんびしゃ", category: "furibisha", popularity: 4.9,
    description: "最もよく遭遇する振り飛車。棒銀で正面から攻めるか、穴熊に組んで堅さで勝負するかが基本の選択肢。" },
  { id: "sankenbisha", name: "三間飛車", kana: "さんけんびしゃ", category: "furibisha", popularity: 4.4,
    description: "四間飛車の次に多い振り飛車。早仕掛けで動くか、じっくり組むか。石田流に発展させてくる相手には要注意。" },
  { id: "hayaishida", name: "早石田", kana: "はやいしだ", category: "furibisha", popularity: 4.6,
    description: "▲7五歩から5手で攻めてくる速攻。王手飛車の罠があるので、受け方を知らないと序盤で負ける。知っていれば怖くない。" },
  { id: "gokigen", name: "ゴキゲン中飛車", kana: "ごきげんなかびしゃ", category: "nakabisha", popularity: 4.5,
    description: "角道を止めない現代の中飛車。超速▲3七銀で銀を素早く繰り出すのが主流の対策。穴熊に組む持久戦もある。" },
  { id: "mukaibisha", name: "向かい飛車", kana: "むかいびしゃ", category: "furibisha", popularity: 3.8,
    description: "こちらの飛車先を逆用してくる振り飛車。相振り飛車で現れることが多い。" },
  { id: "anaguma", name: "居飛車穴熊", kana: "いびしゃあなぐま", category: "ibisha", popularity: 4.0,
    description: "振り飛車を指すと高確率で遭遇する堅い囲い。組み上がる前に速攻するか、組ませてから捌くか。" },
  { id: "ibisha-kyusen", name: "居飛車の急戦", kana: "いびしゃのきゅうせん", category: "ibisha", popularity: 4.3,
    description: "棒銀・早仕掛け・速攻▲2四歩など、振り飛車に対して早く仕掛けてくる指し方全般。振り飛車党の基本の受け方。" },
  { id: "chousoku", name: "超速▲3七銀", kana: "ちょうそくさんななぎん", category: "ibisha", popularity: 3.7,
    description: "ゴキゲン中飛車に対する現代の主流対策。中飛車側は銀対抗で受け止める。" },
  { id: "migishiken", name: "右四間飛車", kana: "みぎしけんびしゃ", category: "ibisha", popularity: 3.5,
    description: "4五歩の一点突破を狙ってくる。級位者の対局で流行した戦法。待機して受け止める型を覚える。" },
  { id: "kakugawari", name: "角換わり", kana: "かくがわり", category: "ibisha", popularity: 3.9,
    description: "相手が角交換を挑んでくる相居飛車の戦型。" },
  { id: "yagura", name: "矢倉", kana: "やぐら", category: "ibisha", popularity: 3.6,
    description: "相手がじっくり矢倉に組んでくる相居飛車の戦型。" },
  { id: "aigakari", name: "相掛かり", kana: "あいがかり", category: "ibisha", popularity: 3.3,
    description: "角道を開けずに飛車先を交換してくる相居飛車の戦型。" },
  { id: "ponponkei", name: "ポンポン桂", kana: "ぽんぽんけい", category: "kishu", popularity: 2.5,
    description: "桂を早く跳ねて角頭を狙ってくる奇襲。四間飛車での受け方を収録。" },
  { id: "torisashi", name: "鳥刺し(嬉野流)", kana: "とりさし", category: "kishu", popularity: 2.5,
    description: "角と銀を斜めに使って端から攻めてくる奇襲。四間飛車での受け方を収録。" },
];

/** 指定した相手の戦法に対する対策コース一覧(「相手に備える」タブ)。推奨順。 */
export function courseEntriesForOpponent(opponentId: string): CourseEntry[] {
  return COURSE_ENTRIES.filter((c) => c.opponentId === opponentId).sort((a, b) => a.recommend - b.recommend);
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
  return assertJosekiCourse(parseRaw(branchNavDemoRaw), "_branchNavDemo.json");
}

/** ノードの本線(branches[0])を辿り、末端(理想陣形)までのノード列を返す。UI外のテスト・検証にも使える。 */
export function listMainLineNodes(course: JosekiCourse): JosekiNode[] {
  const nodes: JosekiNode[] = [course.root];
  let current = course.root;
  while (current.branches.length > 0) {
    // 逸れ手(deviation)の枝が混ざるので、必ず kind で本線を選ぶ。
    const main = current.branches.find((b) => b.kind === "main") ?? current.branches[0];
    const child = main.child;
    if (!child) break;
    nodes.push(child);
    current = child;
  }
  return nodes;
}

/* ────────────────────────────────────────────────────────────────
 * 学習パス: 戦法(または相手の戦法)を選んだら、盤の上で章を順に通す。
 * 「戦法を選ぶ → コース一覧 → 盤」の3段を「戦法を選ぶ → 盤」の2段にするための仕組み。
 * 章 = 既存のコース1本。同じ戦法のコースは序盤が共通なので、次の章へ進むときは
 * 前の章と分かれる地点(divergeAt)まで飛んで再開する(駒組みを毎回やり直さない)。
 * ──────────────────────────────────────────────────────────────── */

export interface PathChapter {
  entry: CourseEntry;
  course: JosekiCourse;
  /** 本線の何手目から前の章と違う手になるか(1始まり)。最初の章は 1。 */
  divergeAt: number;
}

export interface LearnPath {
  /** 見出しに出す名前(戦法名 / 「相手が四間飛車」)。 */
  title: string;
  side: "sente" | "gote";
  chapters: PathChapter[];
}

/** 本線の USI 列。 */
function mainLineUsi(course: JosekiCourse): string[] {
  const out: string[] = [];
  let node = course.root;
  for (;;) {
    const m = node.branches.find((b) => b.kind === "main");
    if (!m || !m.child) break;
    out.push(m.usi);
    node = m.child;
  }
  return out;
}

/** 2つの本線が何手目で分かれるか(1始まり)。全一致なら短い方の長さ+1。 */
function divergence(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i + 1;
  return n + 1;
}

/** 「自分の戦法」の章の並び順: 基本の組み方 → その他(recommend 順)。 */
const GROUP_ORDER = ["基本", "基本の組み方", "基本の攻め", "基本と変化", "基本と受け方"];
function chapterOrder(a: CourseEntry, b: CourseEntry): number {
  const ga = GROUP_ORDER.indexOf(a.group ?? ""), gb = GROUP_ORDER.indexOf(b.group ?? "");
  const ra = ga < 0 ? 99 : ga, rb = gb < 0 ? 99 : gb;
  if (ra !== rb) return ra - rb;
  return a.recommend - b.recommend;
}

/** そのカード(自分の戦法 / 相手の戦法)で、先手・後手それぞれに何章あるか。 */
export function pathSidesFor(mode: "mine" | "opponent", cardId: string): { sente: number; gote: number } {
  const entries = mode === "mine" ? courseEntriesFor(cardId) : courseEntriesForOpponent(cardId);
  return {
    sente: entries.filter((e) => e.sideLabel === "先手").length,
    gote: entries.filter((e) => e.sideLabel === "後手").length,
  };
}

/**
 * 学習パスを組み立てる。章は同じ手番のコースだけで作る(先手と後手は別の木)。
 * 各章の divergeAt は「前の章の本線」との比較で決める。前の章と序盤が共通なら、
 * 次の章はその分かれ目から始められる。
 */
export function buildLearnPath(mode: "mine" | "opponent", cardId: string, title: string, side: "sente" | "gote"): LearnPath {
  const sideLabel = side === "sente" ? "先手" : "後手";
  const entries = (mode === "mine" ? courseEntriesFor(cardId) : courseEntriesForOpponent(cardId))
    .filter((e) => e.sideLabel === sideLabel)
    .sort(mode === "mine" ? chapterOrder : (a, b) => a.recommend - b.recommend);
  const chapters: PathChapter[] = [];
  const seen: string[][] = [];
  for (const entry of entries) {
    const course = entry.load();
    const line = mainLineUsi(course);
    // それまでに通った章のどれかと分かれる地点のうち、いちばん遅いもの
    // (= 既に学んだ形をいちばん長く使い回せるもの)。共通部分が長すぎて章の終わり
    // 近くまで飛んでしまう場合(例: 全一致)は、最終手より手前に丸める。
    const best = seen.reduce((m, prev) => Math.max(m, divergence(prev, line)), 1);
    const d = Math.min(best, Math.max(1, line.length - 1));
    chapters.push({ entry, course, divergeAt: d });
    seen.push(line);
  }
  return { title, side, chapters };
}
