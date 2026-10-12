import { useEffect, useRef, useState } from "react";
import { Color, Position, moveFromUSI } from "../../domain/shogi";
import { getEngine } from "../../engine/usiEngine";
import { evalWords, plainMove } from "../../domain/moveText";
import { explainLine } from "./tryExplain";
import type { TryExplain } from "./tryExplain";
import "./TryMove.css";

/** エンジンに考えさせる時間。読み筋を長めに得たいので、少し長めに取る。 */
const THINK_MS = 2000;

export interface TryMoveProps {
  /** 自分の手を指す前の局面(SFEN)。 */
  sfenBefore: string;
  /** ユーザーが指そうとした手(USI)。 */
  attemptedUsi: string;
  attemptedText: string;
  /** 定跡手(USI)。比較の基準にする。 */
  correctUsi?: string;
  correctText: string;
  /** 盤に局面を映す(null で元に戻す)。 */
  onPreview: (sfen: string | null, lastUsi: string | null) => void;
  onClose: () => void;
}

/** 自分視点の評価値に直す(エンジンは手番側から見た値を返す)。 */
function toMyView(scoreCp: number, mate: number | undefined, sfenToMove: string, iAmSente: boolean): number {
  const raw = mate !== undefined ? (mate > 0 ? 30000 : -30000) : scoreCp;
  const sideToMoveIsSente = sfenToMove.split(" ")[1] === "b";
  const senteView = sideToMoveIsSente ? raw : -raw;
  return iAmSente ? senteView : -senteView;
}

/**
 * 「この手を指したらどうなるか」を実際に試す。
 * 評価値の差だけでは何が悪いのか分からないので、エンジンの読み筋を最後までたどり、
 * 「どの手で何を取られるのか」を特定して盤の上で見せる。
 */
export function TryMove({
  sfenBefore,
  attemptedUsi,
  attemptedText,
  correctUsi,
  correctText,
  onPreview,
  onClose,
}: TryMoveProps) {
  const [state, setState] = useState<"thinking" | "done" | "error">("thinking");
  const [explain, setExplain] = useState<TryExplain | null>(null);
  const [cp, setCp] = useState<number | null>(null);
  const [bookCp, setBookCp] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const started = useRef(false);
  // 呼び出し側が毎回新しい関数を渡しても、効果が走り直さないよう最新の関数を ref に持つ。
  // (以前は onPreview を依存に入れていたため、呼ぶたびに親が再描画 → 新しい関数 → 効果が再実行 →
  //  また呼ぶ、の無限ループになり "Maximum update depth exceeded" が出ていた)
  const previewRef = useRef(onPreview);
  useEffect(() => {
    previewRef.current = onPreview;
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const iAmSente = sfenBefore.split(" ")[1] === "b";
    const myColor = iAmSente ? Color.BLACK : Color.WHITE;

    /** 1手指した局面を評価して、自分視点の評価値と読み筋を返す。 */
    async function run(usi: string) {
      const pos = new Position();
      pos.resetBySFEN(sfenBefore);
      const info = moveFromUSI(pos, usi);
      if (!info || !pos.doMove(info.move)) return null;
      const r = await getEngine().evaluate(pos.sfen, THINK_MS);
      return { sfen: pos.sfen, cp: toMyView(r.scoreCp, r.mate, pos.sfen, iAmSente), pv: r.pv };
    }

    (async () => {
      try {
        await getEngine().init();
        const a = await run(attemptedUsi);
        if (!a) {
          setState("error");
          return;
        }
        setCp(a.cp);
        setExplain(explainLine(a.sfen, a.pv, myColor));
        if (correctUsi) {
          const b = await run(correctUsi);
          if (b) setBookCp(b.cp);
        }
        setState("done");
      } catch {
        setState("error");
      }
    })();
  }, [sfenBefore, attemptedUsi, correctUsi]);

  const diff = cp !== null && bookCp !== null ? cp - bookCp : null;
  // 原因を出すのは「定跡より悪い」と判定したときだけ。盤の赤い強調も同じ条件に揃える。
  const showCause = diff !== null && diff < -60 && !!explain?.cause;

  // 盤には「自分が指そうとした手」から読み筋を進めて見せる。
  useEffect(() => {
    const pos = new Position();
    pos.resetBySFEN(sfenBefore);
    const info = moveFromUSI(pos, attemptedUsi);
    if (!info || !pos.doMove(info.move)) return;
    if (step === 0 || !explain) {
      previewRef.current(pos.sfen, attemptedUsi);
      return;
    }
    const f = explain.frames[step - 1];
    if (f) previewRef.current(f.sfen, f.usi);
  }, [explain, step, sfenBefore, attemptedUsi]);

  // 原因が見つかったら、その手まで自動で進めて見せる。
  useEffect(() => {
    if (!explain || explain.causeIndex === null || !showCause) return;
    const target = explain.causeIndex + 1;
    if (step >= target) return;
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, target)), 800);
    return () => clearTimeout(t);
  }, [explain, step, showCause]);

  // 閉じる(アンマウント)ときだけ盤を元の局面に戻す。
  useEffect(() => () => previewRef.current(null, null), []);

  const verdict =
    diff === null
      ? null
      : diff >= -60
        ? "この手も有力です"
        : diff >= -250
          ? "指せますが、定跡の手のほうが得です"
          : "この手は損になります";

  // 読み筋の一覧: 最初の行は指した手そのもの、以降が相手と自分の応酬。
  const rows = explain ? [{ text: attemptedText, step: 0 }, ...explain.frames.map((f, i) => ({ text: plainMove(f.text), step: i + 1 }))] : [];

  return (
    <div className="dojo-panel trysheet" role="dialog" aria-label={`${attemptedText}を指すと`}>
      <h3 className="try-head">{attemptedText} を指すと</h3>

      {state === "thinking" && <p className="try-note">将棋エンジンが読んでいます…</p>}
      {state === "error" && <p className="try-note">うまく調べられませんでした。もう一度お試しください。</p>}

      {state === "done" && explain && (
        <>
          {cp !== null && <p className="try-eval"><b>{evalWords(cp)}</b></p>}
          {/* 原因は「定跡より悪い」と判定したときだけ出す。評価が変わらない手に警告を出すと誤解を招くため。 */}
          <p className="try-cause">
            {showCause
              ? plainMove(explain.cause ?? "")
              : diff !== null && diff >= -60
                ? "この手でも大きな損はありません。相手の応手に対応できます。"
                : verdict}
          </p>
          {bookCp !== null && (
            <p className="try-compare">定跡の {correctText} なら {evalWords(bookCp)}</p>
          )}

          <ol className="try-rows" aria-label="その後の進行">
            {rows.map((r, i) => (
              <li key={`${r.text}-${i}`}>
                <button
                  type="button"
                  className={`try-row${step === r.step ? " on" : ""}${showCause && explain.causeIndex === i - 1 ? " cause" : ""}`}
                  aria-current={step === r.step}
                  onClick={() => setStep(r.step)}
                >
                  <span className="try-no">{i + 1}</span>
                  {r.text}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      <button type="button" className="btn-secondary full try-close" onClick={onClose}>
        閉じる
      </button>
    </div>
  );
}
