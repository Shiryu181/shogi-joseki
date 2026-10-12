import { useEffect, useMemo, useRef, useState } from "react";
import { Color, PieceType, Square } from "../../domain/shogi";
import { Board } from "../../ui/Board";
import { useExamStore, summarize, EXAM_SIZE, PASS_RATIO } from "../../store/examStore";
import { useProgressStore } from "../../store/progressStore";
import { summarizePath } from "../../domain/courseProgress";
import type { ChapterStat } from "../../domain/courseProgress";
import { toKanjiNumber } from "../../domain/kanjiNumber";
import { Screen, TopBar } from "../../ui/DojoParts";
import type { PathChapter } from "../../domain/josekiLoader";
import "./Exam.css";

export interface ExamProps {
  /** 選んだ戦法×手番の章。 */
  chapters: PathChapter[];
  /** 見出し。「ゴキゲン中飛車・後手」。 */
  heading: string;
  onBack: () => void;
  /** 指定すると、一覧を出さずにその章の試験をすぐ始める(章のページから)。 */
  autoStart?: number;
}

/**
 * 認定試験。章ごとに「覚えたことを確かめる」。
 * ねらいは出さず、間違えてもやり直せない。正誤は最後にまとめて見せる。
 * 一覧は選んだ戦法×手番の章だけを数える。受けられない章にはボタンを出さず、条件を文字で示す。
 */
export function Exam({ chapters, heading, onBack, autoStart }: ExamProps) {
  const [screen, setScreen] = useState<"list" | "run">("list");
  const items = useProgressStore((s) => s.items);
  const results = useExamStore((s) => s.results);
  const start = useExamStore((s) => s.start);
  const quit = useExamStore((s) => s.quit);
  const autoStarted = useRef(false);

  const sum = useMemo(() => summarizePath(chapters, items, results), [chapters, items, results]);

  useEffect(() => {
    if (autoStart === undefined || autoStarted.current) return;
    autoStarted.current = true;
    const ch = chapters[autoStart];
    if (ch) { start(ch.course, ch.entry.label); setScreen("run"); }
  }, [autoStart, chapters, start]);

  if (screen === "run") {
    return <ExamRun onDone={() => { setScreen("list"); }} onQuit={() => { quit(); setScreen("list"); }} />;
  }

  return (
    <Screen className="exam-list-screen">
      <TopBar backLabel="戻る" onBack={onBack} title="認定試験" />
      <div className="dojo-body">
        <h2 className="fuda exl-fuda">{heading}</h2>
        <section className="dojo-panel exl-sum">
          <span className="exl-sum__t">認定試験 合格 {sum.passed} / {sum.stats.length}章</span>
        </section>

        <ul className="dojo-panel dj-rows exl">
          {sum.stats.map((r) => (
            <li key={r.chapter.course.id}>
              <div className="dj-row">
                <span className={`chapter-plate${r.state === "passed" ? " chapter-plate--done" : ""}`}>
                  {toKanjiNumber(r.index + 1)}
                </span>
                <span className="exl-tx">
                  <span className="dj-row__name">{r.chapter.entry.label}</span>
                  <span className="exl-state">{examStateWord(r)}</span>
                </span>
                {r.ready && (
                  <button
                    type="button"
                    className="btn-secondary exl-go"
                    onClick={() => { start(r.chapter.course, r.chapter.entry.label); setScreen("run"); }}
                  >
                    {r.result ? "再挑戦" : "受ける"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <p className="dj-note exl-lead">
          章ごとに最大{EXAM_SIZE}問。ねらいは出ません。やり直しもできません。
          合格は{Math.round(PASS_RATIO * 10)}割、ただし急所を1問でも落とすと不合格です。
        </p>
      </div>
    </Screen>
  );
}

/** 一覧の状態の言葉。合格 / 不合格 最高n点 / 未受験 / あとn問 / 未学習。 */
function examStateWord(r: ChapterStat): string {
  if (r.result) return r.result.passed ? "合格" : `不合格 最高${r.result.best}点`;
  if (r.ready) return "未受験";
  return r.answered > 0 ? `あと${r.unanswered}問` : "未学習";
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
