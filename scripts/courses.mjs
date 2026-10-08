/**
 * 収録する定跡コースの定義。`node scripts/courses.mjs` で JSON を生成する。
 *
 * 手は「駒種 + 移動先」で書き、USI と SFEN は build-joseki.mjs が tsshogi に
 * 解決させる(人間が手書きしない)。同じ駒種が複数動ける局面は from を明示する
 * (棋譜の「右/左/上」に相当。曖昧なままだとスクリプトがエラーで止まる)。
 *
 * 手順の出典は各コースの source に記載。解説文は本アプリのための書き下ろし。
 *
 * 【構成】章ごとのデータは scripts/courses/<コースID>.mjs(1ファイル=1コース)。
 * 手の書き方 m() / d() は scripts/courses/_helpers.mjs。ここは import して並べ、
 * 生成の流れ(COURSES → SWAPPED → USI → ペア検査 → 警告)だけを持つ。配列の並び順が出力順。
 * SWAPPED の章ファイルは { from, limit, make } を export する(from は元コースID)。
 */
import { buildCourse, buildCourseFromUsi, writeCourse, reportAnnotateWarnings } from "./build-joseki.mjs";
import { swapSides } from "./mirror-course.mjs";
import c_ibisha_vs_shikenbisha__sente from "./courses/ibisha-vs-shikenbisha--sente.mjs";
import c_ibisha_vs_shikenbisha__bougin from "./courses/ibisha-vs-shikenbisha--bougin.mjs";
import c_ibisha_vs_shikenbisha__45hayashikake from "./courses/ibisha-vs-shikenbisha--45hayashikake.mjs";
import c_ibisha_vs_shikenbisha__saginomiya from "./courses/ibisha-vs-shikenbisha--saginomiya.mjs";
import c_ibisha_vs_shikenbisha__yamada from "./courses/ibisha-vs-shikenbisha--yamada.mjs";
import c_ibisha_vs_shikenbisha__anaguma from "./courses/ibisha-vs-shikenbisha--anaguma.mjs";
import c_shikenbisha_vs_ibisha__basic from "./courses/shikenbisha-vs-ibisha--basic.mjs";
import c_shikenbisha_vs_torisashi__basic from "./courses/shikenbisha-vs-torisashi--basic.mjs";
import c_shikenbisha_vs_ponponkei__basic from "./courses/shikenbisha-vs-ponponkei--basic.mjs";
import c_shikenbisha_vs_migishiken__41kin from "./courses/shikenbisha-vs-migishiken--41kin.mjs";
import c_shikenbisha_vs_anaguma__sokkou from "./courses/shikenbisha-vs-anaguma--sokkou.mjs";
import c_shikenbisha_vs_bougin__kuboryu from "./courses/shikenbisha-vs-bougin--kuboryu.mjs";
import c_shikenbisha_vs_anaguma__basic from "./courses/shikenbisha-vs-anaguma--basic.mjs";
import c_ibisha_vs_sankenbisha__bougin from "./courses/ibisha-vs-sankenbisha--bougin.mjs";
import c_ibisha_vs_sankenbisha__35hayashikake from "./courses/ibisha-vs-sankenbisha--35hayashikake.mjs";
import c_ibisha_vs_sankenbisha__37kei from "./courses/ibisha-vs-sankenbisha--37kei.mjs";
import c_sankenbisha_vs_ibisha__basic from "./courses/sankenbisha-vs-ibisha--basic.mjs";
import c_kakugawari__bougin from "./courses/kakugawari--bougin.mjs";
import c_kakugawari__hayakurigin from "./courses/kakugawari--hayakurigin.mjs";
import c_aigakari__bougin from "./courses/aigakari--bougin.mjs";
import c_yagura__24te from "./courses/yagura--24te.mjs";
import c_yagura__36gin37kei from "./courses/yagura--36gin37kei.mjs";
import c_nakabisha_vs_anaguma__basic from "./courses/nakabisha-vs-anaguma--basic.mjs";
import c_sankenbisha_vs_anaguma__koyan from "./courses/sankenbisha-vs-anaguma--koyan.mjs";
import c_sankenbisha_vs_45hayashikake__sabaki from "./courses/sankenbisha-vs-45hayashikake--sabaki.mjs";
import c_sankenbisha_vs_bougin__53kin from "./courses/sankenbisha-vs-bougin--53kin.mjs";
import c_nakabisha_vs_ibisha__gokigen24 from "./courses/nakabisha-vs-ibisha--gokigen24.mjs";
import c_sujichigaikaku__basic from "./courses/sujichigaikaku--basic.mjs";
import c_ibisha_vs_nakabisha__anaguma from "./courses/ibisha-vs-nakabisha--anaguma.mjs";
import c_kakugawari__gote from "./courses/kakugawari--gote.mjs";
import c_yagura__gote from "./courses/yagura--gote.mjs";
import c_aigakari__gote from "./courses/aigakari--gote.mjs";
import c_ibisha_vs_gokigen__chousoku from "./courses/ibisha-vs-gokigen--chousoku.mjs";
import c_nakabisha_vs_chousoku__gote from "./courses/nakabisha-vs-chousoku--gote.mjs";
import c_hayaishida__basic from "./courses/hayaishida--basic.mjs";
import c_ibisha_vs_hayaishida__42gyoku from "./courses/ibisha-vs-hayaishida--42gyoku.mjs";
import c_sankenbisha_vs_nakabisha__aifuri from "./courses/sankenbisha-vs-nakabisha--aifuri.mjs";
import c_nakabisha_vs_sankenbisha__aifuri from "./courses/nakabisha-vs-sankenbisha--aifuri.mjs";
import c_sankenbisha_vs_mukaibisha__aifuri from "./courses/sankenbisha-vs-mukaibisha--aifuri.mjs";
import c_nakabisha_vs_onigoroshi__gote from "./courses/nakabisha-vs-onigoroshi--gote.mjs";
import c_nakabisha__shote from "./courses/nakabisha--shote.mjs";
import c_sankenbisha_vs_ibisha__sente from "./courses/sankenbisha-vs-ibisha--sente.mjs";
import c_nakabisha_vs_ibisha__sente from "./courses/nakabisha-vs-ibisha--sente.mjs";
import c_shikenbisha_vs_ibisha__sente from "./courses/shikenbisha-vs-ibisha--sente.mjs";
import c_nakabisha_vs_chousoku__sente from "./courses/nakabisha-vs-chousoku--sente.mjs";
import c_nakabisha_vs_sankenbisha__sente from "./courses/nakabisha-vs-sankenbisha--sente.mjs";
import c_nakabisha_vs_anaguma__sente from "./courses/nakabisha-vs-anaguma--sente.mjs";
import c_nakabisha__shote_sente from "./courses/nakabisha--shote-sente.mjs";
import c_nakabisha_vs_ufogin__gote from "./courses/nakabisha-vs-ufogin--gote.mjs";
import c_nakabisha_vs_chokyusen__kaihi from "./courses/nakabisha-vs-chokyusen--kaihi.mjs";
import c_nakabisha_vs_anaguma__7suji from "./courses/nakabisha-vs-anaguma--7suji.mjs";
import c_nakabisha_vs_ureshino__gote from "./courses/nakabisha-vs-ureshino--gote.mjs";

const COURSES = [
  c_ibisha_vs_shikenbisha__sente,
  c_ibisha_vs_shikenbisha__bougin,
  c_ibisha_vs_shikenbisha__45hayashikake,
  c_ibisha_vs_shikenbisha__saginomiya,
  c_ibisha_vs_shikenbisha__yamada,
  c_ibisha_vs_shikenbisha__anaguma,
  c_shikenbisha_vs_ibisha__basic,
  c_shikenbisha_vs_torisashi__basic,
  c_shikenbisha_vs_ponponkei__basic,
  c_shikenbisha_vs_migishiken__41kin,
  c_shikenbisha_vs_anaguma__sokkou,
  c_shikenbisha_vs_bougin__kuboryu,
  c_shikenbisha_vs_anaguma__basic,
  c_ibisha_vs_sankenbisha__bougin,
  c_ibisha_vs_sankenbisha__35hayashikake,
  c_ibisha_vs_sankenbisha__37kei,
  c_sankenbisha_vs_ibisha__basic,
  c_kakugawari__bougin,
  c_kakugawari__hayakurigin,
  c_aigakari__bougin,
  c_yagura__24te,
  c_yagura__36gin37kei,
  c_nakabisha_vs_anaguma__basic,
  c_sankenbisha_vs_anaguma__koyan,
  c_sankenbisha_vs_45hayashikake__sabaki,
  c_sankenbisha_vs_bougin__53kin,
  c_nakabisha_vs_ibisha__gokigen24,
  c_sujichigaikaku__basic,
  c_ibisha_vs_nakabisha__anaguma,
  c_kakugawari__gote,
  c_yagura__gote,
  c_aigakari__gote,
  c_ibisha_vs_gokigen__chousoku,
  c_nakabisha_vs_chousoku__gote,
  c_hayaishida__basic,
  c_ibisha_vs_hayaishida__42gyoku,
  c_sankenbisha_vs_nakabisha__aifuri,
  c_nakabisha_vs_sankenbisha__aifuri,
  c_sankenbisha_vs_mukaibisha__aifuri,
  c_nakabisha_vs_onigoroshi__gote,
  c_nakabisha__shote,
];

/**
 * 同じ対局から作った「先手版 / 後手版」のペア。
 * 片方だけ手を直して食い違うのを防ぐため、生成後に USI 列が完全一致するか検査する。
 * 後手版は先手版の途中までで終わる場合があるので、前方一致を許す。
 */
// 3つ目の数字は「共通の駒組みの手数」。それ以降は先手版・後手版がそれぞれ別の中盤
// (エンジンで生成した続き)を持つので、一致検査は共通部分だけに掛ける。
const PAIRED_COURSES = [
  ["kakugawari--bougin", "kakugawari--gote", 16],
  ["yagura--24te", "yagura--gote", 24],
  ["aigakari--bougin", "aigakari--gote", 18],
];

console.log("定跡コースを生成します:");
const generated = new Map();
for (const def of COURSES) {
  const { course, usiList } = buildCourse(def);
  writeCourse(course, usiList);
  generated.set(course.id, usiList);
}

/**
 * 手番を入れ替えたコース。既存の検証済み棋譜を mirror-course.mjs で機械変換して作る。
 * 対抗形の定跡は慣習として必ず「居飛車=先手」で公開されており、先手振り飛車の
 * 駒組み手順を載せた資料が見つからなかったための措置。
 * 手順は人間が書き写していない(変換の出力をそのまま使う)。
 */
const SWAPPED_COURSES = [
  c_sankenbisha_vs_ibisha__sente,
  c_nakabisha_vs_ibisha__sente,
  c_shikenbisha_vs_ibisha__sente,
];

for (const spec of SWAPPED_COURSES) {
  const base = generated.get(spec.from);
  if (!base) throw new Error(`手番入れ替えの元コースが見つかりません: ${spec.from}`);
  const swapped = swapSides(base, spec.limit);
  for (const def of spec.make(swapped)) {
    // extraUsi: 入れ替え元の駒組みのあとに、エンジンで生成した中盤の続きを足す(手番は入れ替えない)。
    const { course, usiList } = buildCourseFromUsi({ ...def, usiList: [...swapped, ...(def.extraUsi ?? [])] });
    writeCourse(course, usiList);
    generated.set(course.id, usiList);
  }
}

/**
 * USI の指し手列から直接組み立てるコース。
 * 出典に棋譜が無く、相手の作戦だけが分かっている戦型で使う。
 * 相手側の手順を出典どおりに固定し、こちらの応手をエンジンに選ばせて生成した手順を、
 * 1手ずつ評価して確かめたうえで収録する(scripts/playout + evalline)。
 */
const USI_COURSES = [
  c_nakabisha_vs_chousoku__sente,
  c_nakabisha_vs_sankenbisha__sente,
  c_nakabisha_vs_anaguma__sente,
  c_nakabisha__shote_sente,
  c_nakabisha_vs_ufogin__gote,
  c_nakabisha_vs_chokyusen__kaihi,
  c_nakabisha_vs_anaguma__7suji,
  c_nakabisha_vs_ureshino__gote,
];

for (const def of USI_COURSES) {
  const { course, usiList } = buildCourseFromUsi(def);
  writeCourse(course, usiList);
  generated.set(course.id, usiList);
}

for (const [a, b, shared] of PAIRED_COURSES) {
  const ua = generated.get(a);
  const ub = generated.get(b);
  if (!ua || !ub) continue;
  const n = Math.min(ua.length, ub.length, shared);
  for (let i = 0; i < n; i++) {
    if (ua[i] !== ub[i]) {
      throw new Error(
        `ペアの手順が食い違っています: ${a} と ${b} の ${i + 1}手目 (${ua[i]} vs ${ub[i]})。` +
        `同じ対局を元にしているので、片方だけ変更していないか確認してください`
      );
    }
  }
  console.log(`  ✓ ペア一致: ${a} ⇔ ${b} (先頭${n}手)`);
}

// 出典どおりの手がエンジンの許容手から外れている箇所をまとめて出す。
// 駒組みでは出典を優先するので止めはしないが、見落としたくないので必ず報告する。
reportAnnotateWarnings();
