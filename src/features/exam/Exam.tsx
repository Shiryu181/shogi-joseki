import { useEffect, useMemo, useRef, useState } from "react";
import { Color, PieceType, Position, Square, parseUSIMove } from "../../domain/shogi";
import type { GhostPiece } from "../../ui/Board";
import { buildHint } from "../../domain/hint";
import { Board } from "../../ui/Board";
import { HandChip } from "../learn/Learn";
import { plainMove, splitExplanation } from "../../domain/moveText";
import { useExamStore, summarize, type Marked, EXAM_SIZE, PASS_RATIO } from "../../store/examStore";
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
  /** 結果から開いている振り返りの問題(0 始まり)。null なら結果を出す。 */
  const [review, setReview] = useState<number | null>(null);

  const destKeys = useMemo(() => {
    if (!selected) return undefined;
    const list = selected.kind === "board"
      ? (moveDests.get(selected.square.usi) ?? [])
      : (dropDests.get(selected.pieceType) ?? []);
    return new Set(list.map((d) => d.usi));
  }, [selected, moveDests, dropDests]);

  const title = chapterTitle(chapterNo - 1, label);

  if (finished && review !== null && marked[review]) {
    return (
      <ExamReview
        marked={marked} index={review} title={title}
        onMove={setReview} onClose={() => setReview(null)}
      />
    );
  }

  if (finished) {
    const s = summarize(marked);
    const missed = s.total - s.correct;
    return (
      <Screen className="exam-screen">
        <TopBar backLabel="戻る" onBack={onDone} title="認定試験" right="結果" />
        <SubLabel>{title}</SubLabel>
        <div className="dojo-panel exam-result">
          <div className="exam-verdict-row">
            <div className={`exam-verdict ${s.passed ? "ok" : "ng"}`}>{s.passed ? "合格" : "不合格"}</div>
            <div className="exam-score">
              <span className="n">{s.correct}</span>問 正解<span className="meta"> ・ {s.total}問中</span>
            </div>
          </div>
          {!s.passed && (
            <p className="exam-reason">{s.missedSharp ? "急所を落としています" : "8割に届きませんでした"}</p>
          )}
          {s.passed && <p className="exam-line">第{toKanjiNumber(chapterNo)}章は「合格」になりました。</p>}
          {missed > 0 && <p className="exam-line">落とした{missed}問を明日の復習の先頭に入れました</p>}

          <p className="exam-qhint">問題を押すと、正解と解説を見られます</p>
          <ul className="exam-qlist">
            {marked.map((m, i) => (
              <li key={i}>
                <button type="button" className="exam-qrow" onClick={() => setReview(i)}>
                  <span className="qn">{i + 1}</span>
                  <span className={`mk ${m.correct ? "ok" : m.played ? "ng" : "sk"}`}>{m.correct ? "○" : m.played ? "×" : "−"}</span>
                  <span className="mv">{m.correct ? plainMove(m.card.correctText) : m.played ? plainMove(m.playedText) : "飛ばした"}</span>
                  {!m.correct && <span className="meta">正解 {plainMove(m.card.correctText)}</span>}
                  <span className="chev" aria-hidden="true">›</span>
                </button>
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

/**
 * 試験後の振り返り。出題時の局面に、正解を矢印で重ねる。
 * 誤答だったときは、その行き先を薄い点線で示す。試験の直後(同じセッション)だけで使う。
 */
function ExamReview({
  marked, index, title, onMove, onClose,
}: {
  marked: Marked[];
  index: number;
  title: string;
  onMove: (i: number) => void;
  onClose: () => void;
}) {
  const m = marked[index];
  const { card } = m;
  const position = useMemo(() => {
    const p = new Position();
    p.resetBySFEN(card.sfen);
    return p;
  }, [card.sfen]);
  const flipped = position.color === Color.WHITE;

  const answer = parseUSIMove(card.usi);
  const arrow = answer
    ? { from: answer.from instanceof Square ? answer.from.usi : null, to: answer.to.usi }
    : null;
  let ghost: GhostPiece | null = null;
  if (answer && !(answer.from instanceof Square)) {
    ghost = { key: answer.to.usi, color: position.color, type: answer.from };
  }
  // 誤答の行き先(USI の末尾2文字が移動先の升)。
  const markKeys = !m.correct && m.played ? new Set([m.played.slice(2, 4)]) : undefined;

  const skipped = m.played === null;
  const aim = card.aim ?? buildHint(card.note, card.correctText);
  const lead = splitExplanation(card.note).lead;
  const verdict = m.correct ? "○ 正解" : skipped ? "− 飛ばした" : "× 不正解";
  const verdictCls = m.correct ? "ok" : skipped ? "sk" : "ng";

  return (
    <Screen className="learn-screen exam-screen exam-review">
      <TopBar backLabel="結果" onBack={onClose} title={`第${index + 1}問`} right={`${index + 1} / ${marked.length}`} />
      <SubLabel>{title}{card.sharp ? " ・ 急所" : ""}</SubLabel>

      <div className="learn-hands">
        <HandChip label="▲持駒" position={position} color={Color.BLACK} flipped={flipped}
          canPick={false} selectedType={null} onPick={() => {}} />
        <HandChip label="△持駒" position={position} color={Color.WHITE} flipped={flipped}
          canPick={false} selectedType={null} onPick={() => {}} />
      </div>

      <Board
        position={position}
        fromKey={null}
        fromHand={null}
        onSquareClick={() => {}}
        onHandPieceClick={() => {}}
        clickableHandColor="none"
        flipped={flipped}
        hideHands
        arrow={arrow}
        ghost={ghost}
        markKeys={markKeys}
      />

      <section className="dojo-panel learn-panel exam-rv-panel">
        <p className={`rv-res ${verdictCls}`}>{verdict}</p>
        <div className={`rv-ans${skipped ? " one" : ""}`}>
          {!skipped && (
            <div>
              <span className="al">あなたの答え</span>
              <span className="av">{plainMove(m.playedText)}</span>
            </div>
          )}
          <div>
            <span className="al">正解</span>
            <span className="av st">{plainMove(card.correctText)}</span>
          </div>
        </div>
        {aim && <div className="aim rv-aim"><p><b>ねらい</b>{aim}</p></div>}
        {lead && <p className="expl">{lead}</p>}
      </section>

      <div className="rv-foot">
        <div className="rv-nav">
          <button type="button" className="btn-secondary" disabled={index === 0} onClick={() => onMove(index - 1)}>◀ 前の問題</button>
          <button type="button" className="btn-secondary" disabled={index >= marked.length - 1} onClick={() => onMove(index + 1)}>次の問題 ▶</button>
        </div>
        <button type="button" className="btn-primary full" onClick={onClose}>結果へ戻る</button>
      </div>
    </Screen>
  );
}
