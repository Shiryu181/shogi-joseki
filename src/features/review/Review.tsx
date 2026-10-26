import { useEffect, useMemo, useState } from "react";
import { Color, PieceType, Square, parseUSIMove } from "../../domain/shogi";
import type { GhostPiece } from "../../ui/Board";
import { Board } from "../../ui/Board";
import { Screen, TopBar, ProgressLine, SubLabel } from "../../ui/DojoParts";
import { HandChip } from "../learn/Learn";
import { useReviewStore } from "../../store/reviewStore";
import type { ReviewCard, ReviewCourse, ReviewWrong } from "../../store/reviewStore";
import "../learn/Learn.css";
import "./Review.css";

export interface ReviewProps {
  /** 復習の対象にするコースと、その章の名前・番号。 */
  courses: ReviewCourse[];
  onBack: () => void;
}

/**
 * 今日の復習(確定版モック 18〜20)。
 * 学習画面と同じ組み立て(看板 → 進み線 → 章名 → 持ち駒 → 盤 → 板のパネル)で、
 * コースを辿らず、期日が来た手を1問ずつ単独で出す。ねらいは「ヒント」を押した人にだけ見せる。
 * 外し方は学習画面と同じ: 1回目は赤い一行、2回目は盤の矢印で答えを示す。
 */
export function Review({ courses, onBack }: ReviewProps) {
  const start = useReviewStore((s) => s.start);
  const cards = useReviewStore((s) => s.cards);
  const index = useReviewStore((s) => s.index);
  const position = useReviewStore((s) => s.position);
  const myColor = useReviewStore((s) => s.myColor);
  const lastMoveUsi = useReviewStore((s) => s.lastMoveUsi);
  const selected = useReviewStore((s) => s.selected);
  const moveDests = useReviewStore((s) => s.moveDests);
  const dropDests = useReviewStore((s) => s.dropDests);
  const misses = useReviewStore((s) => s.misses);
  const wrong = useReviewStore((s) => s.wrong);
  const result = useReviewStore((s) => s.result);
  const correctCount = useReviewStore((s) => s.correctCount);
  const leftover = useReviewStore((s) => s.leftover);
  const done = useReviewStore((s) => s.done);
  const selectSquare = useReviewStore((s) => s.selectSquare);
  const selectHand = useReviewStore((s) => s.selectHand);
  const next = useReviewStore((s) => s.next);

  useEffect(() => { start(courses); }, [start, courses]);

  const card = cards[index];
  const total = cards.length;

  // 選んだ駒の行き先。学習画面と同じ見せ方にして操作感を揃える。
  const fromKey = selected?.kind === "board" ? selected.square.usi : null;
  const destKeys = useMemo(() => {
    if (!selected) return undefined;
    const list = selected.kind === "board"
      ? (moveDests.get(selected.square.usi) ?? [])
      : (dropDests.get(selected.pieceType) ?? []);
    return new Set(list.map((d) => d.usi));
  }, [selected, moveDests, dropDests]);

  // ── 終わり(今日はここまで / 復習なし) ──
  if (done) {
    const missed = total - correctCount;
    return (
      <Screen className="learn-screen">
        <TopBar backLabel="戻る" onBack={onBack} title={total === 0 ? "今日の復習" : `今日の復習 ${total} / ${total}`} />
        {total > 0 && <ProgressLine ratio={1} label="今日の復習の進み具合" />}
        <div className="rv-end dojo-panel">
          {total === 0 ? (
            <>
              <div className="rv-big">今日の復習はありません</div>
              <p>期日が来ている手がありません。</p>
            </>
          ) : (
            <>
              <div className="rv-big">今日はここまで</div>
              <p className="rv-sum">{total}問中 {correctCount}問 正解</p>
              {missed > 0 && <p>間違えた{missed}問は明日もう一度出ます。</p>}
              {leftover > 0 && <p>残り{leftover}問は明日に回しました。</p>}
            </>
          )}
          <button type="button" className="btn-primary rv-home" onClick={onBack}>ホームへ戻る</button>
        </div>
      </Screen>
    );
  }

  if (!card) return null;

  const flipped = myColor === Color.WHITE;
  const solved = !!result;

  // 答えの矢印: 2回目以降の誤答、または「悪くない手」(別の良い手)を指したとき。
  const showAnswer = !!wrong && (wrong.kind !== "bad" || misses >= 2);
  const answer = showAnswer && wrong?.correctUsi ? parseUSIMove(wrong.correctUsi) : null;
  const arrow = answer
    ? { from: answer.from instanceof Square ? answer.from.usi : null, to: answer.to.usi }
    : null;
  const ghost: GhostPiece | null = answer && !(answer.from instanceof Square)
    ? { key: answer.to.usi, color: position.color, type: answer.from }
    : null;

  // 正解して指した手を、学習画面と同じく強調する。
  const last = lastMoveUsi ? parseUSIMove(lastMoveUsi) : null;
  const lastKeys = last
    ? new Set(last.from instanceof Square ? [last.from.usi, last.to.usi] : [last.to.usi])
    : undefined;

  const selectedHandType = selected?.kind === "hand" ? selected.pieceType : null;
  const pick = (type: PieceType, color: Color) => selectHand(type, color);

  return (
    <Screen className="learn-screen">
      <TopBar backLabel="戻る" onBack={onBack} title={`今日の復習 ${index + 1} / ${total}`} />
      <ProgressLine ratio={(index + 1) / total} label="今日の復習の進み具合" />
      <SubLabel>{card.chapterLabel}{card.sharp ? " ・ 急所" : ""}</SubLabel>

      <div className="learn-hands">
        <HandChip label="▲持駒" position={position} color={Color.BLACK} flipped={flipped}
          canPick={!solved && myColor === Color.BLACK} selectedType={myColor === Color.BLACK ? selectedHandType : null} onPick={pick} />
        <HandChip label="△持駒" position={position} color={Color.WHITE} flipped={flipped}
          canPick={!solved && myColor === Color.WHITE} selectedType={myColor === Color.WHITE ? selectedHandType : null} onPick={pick} />
      </div>

      <Board
        position={position}
        fromKey={fromKey}
        fromHand={null}
        destKeys={destKeys}
        ghost={ghost}
        lastKeys={lastKeys}
        emphasizeLast
        lastToKey={last ? last.to.usi : null}
        onSquareClick={(sq: Square) => selectSquare(sq)}
        onHandPieceClick={() => {}}
        clickableHandColor="none"
        flipped={flipped}
        hideHands
        arrow={arrow}
      />

      <section className="dojo-panel learn-panel" aria-live="polite">
        {result ? (
          <ResultPanel card={card} text={result.text} last={index + 1 >= total} onNext={next} />
        ) : (
          // 問題が替わったらヒントの開閉も初めに戻す
          <QuestionPanel key={index} card={card} wrong={wrong} misses={misses} />
        )}
      </section>
    </Screen>
  );
}

/** 出題: 「この局面で指す手は？」+ ヒント(押すとねらい)。外したときは赤い一行 / 矢印+答え。 */
function QuestionPanel({ card, wrong, misses }: { card: ReviewCard; wrong: ReviewWrong | null; misses: number }) {
  const [hintOpen, setHintOpen] = useState(false);

  return (
    <>
      <h2 className="rv-q">この局面で指す手は？</h2>
      <p className="rv-meta">盤の駒を押して、動かす先をえらびます。</p>

      {hintOpen ? (
        <div className="aim">
          <div className="aim-key">ヒント</div>
          <div className="aim-t">この局面のねらい</div>
          <p>{card.hint}</p>
        </div>
      ) : card.hint ? (
        <button type="button" className="btn-secondary full" onClick={() => setHintOpen(true)}>ヒント</button>
      ) : null}

      {wrong && wrong.kind !== "bad" && (
        <p className="soft-t rv-gap">
          {wrong.attemptedText.slice(0, 1)} その手も悪くありません。定跡は {wrong.correctText} です
        </p>
      )}
      {wrong && wrong.kind === "bad" && misses === 1 && (
        <p className="miss-l">× {wrong.attemptedText} — 定跡の手ではありません。もう一度</p>
      )}
      {wrong && wrong.kind === "bad" && misses >= 2 && (
        <p className="ans-l">答えは {wrong.correctText}。矢印のとおり指してください</p>
      )}
    </>
  );
}

/** 正解: 「○ 正解 △3四歩」+ ひとこと + 次の問題(主ボタン)。 */
function ResultPanel({ card, text, last, onNext }: { card: ReviewCard; text: string; last: boolean; onNext: () => void }) {
  return (
    <>
      <p className="good"><b>○ 正解 {text}</b></p>
      {card.note && <p className="expl">{card.note}</p>}
      <button type="button" className="btn-primary full" onClick={onNext}>{last ? "結果を見る" : "次の問題"}</button>
    </>
  );
}
