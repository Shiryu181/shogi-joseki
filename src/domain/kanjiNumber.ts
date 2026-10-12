const DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 1〜99 を漢数字にする(5 → 五、10 → 十、12 → 十二、30 → 三十、99 → 九十九)。範囲外は算用数字のまま返す。 */
export function toKanjiNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tensPart = tens === 0 ? "" : tens === 1 ? "十" : `${DIGITS[tens]}十`;
  return tensPart + DIGITS[ones];
}
