import { useEffect, useRef, useState } from "react";
import { Position, moveFromUSI } from "../../domain/shogi";
import { getEngine } from "../../engine/usiEngine";
import "./TryMove.css";

/** エンジンに考えさせる時間。長すぎると待たされるので、学習用には1秒前後で十分。 */
const THINK_MS = 1200;
/** 相手の応手をいくつ見せるか。 */
const REPLY_PLIES = 2;

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

interface Outcome {
  /** 自分視点の評価(センチポーン)。大きいほど自分が良い。 */
  cp: number;
  /** 相手の応手とその次の手(表示用)。 */
  replies: { text: string; sfen: string; usi: string }[];
}

/** 自分視点の評価値に直す(エンジンは手番側から見た値を返す)。 */
function toMyView(scoreCp: number, mate: number | undefined, sfenAfterMyMove: string, iAmSente: boolean): number {
  // 自分の手を指した直後なので、手番は相手。相手視点の値を反転して自分視点にする。
  const raw = mate !== undefined ? (mate > 0 ? 30000 : -30000) : scoreCp;
  const sideToMoveIsSente = sfenAfterMyMove.split(" ")[1] === "b";
  const senteView = sideToMoveIsSente ? raw : -raw;
  return iAmSente ? senteView : -senteView;
}

/**
 * 「この手を指したらどうなるか」を実際に試す。
 * ユーザーが指そうとした手と定跡手の両方をエンジンに評価させ、相手の応手まで盤で見せる。
 * 定跡を覚えるだけでなく「なぜその手なのか」を自分の疑問から学べるようにするための機能。
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
  const [mine, setMine] = useState<Outcome | null>(null);
  const [book, setBook] = useState<Outcome | null>(null);
  const [step, setStep] = useState(0);
  // 連打や再マウントで多重に走らせない。
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const iAmSente = sfenBefore.split(" ")[1] === "b";

    /** 1手指した局面を評価し、相手の応手を数手たどる。 */
    async function run(usi: string): Promise<Outcome | null> {
      const pos = new Position();
      pos.resetBySFEN(sfenBefore);
      const info = moveFromUSI(pos, usi);
      if (!info || !pos.doMove(info.move)) return null;
      const engine = getEngine();
      const r = await engine.evaluate(pos.sfen, THINK_MS);
      const cp = toMyView(r.scoreCp, r.mate, pos.sfen, iAmSente);
      const replies: Outcome["replies"] = [];
      for (const next of r.pv.slice(0, REPLY_PLIES)) {
        const nm = moveFromUSI(pos, next);
        if (!nm || !pos.doMove(nm.move)) break;
        replies.push({ text: nm.displayText, sfen: pos.sfen, usi: next });
      }
      return { cp, replies };
    }

    (async () => {
      try {
        await getEngine().init();
        const a = await run(attemptedUsi);
        const b = correctUsi ? await run(correctUsi) : null;
        setMine(a);
        setBook(b);
        setState(a ? "done" : "error");
      } catch {
        setState("error");
      }
    })();
  }, [sfenBefore, attemptedUsi, correctUsi]);

  // 盤には「自分が指そうとした手」を進めて見せる。step で応手まで進める。
  useEffect(() => {
    if (!mine) return;
    const pos = new Position();
    pos.resetBySFEN(sfenBefore);
    const info = moveFromUSI(pos, attemptedUsi);
    if (!info || !pos.doMove(info.move)) return;
    if (step === 0) {
      onPreview(pos.sfen, attemptedUsi);
      return;
    }
    const r = mine.replies[step - 1];
    if (r) onPreview(r.sfen, r.usi);
  }, [mine, step, sfenBefore, attemptedUsi, onPreview]);

  useEffect(() => () => onPreview(null, null), [onPreview]);

  const diff = mine && book ? mine.cp - book.cp : null;
  const verdict =
    diff === null
      ? null
      : diff >= -60
        ? { label: "この手も有力です", tone: "good" }
        : diff >= -250
          ? { label: "指せますが、定跡の手のほうが得です", tone: "soso" }
          : { label: "この手は損になります", tone: "bad" };

  return (
    <div className="quizpanel trypanel">
      <p className="try-head">
        {attemptedText} を指すと？
      </p>
      {state === "thinking" && <p className="try-note">将棋エンジンが調べています…</p>}
      {state === "error" && <p className="try-note">うまく調べられませんでした。もう一度お試しください。</p>}
      {state === "done" && mine && (
        <>
          {verdict && <p className={`try-verdict ${verdict.tone}`}>{verdict.label}</p>}
          <p className="try-line">
            <span className="try-label">相手の応手</span>
            {mine.replies.length > 0 ? (
              mine.replies.map((r, i) => (
                <button
                  key={r.usi}
                  type="button"
                  className={`try-move${step === i + 1 ? " on" : ""}`}
                  onClick={() => setStep(i + 1)}
                >
                  {r.text}
                </button>
              ))
            ) : (
              <span className="try-move">—</span>
            )}
          </p>
          {book && (
            <p className="try-compare">
              定跡の {correctText} と比べて{" "}
              <b>{diff !== null && diff >= 0 ? `+${diff}` : diff}点</b>
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
