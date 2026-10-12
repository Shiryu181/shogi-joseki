import { useEffect, useMemo, useRef, useState } from "react";
import { Color, PieceType, Square } from "../../domain/shogi";
import { Board } from "../../ui/Board";
import { HandChip } from "../learn/Learn";
import { plainMove } from "../../domain/moveText";
import { useExamStore, summarize, EXAM_SIZE, PASS_RATIO } from "../../store/examStore";
import { useProgressStore } from "../../store/progressStore";
import { summarizePath } from "../../domain/courseProgress";
import type { ChapterStat } from "../../domain/courseProgress";
import { toKanjiNumber, chapterTitle } from "../../domain/kanjiNumber";
import { Screen, TopBar, ProgressLine, SubLabel } from "../../ui/DojoParts";
import type { PathChapter } from "../../domain/josekiLoader";
import "../learn/Learn.css";
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
    if (ch) { start(ch.course, ch.entry.label, autoStart + 1); setScreen("run"); }
  }, [autoStart, chapters, start]);

  if (screen === "run") {
    // 章のページから入ったときは、やめる・結果のあとも章のページへ戻る。一覧から入ったときは一覧へ。
    const fromChapter = autoStart !== undefined;
    const leave = () => { quit(); if (fromChapter) onBack(); else setScreen("list"); };
    return <ExamRun fromChapter={fromChapter} onDone={leave} onQuit={leave} />;
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
                    onClick={() => { start(r.chapter.course, r.chapter.entry.label, r.index + 1); setScreen("run"); }}
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
function ExamRun({ fromChapter, onDone, onQuit }: { fromChapter: boolean; onDone: () => void; onQuit: () => void }) {
  const cards = useExamStore((s) => s.cards);
  const index = useExamStore((s) => s.index);
  const position = useExamStore((s) => s.position);
  const selected = useExamStore((s) => s.selected);
  const moveDests = useExamStore((s) => s.moveDests);
  const dropDests = useExamStore((s) => s.dropDests);
  const marked = useExamStore((s) => s.marked);
  const finished = useExamStore((s) => s.finished);
  const label = useExamStore((s) => s.courseTitle);
  const chapterNo = useExamStore((s) => s.chapterNo);
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

  const title = chapterTitle(chapterNo - 1, label);

  if (finished) {
    const s = summarize(marked);
    const missed = s.total - s.correct;
    return (
      <Screen className="exam-screen">
        <TopBar backLabel="戻る" onBack={onDone} title="認定試験" right="結果" />
        <SubLabel>{title}</SubLabel>
        <div className="dojo-panel exam-result">
          <div className={`exam-verdict ${s.passed ? "ok" : "ng"}`}>{s.passed ? "合格" : "不合格"}</div>
          <div className="exam-score">
            <span className="n">{s.correct}</span>問 正解<span className="meta"> ・ {s.total}問中</span>
          </div>
          {!s.passed && (
            <p className="exam-reason">{s.missedSharp ? "急所を落としています" : "8割に届きませんでした"}</p>
          )}
          {s.passed && <p className="exam-line">第{toKanjiNumber(chapterNo)}章は「合格」になりました。</p>}
          {missed > 0 && <p className="exam-line">落とした{missed}問を明日の復習の先頭に入れました</p>}

          <ul className="exam-qlist">
            {marked.map((m, i) => (
              <li key={i}>
                <span className="qn">{i + 1}</span>
                <span className={m.correct ? "ok" : "ng"}>{m.correct ? "○" : "×"}</span>
                <span className="mv">{m.correct ? plainMove(m.card.correctText) : m.played ? plainMove(m.playedText) : "飛ばした"}</span>
                {!m.correct && <span className="meta">正解 {plainMove(m.card.correctText)}</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="btn-primary exam-back" onClick={onDone}>
            {fromChapter ? "章のページへ戻る" : "認定試験の一覧へ戻る"}
          </button>
        </div>
      </Screen>
    );
  }

  const card = cards[index];
  if (!card) return null;

  const myColor = position.color;
  const flipped = myColor === Color.WHITE;
  const selectedHandType = selected?.kind === "hand" ? selected.pieceType : null;
  const pick = (t: PieceType, c: Color) => selectHand(t, c);

  return (
    <Screen className="learn-screen exam-screen">
      <TopBar backLabel="やめる" onBack={onQuit} title="認定試験" right={`${index + 1} / ${cards.length}`} />
      <ProgressLine ratio={(index + 1) / cards.length} label="認定試験の進み具合" />
      <SubLabel>{title}</SubLabel>

      <div className="learn-hands">
        <HandChip label="▲持駒" position={position} color={Color.BLACK} flipped={flipped}
          canPick={myColor === Color.BLACK} selectedType={myColor === Color.BLACK ? selectedHandType : null} onPick={pick} />
        <HandChip label="△持駒" position={position} color={Color.WHITE} flipped={flipped}
          canPick={myColor === Color.WHITE} selectedType={myColor === Color.WHITE ? selectedHandType : null} onPick={pick} />
      </div>

      <Board
        position={position}
        fromKey={selected?.kind === "board" ? selected.square.usi : null}
        fromHand={null}
        destKeys={destKeys}
        onSquareClick={(sq: Square) => selectSquare(sq)}
        onHandPieceClick={() => {}}
        clickableHandColor="none"
        flipped={flipped}
        hideHands
      />

      {/* 試験ではねらいを出さない。1問1回で、正誤は最後にまとめて出る。 */}
      <section className="dojo-panel learn-panel">
        <h2 className="rv-q">この局面で指すべき手は？</h2>
        <p className="rv-meta">ヒントとやり直しはありません。</p>
        <button type="button" className="btn-secondary full" onClick={skip}>分からないので飛ばす</button>
      </section>
    </Screen>
  );
}
