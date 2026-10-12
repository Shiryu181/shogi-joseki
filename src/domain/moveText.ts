/**
 * 画面に出す指し手の書き方をそろえる。
 * tsshogi の表示は「☗２六歩」(全角の数字と ☗☖)だが、確定版モックは「▲2六歩」「△3四歩」。
 */
const FULL_DIGITS = "０１２３４５６７８９";

export function plainMove(text: string): string {
  return text
    .replace(/☗/g, "▲")
    .replace(/☖/g, "△")
    .replace(/[０-９]/g, (c) => String(FULL_DIGITS.indexOf(c)));
}

/** 解説文から末尾の「[要検証…]」の印を取り除く。 */
export function cleanNote(note: string | undefined | null): string {
  return (note ?? "").replace(/\s*\[要検証[^\]]*\]/g, "").trim();
}

/**
 * 解説を「ひとことの意図」にする。最初の1文だけを取り、末尾の句点と
 * 「相手が/相手は」の書き出しを落とす(「相手 ▲2六歩 — 飛車先を突きました」のように続けるため)。
 */
export function oneLineIntent(note: string | undefined | null): string {
  const first = cleanNote(note).split("。")[0] ?? "";
  return first.replace(/^相手(が|は)/, "").trim();
}

/**
 * 解説を「2行ぶん」と「それ以降」に分ける。
 * 先頭から文を足していき、約 limit 字を超えるところから「くわしく」に回す。
 */
export function splitExplanation(note: string | undefined | null, limit = 70): { lead: string; rest: string } {
  const text = cleanNote(note);
  if (!text) return { lead: "", rest: "" };
  const sentences = text.split(/(?<=。)/).filter(Boolean);
  let lead = "";
  let i = 0;
  for (; i < sentences.length; i++) {
    if (lead && (lead + sentences[i]).length > limit) break;
    lead += sentences[i];
  }
  return { lead, rest: sentences.slice(i).join("") };
}

/** 評価値(自分から見て、プラスが自分に有利)を言葉と数字にする。例: 「相手がやや良い(−240)」 */
export function evalWords(cp: number): string {
  const n = Math.round(cp);
  const num = n < 0 ? `−${Math.abs(n)}` : `+${n}`;
  const words =
    n >= 800 ? "自分が勝勢"
    : n >= 300 ? "自分が良い"
    : n >= 100 ? "自分がやや良い"
    : n > -100 ? "ほぼ互角"
    : n > -300 ? "相手がやや良い"
    : n > -800 ? "相手が良い"
    : "相手が勝勢";
  return `${words}(${num})`;
}
