/**
 * 「次の一手」クイズのヒント文を作る。
 *
 * 各手には既に解説(note)が書いてあり、その多くは「なぜその手を指すのか」を
 * 説明している。出題時にそれをそのまま見せると升の名前で答えが分かってしまうので、
 * 升(4三・４三など)と手の表示(☗２六歩)だけを伏せて「ねらい」として先に見せる。
 *
 * 伏せ方が足りないときのために、コース側で aim を明示できるようにしてある
 * (aim があればそちらを優先する)。
 */

/** 「4三」「４三」のような升の表記。数字は半角・全角の両方を受ける。 */
const SQUARE_RE = /[1-9１-９][一二三四五六七八九]/g;

/**
 * note からヒント文を作る。升の表記は「◯」に伏せる。
 * 伏せた結果ほとんど情報が残らない(短すぎる)場合は null を返し、
 * 呼び出し側でヒントを出さない判断ができるようにする。
 */
export function buildHint(note: string | undefined, moveText?: string): string | null {
  if (!note) return null;
  let text = note;
  if (moveText) text = text.split(moveText).join("この手");
  text = text.replace(SQUARE_RE, "◯");
  // 「◯」だらけになった文はヒントとして役に立たないので出さない。
  const masked = (text.match(/◯/g) ?? []).length;
  if (text.replace(/[◯\s。、]/g, "").length < 6) return null;
  if (masked > 3) return null;
  return text;
}
