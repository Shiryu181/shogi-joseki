import { useMemo, useState } from "react";
import { Color, PieceType, Square } from "../../domain/shogi";
import { Board } from "../../ui/Board";
import { useExamStore, summarize, canTake, EXAM_SIZE, PASS_RATIO } from "../../store/examStore";
import { useProgressStore, itemKey } from "../../store/progressStore";
import { quizItemsOf } from "../../domain/reviewQueue";
import type { PathChapter } from "../../domain/josekiLoader";
import "./Exam.css";

export interface ExamProps {
  chapters: PathChapter[];
  onBack: () => void;
}

/**
 * 認定試験。章ごとに「覚えたことを確かめる」。
 * ねらいは出さず、間違えてもやり直せない。正誤は最後にまとめて見せる。
 */
export function Exam({ chapters, onBack }: ExamProps) {
  const [screen, setScreen] = useState<"list" | "run">("list");
  const items = useProgressStore((s) => s.items);
  const results = useExamStore((s) => s.results);
  const start = useExamStore((s) => s.start);
  const quit = useExamStore((s) => s.quit);

  const rows = useMemo(
    () =>
      chapters.map(({ entry, course }) => {
        const qs = quizItemsOf(course);
        const answered = qs.filter((q) => itemKey(q.sfen, q.usi) in items).length;
        return {
          entry, course, total: qs.length, answered,
          ready: canTake(course, items),
          result: results[course.id],
        };
      }),
    [chapters, items, results],
  );

  if (screen === "run") {
    return <ExamRun onDone={() => { setScreen("list"); }} onQuit={() => { quit(); setScreen("list"); }} />;
  }

  return (
    <div className="exam-wrap">
      <header className="exam-head">
        <button type="button" className="back" onClick={onBack}>◀ 戻る</button>
        <span className="exam-title">認定試験</span>
      </header>

      <div className="exam-pad">
        <p className="exam-lead">
          章ごとに最大{EXAM_SIZE}問。ねらいは出ません。やり直しもできません。
          <b>合格は{Math.round(PASS_RATIO * 100)}割</b>、ただし急所を1問でも落とすと不合格です。
        </p>

        <div className="exam-card">
          {rows.map((r) => (
            <div className="exam-row" key={r.course.id}>
              <div className="exam-nm">
                {r.entry.label}
                <small>
                  {r.result
                    ? `${r.result.passed ? "合格" : "不合格"} 最高${r.result.best}点 ・ ${r.result.attempts}回受験`
                    : r.ready ? "未受験" : `章の問題を一通り解くと受けられます(${r.answered}/${r.total})`}
                </small>
              </div>
              <button
                type="button"
                className={`exam-go${r.ready && !r.result?.passed ? " on" : ""}`}
                disabled={!r.ready}
                onClick={() => { start(r.course, r.entry.label); setScreen("run"); }}
              >
                {r.result ? "再挑戦" : "受ける"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 受験中と結果。 */
function ExamRun({ onDone, onQuit }: { onDone: () => void; onQuit: () => void }) {
  const cards = useExamStore((s) => s.cards);
  const index = useExamStore((s) => s.index);
  const position = useExamStore((s) => s.position);
  const selected = useExamStore((s) => s.selected);
  const moveDests = useExamStore((s) => s.moveDests);
  const dropDests = useExamStore((s) => s.dropDests);
  const marked = useExamStore((s) => s.marked);
  const finished = useExamStore((s) => s.finished);
  const title = useExamStore((s) => s.courseTitle);
  const selectSquare = useExamStore((s) => s.selectSquare);
  const selectHand = useExamStore((s) => s.selectHand);
  const skip = useExamStore((s) => s.skip);

  const destKeys = useMemo(() => {
    if (!selected) return undefined;
    const list = selected.kind === "board"
      ? (moveDests.get(selected.square.usi) ?? [])
      : (dropDests.get(selected.pieceType) ?? []);
    return new Set(list.map((d) => d.usi));
  }, [selected, moveDests, dropDests]);

  if (finished) {
    const s = summarize(marked);
    return (
      <div className="exam-wrap">
        <header className="exam-head">
          <span className="exam-title">{title} ・ 結果</span>
        </header>
        <div className="exam-pad">
          <div className={`exam-result${s.passed ? " pass" : ""}`}>
            <p className="exam-verdict">{s.passed ? "合格" : "不合格"}</p>
            <p className="exam-score">{s.score}<span>点</span></p>
            <p className="exam-detail">{s.total}問中 {s.correct}問 正解</p>
            {s.missedSharp && !s.passed && (
              <p className="exam-why">急所を落としています。急所は外すと確実に損をする手なので、点数に関わらず不合格です。</p>
            )}
          </div>

          <div className="exam-sec">答案</div>
          <div className="exam-card">
            {marked.map((m, i) => (
              <div className="exam-row" key={i}>
                <div className="exam-nm">
                  {m.correct ? "○" : "✕"} {m.card.correctText}
                  <small>
                    {m.card.sharp ? "急所 ・ " : ""}
                    {m.correct ? "正解" : m.played ? `指した手 ${m.playedText}` : "飛ばした"}
                  </small>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="exam-btn" onClick={onDone}>章の一覧へ戻る</button>
        </div>
      </div>
    );
  }

  const card = cards[index];
  if (!card) return null;

  return (
    <div className="exam-wrap">
      <header className="exam-head">
        <button type="button" className="back" onClick={onQuit}>◀ やめる</button>
        <span className="exam-title">{title}</span>
        <span className="exam-count">{index + 1} / {cards.length}</span>
      </header>

      <div className="exam-board">
        <Board
          position={position}
          fromKey={selected?.kind === "board" ? selected.square.usi : null}
          fromHand={selected?.kind === "hand" ? { type: selected.pieceType, color: position.color } : null}
          destKeys={destKeys}
          onSquareClick={(sq: Square) => selectSquare(sq)}
          onHandPieceClick={(t: PieceType, c: Color) => selectHand(t, c)}
          clickableHandColor={position.color}
          flipped={position.color === Color.WHITE}
        />
      </div>

      <div className="exam-panel">
        {/* 試験ではねらいを出さない。正誤も最後まで見せない。 */}
        <p className="exam-q">この局面で指すべき手は？</p>
        <p className="exam-note">正誤は最後にまとめて出ます。</p>
        <button type="button" className="exam-skip" onClick={skip}>分からないので飛ばす</button>
      </div>
    </div>
  );
}
