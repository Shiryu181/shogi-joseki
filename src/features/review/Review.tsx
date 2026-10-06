import { useEffect, useMemo } from "react";
import { Color, PieceType, Square } from "../../domain/shogi";
import { Board } from "../../ui/Board";
import { PointsBadge } from "../../ui/PointsBadge";
import { useReviewStore } from "../../store/reviewStore";
import { useProgressStore } from "../../store/progressStore";
import type { JosekiCourse } from "../../domain/types";
import "./Review.css";

export interface ReviewProps {
  /** 復習の対象にするコースと、その章の名前。 */
  courses: { course: JosekiCourse; label: string }[];
  onBack: () => void;
}

/**
 * 復習(間隔反復)の画面。
 *
 * 学習画面との違い: コースを順に辿るのではなく、覚えていない手と急所だけを
 * 局面ごとに単独で出す。前後の文脈が無いぶん、ねらいだけを頼りに考えることになり、
 * それが「覚えているか」の確認になる。
 */
export function Review({ courses, onBack }: ReviewProps) {
  const start = useReviewStore((s) => s.start);
  const cards = useReviewStore((s) => s.cards);
  const index = useReviewStore((s) => s.index);
  const position = useReviewStore((s) => s.position);
  const selected = useReviewStore((s) => s.selected);
  const moveDests = useReviewStore((s) => s.moveDests);
  const dropDests = useReviewStore((s) => s.dropDests);
  const answer = useReviewStore((s) => s.answer);
  const correctCount = useReviewStore((s) => s.correctCount);
  const done = useReviewStore((s) => s.done);
  const selectSquare = useReviewStore((s) => s.selectSquare);
  const selectHand = useReviewStore((s) => s.selectHand);
  const next = useReviewStore((s) => s.next);
  const reveal = useReviewStore((s) => s.reveal);
  const streak = useProgressStore((s) => s.streak());

  useEffect(() => { start(courses); }, [start, courses]);

  const card = cards[index];

  // 選んだ駒の行き先。学習画面と同じ見せ方にして操作感を揃える。
  const fromKey = selected?.kind === "board" ? selected.square.usi : null;
  const fromHand = selected?.kind === "hand" ? { type: selected.pieceType, color: position.color } : null;
  const destKeys = useMemo(() => {
    if (!selected) return undefined;
    const list = selected.kind === "board"
      ? (moveDests.get(selected.square.usi) ?? [])
      : (dropDests.get(selected.pieceType) ?? []);
    return new Set(list.map((d) => d.usi));
  }, [selected, moveDests, dropDests]);

  function handleSquare(sq: Square) { selectSquare(sq); }
  function handleHand(type: PieceType, color: Color) { selectHand(type, color); }

  if (done) {
    const total = cards.length;
    return (
      <div className="review-wrap">
        <header className="review-head">
          <button type="button" className="back" onClick={onBack}>◀ 戻る</button>
          <PointsBadge />
        </header>
        <div className="review-done">
          {total === 0 ? (
            <>
              <p className="review-done-title">今日の復習はありません</p>
              <p className="review-done-note">
                出題の期日が来ている手がありません。章を進めて新しい手を覚えるか、明日またここに戻ってきてください。
              </p>
            </>
          ) : (
            <>
              <p className="review-done-title">今日の復習が終わりました</p>
              <p className="review-done-score">{total}問中 {correctCount}問 正解</p>
              <p className="review-done-note">
                間違えた手は明日もう一度出ます。連続で正解するほど、次に出るまでの間隔が延びます。
              </p>
              {streak > 0 && <p className="review-done-streak">{streak}日連続で学習しています</p>}
            </>
          )}
          <button type="button" className="review-btn" onClick={onBack}>ホームへ戻る</button>
        </div>
      </div>
    );
  }

  if (!card) return null;

  return (
    <div className="review-wrap">
      <header className="review-head">
        <button type="button" className="back" onClick={onBack}>◀ 戻る</button>
        <span className="review-count">{index + 1} / {cards.length}</span>
        <PointsBadge />
      </header>

      <div className="review-board">
        <Board
          position={position}
          fromKey={fromKey}
          fromHand={fromHand}
          destKeys={destKeys}
          onSquareClick={handleSquare}
          onHandPieceClick={handleHand}
          clickableHandColor={answer ? "none" : position.color}
          flipped={position.color === Color.WHITE}
        />
      </div>

      <div className="review-panel">
        <p className="review-chapter">{card.chapterLabel}</p>
        {/* 急所は出題時に明示する。どこで考えるべきかが分かれば、
            そうでない局面も納得して進められる。 */}
        <p className={`review-aim${card.sharp ? " sharp" : ""}`}>
          <span className="review-label">{card.sharp ? "急所 — 外すと損をします" : "この局面のねらい"}</span>
          {card.aim ?? "この局面で指すべき手は？"}
        </p>

        {answer?.kind === "correct" && (
          <p className="review-result ok">正解 — {card.correctText}{card.note ? ` ${card.note}` : ""}</p>
        )}
        {answer?.kind === "accepted" && (
          <p className="review-result soft">
            △ {answer.text} — その手も咎められません。ただしこの講座では {card.correctText} と進めます。
          </p>
        )}
        {answer?.kind === "wrong" && (
          <p className="review-result ng">
            {answer.text ? `✕ ${answer.text} — ` : ""}正解は {card.correctText} です。{card.note ?? ""}
          </p>
        )}

        <div className="review-actions">
          {!answer && <button type="button" onClick={reveal}>答えを見る</button>}
          {answer && (
            <button type="button" className="review-btn" onClick={next}>
              {index + 1 >= cards.length ? "結果を見る" : "次の問題 ▶"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
