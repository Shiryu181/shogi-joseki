import { useEffect, useRef, useState } from "react";
import { Color, Position, moveFromUSI } from "../../domain/shogi";
import { getEngine } from "../../engine/usiEngine";
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
      onPreview(pos.sfen, attemptedUsi);
      return;
    }
    const f = explain.frames[step - 1];
    if (f) onPreview(f.sfen, f.usi);
  }, [explain, step, sfenBefore, attemptedUsi, onPreview]);

  // 原因が見つかったら、その手まで自動で進めて見せる。
  useEffect(() => {
    if (!explain || explain.causeIndex === null || !showCause) return;
    const target = explain.causeIndex + 1;
    if (step >= target) return;
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, target)), 800);
    return () => clearTimeout(t);
  }, [explain, step, showCause]);

  useEffect(() => () => onPreview(null, null), [onPreview]);

  const verdict =
    diff === null
      ? null
      : diff >= -60
        ? "この手も有力です"
        : diff >= -250
          ? "指せますが、定跡の手のほうが得です"
          : "この手は損になります";

  return (
    <div className="quizpanel trypanel">
      <p className="try-head">{attemptedText} を指すと？</p>

      {state === "thinking" && <p className="try-note">将棋エンジンが読んでいます…</p>}
      {state === "error" && <p className="try-note">うまく調べられませんでした。もう一度お試しください。</p>}

      {state === "done" && explain && (
        <>
          {verdict && <p className="try-verdict">{verdict}</p>}
          {/* 原因は「定跡より悪い」と判定したときだけ出す。
              評価が変わらない手に警告を出すと、かえって誤解を招くため。 */}
          {showCause && <p className="try-cause">{explain.cause}</p>}
          {diff !== null && diff >= -60 && (
            <p className="try-cause">この手でも大きな損はありません。下の進行のように、相手の応手に対応できます。</p>
          )}

          <p className="try-line">
            <span className="try-label">その後の進行</span>
            {explain.frames.map((f, i) => (
              <button
                key={`${f.usi}-${i}`}
                type="button"
                className={`try-move${step === i + 1 ? " on" : ""}${showCause && explain.causeIndex === i ? " cause" : ""}`}
                onClick={() => setStep(i + 1)}
              >
                {f.text}
              </button>
            ))}
          </p>

          {diff !== null && (
            <p className="try-compare">
              定跡の {correctText} と比べて <b>{diff >= 0 ? `+${diff}` : diff}点</b>
              (プラスなら自分が得。将棋エンジンの評価です)
            </p>
          )}
        </>
      )}

      <div className="try-actions">
        <button type="button" onClick={() => setStep(0)} disabled={step === 0}>
          指した直後に戻す
        </button>
        <button type="button" onClick={onClose}>
          閉じて元の局面へ
        </button>
      </div>
    </div>
  );
}
