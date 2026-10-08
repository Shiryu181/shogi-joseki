/** 各章で使う手の書き方。章ファイル(scripts/courses/*.mjs)が import する。 */

/**
 * piece=駒種, to=移動先, note=この手の意味, comment=指した後の局面の説明,
 * from=移動元(同じ駒種が複数動けるときだけ), promote=成る/成らない(成れる手では必須)
 */
/**
 * 盤上の駒を動かす手。
 * promote は true / false / 未指定のみ。ここに文字列が来るのは、局面の解説を
 * 第6引数に書いてしまった取り違えで、そのまま通すと解説が黙って消える
 * (2026-10 に21か所見つかった)。気づけるようにエラーで止める。
 */
export const m = (piece, to, note, comment, from, promote) => {
  if (promote !== undefined && promote !== true && promote !== false) {
    throw new Error(
      `${piece}${to}: promote には true / false しか置けません(受け取った値: ${JSON.stringify(promote)})。` +
      `局面の解説は第4引数の comment に書いてください`
    );
  }
  return { piece, to, note, comment, from, promote };
};
/** 持ち駒を打つ手。 */
export const d = (piece, to, note, comment) => ({ piece, to, note, comment, drop: true });
