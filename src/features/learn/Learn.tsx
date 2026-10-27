import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Color, PieceType, Position, Square, handCounts, moveFromUSI, parseUSIMove } from "../../domain/shogi";
import type { GhostPiece } from "../../ui/Board";
import type { JosekiCourse, MoveDemo } from "../../domain/types";
import type { LearnPath } from "../../domain/josekiLoader";
import { useLearnStore, mainBranchOf } from "../../store/learnStore";
import type { AckMove, BookQuizState } from "../../store/learnStore";
import { useProgressStore } from "../../store/progressStore";
import { useExamStore } from "../../store/examStore";
import { chapterStat } from "../../domain/courseProgress";
import { toKanjiNumber } from "../../domain/kanjiNumber";
import { buildHint } from "../../domain/hint";
import { oneLineIntent, plainMove, usiSquareKeys } from "../../domain/moveText";
import { Board } from "../../ui/Board";
import { PieceView } from "../../ui/Piece";
import { Screen, TopBar } from "../../ui/DojoParts";
import { TryMove } from "./TryMove";
import "./Learn.css";

export interface LearnProps {
  /** 表示するコース。切り替え時は都度渡し直す。 */
  course: JosekiCourse;
  /** 戻るボタンの遷移先(章のページ、またはホーム)。 */
  onBack: () => void;
  /** 学習パス(章の並び)。未指定なら単独コースとして動く(開発用の分岐デモなど)。 */
  path?: LearnPath;
  chapterIndex?: number;
  /** 「次の章へ」。最後の章では渡されない。 */
  onNextChapter?: () => void;
  /** 最後の章を終えたときの戻り先(戦法のページ)。 */
  onStrategy?: () => void;
  /** この章の認定試験へ。 */
  onExam?: () => void;
  /**
   * true なら、入った章を1手目から始める(章のページの「最初から学ぶ」)。
   * これまでの記録は消さない。false なら、前の章と共通の序盤を飛ばして分かれ目から始める。
   */
  restart?: boolean;
}

/** SFEN から局面を作る(「この手を試す」の盤表示用)。 */
function positionFromSfen(sfen: string): Position {
  const p = new Position();
  p.resetBySFEN(sfen);
  return p;
}

interface DemoFrame { pos: Position; text: string; lastKeys: Set<string>; lastTo: string | null }
interface DemoState { demo: MoveDemo; frames: DemoFrame[]; step: number; auto: boolean }

/** 持ち駒の行の1枠。「▲持駒 …」。空なら「なし」(盤が動かないよう必ず1枠分を取る)。 */
export function HandChip({
  label, position, color, flipped, canPick, selectedType, onPick,
}: {
  label: string;
  position: Position;
  color: Color;
  flipped: boolean;
  canPick: boolean;
  selectedType: PieceType | null;
  onPick: (type: PieceType, color: Color) => void;
}) {
  const pieces = handCounts(position, color);
  return (
    <div className="learn-hand">
      <span className="tl">{label}</span>
      {pieces.length === 0 ? (
        <span className="none">なし</span>
      ) : (
        pieces.map(({ type, count }) => (
          <button
            key={type}
            type="button"
            className={`hp${canPick ? " can" : ""}${selectedType === type ? " selected" : ""}`}
            disabled={!canPick}
            aria-label={`持ち駒 ${type} ${count}枚`}
            onClick={() => onPick(type, color)}
          >
            {count > 1 && <span className="capn">{count}</span>}
            <PieceView type={type} color={color} flipped={flipped} />
          </button>
        ))
      )}
    </div>
  );
}

/** 相手の手の1行。「相手 ▲2六歩 — 飛車先を突いて居飛車を明示」 */
function OppLine({ ack, big = false }: { ack: AckMove; big?: boolean }) {
  const intent = oneLineIntent(ack.note);
  return (
    <p className={big ? "oppbig" : "oppline"}>
      <b>相手 {ack.moveText}</b>
      {intent ? ` — ${intent}` : ""}
    </p>
  );
}

/**
 * 学習画面(確定版モック 08〜17)。
 * 相手の手は自動で進み、自分の番は次の一手クイズ。正解したら結果を読んで「次へ」。
 * 本線を終えたあと、相手の変化(ミスではない別の手)、続けて逸れ手(咎めの問題)を1つずつ出し、すべて終えたら章の終わり。
 */
export function Learn({
  course, onBack, path, chapterIndex = 0, onNextChapter, onStrategy, onExam, restart = false,
}: LearnProps) {
  const storeCourse = useLearnStore((s) => s.course);
  const currentNode = useLearnStore((s) => s.currentNode);
  const nodeHistory = useLearnStore((s) => s.nodeHistory);
  const position = useLearnStore((s) => s.position);
  const lastMoveUsi = useLearnStore((s) => s.lastMoveUsi);
  const startDepth = useLearnStore((s) => s.startDepth);
  const lastOpponent = useLearnStore((s) => s.lastOpponent);
  const oppPhase = useLearnStore((s) => s.oppPhase);
  const bookQuiz = useLearnStore((s) => s.bookQuiz);
  const pendingAck = useLearnStore((s) => s.pendingAck);
  const devQueue = useLearnStore((s) => s.devQueue);
  const devNext = useLearnStore((s) => s.devNext);
  const dev = useLearnStore((s) => s.dev);
  const chapterDone = useLearnStore((s) => s.chapterDone);
  const moveDests = useLearnStore((s) => s.moveDests);
  const dropDests = useLearnStore((s) => s.dropDests);
  const selected = useLearnStore((s) => s.selected);
  const bookSelectSquare = useLearnStore((s) => s.bookSelectSquare);
  const bookSelectHand = useLearnStore((s) => s.bookSelectHand);
  const acknowledgeMove = useLearnStore((s) => s.acknowledgeMove);
  const goToMove = useLearnStore((s) => s.goToMove);
  const loadCourse = useLearnStore((s) => s.loadCourse);
  const pauseAutoAdvance = useLearnStore((s) => s.pauseAutoAdvance);
  const resumeAutoAdvance = useLearnStore((s) => s.resumeAutoAdvance);

  const items = useProgressStore((s) => s.items);
  const examResults = useExamStore((s) => s.results);

  // 表示すべきコースがストアの現在のコースと違う(画面切替など)場合は読み込み直す。
  // restart のときは、同じコースが読み込み済みでも最初から読み込み直す(入った最初の1回だけ)。
  // 終えた章に入り直したときも、終わりの画面のままにせず始めから読み込み直す。
  const topCourseId = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    const first = topCourseId.current === null;
    if (restart && first) topCourseId.current = course.id;
    // 最初から始める章(入った最初の章)では、分かれ目への移動をしない。
    const atTop = restart && topCourseId.current === course.id;
    const st = useLearnStore.getState();
    const reentry = !mounted.current && st.course.id === course.id && st.chapterDone;
    mounted.current = true;
    if (st.course.id !== course.id || (restart && first) || reentry) {
      loadCourse(course);
      // 2章目以降は、前の章と序盤が共通なので、分かれる地点まで飛んで再開する。
      const chapter = path?.chapters[chapterIndex];
      if (!atTop && chapter && chapter.divergeAt > 1) goToMove(chapter.divergeAt);
    }
  }, [course, storeCourse.id, loadCourse, goToMove, path, chapterIndex, restart]);

  // マウント中だけ相手の手の自動進行タイマーを有効にする。他画面へ移動した(アンマウントされた)
  // 間は裏で手が進み続けないよう、離脱時に必ず保留中のタイマーを破棄する。
  useEffect(() => {
    resumeAutoAdvance();
    return () => pauseAutoAdvance();
  }, [resumeAutoAdvance, pauseAutoAdvance]);

  // 「この手を試す」中に盤へ映す局面(null なら通常表示)。
  const [tryPreview, setTryPreview] = useState<{ sfen: string; lastUsi: string | null } | null>(null);
  const [trying, setTrying] = useState(false);
  // 呼び出しのたびに新しい関数を作ると TryMove の効果が走り直すので、固定する。
  // 同じ内容なら state を更新しない(再描画の連鎖を断つ)。
  const onPreview = useCallback((sfen: string | null, lastUsi: string | null) => {
    setTryPreview((prev) => {
      if (!sfen) return prev === null ? prev : null;
      return prev && prev.sfen === sfen && prev.lastUsi === lastUsi ? prev : { sfen, lastUsi };
    });
  }, []);
  const closeTry = useCallback(() => {
    setTrying(false);
    setTryPreview(null);
  }, []);

  // 「くわしく」の開閉。
  const [moreOpen, setMoreOpen] = useState(false);

  // 効果の実演(盤上再生)。
  const [demo, setDemo] = useState<DemoState | null>(null);

  function startDemo(d: MoveDemo) {
    // 自分の手を指した直後の局面(= 現在の局面)から手順を進めて、各コマの局面を作る。
    const frames: DemoFrame[] = [];
    let pos = position.clone();
    frames.push({ pos, text: "", lastKeys: new Set(), lastTo: null });
    for (const usi of d.usi) {
      const info = moveFromUSI(pos, usi);
      if (!info) break;
      const next = pos.clone();
      if (!next.doMove(info.move)) break;
      const to = info.move.to.usi;
      const from = info.move.from instanceof Square ? info.move.from.usi : null;
      frames.push({ pos: next, text: plainMove(info.displayText), lastKeys: new Set(from ? [from, to] : [to]), lastTo: to });
      pos = next;
    }
    setDemo({ demo: d, frames, step: 0, auto: true });
  }

  // 実演は1手ずつ自動で進める(900ms)。◀ ▶ を押したら手動に切り替わる。最後まで行ったら止まる。
  useEffect(() => {
    if (!demo || !demo.auto || demo.step >= demo.frames.length - 1) return;
    const t = setTimeout(() => setDemo((d) => (d ? { ...d, step: d.step + 1 } : d)), 900);
    return () => clearTimeout(t);
  }, [demo]);

  // 章が変わったら、実演・試し・開閉を閉じて先頭へ。結果パネルが変わったら開閉を閉じる。
  useEffect(() => {
    setDemo(null);
    setTrying(false);
    setTryPreview(null);
    setMoreOpen(false);
    window.scrollTo(0, 0);
  }, [course.id]);
  useEffect(() => {
    setMoreOpen(false);
    setDemo(null);
  }, [pendingAck]);
  useEffect(() => {
    if (!bookQuiz) {
      setTrying(false);
      setTryPreview(null);
    }
  }, [bookQuiz]);

  const mainTotal = useMemo(() => countMoves(course), [course]);

  // ストアがまだこのコースを読み込み切っていない(切替直後の1レンダー)場合は
  // currentNode が別コースのものである可能性があるため、描画をスキップする。
  const stat = useMemo(() => {
    const ch = path?.chapters[chapterIndex];
    return chapterStat(ch ?? { entry: undefined as never, course, divergeAt: 1 }, chapterIndex, items, examResults);
  }, [path, chapterIndex, course, items, examResults]);

  if (storeCourse.id !== course.id) return null;

  const myColor = course.mySide === "sente" ? Color.BLACK : Color.WHITE;
  const flipped = course.mySide === "gote";
  const title = path?.chapters[chapterIndex]
    ? `第${toKanjiNumber(chapterIndex + 1)}章 ${path.chapters[chapterIndex].entry.label}`
    : course.title;
  const moveNumber = nodeHistory.length + 1;

  // ── 進み具合: 本線は指した手数、逸れ手は終えた数を足す ──
  const total = mainTotal + devQueue.length;
  const done = chapterDone
    ? total
    : dev
      ? mainTotal + (devNext - 1)
      : Math.min(nodeHistory.length, mainTotal);

  // ── 盤に出すもの ──
  const guide = bookQuiz ? mainBranchOf(currentNode) : null;
  const wrong = bookQuiz?.wrong ?? null;
  // 答えの緑枠: 2回目以降の誤答、または「悪くない手」(許容手)を指したとき。
  // 赤枠: 指した悪い手(駒は動かさず元の位置のまま)。次に正解するか別の手を指すまで出す。
  // 「指すとどうなる？」の再生中・デモ中は、盤が別の局面になるので枠は出さない。
  const showAnswer = !!wrong && !trying && !demo && (wrong.kind !== "bad" || (bookQuiz?.misses ?? 0) >= 2);
  const answer = showAnswer && wrong?.correctUsi ? parseUSIMove(wrong.correctUsi) : null;
  const answerKeys = answer ? usiSquareKeys(wrong?.correctUsi) : undefined;
  const missKeys = wrong?.kind === "bad" && !trying && !demo ? usiSquareKeys(wrong.attemptedUsi) : undefined;
  let ghost: GhostPiece | null = null;
  if (answer && !(answer.from instanceof Square)) {
    ghost = { key: answer.to.usi, color: position.color, type: answer.from };
  }

  const lastParsed = lastMoveUsi ? parseUSIMove(lastMoveUsi) : null;
  let lastKeys: Set<string> | undefined;
  if (lastParsed) {
    lastKeys = new Set<string>([lastParsed.to.usi]);
    if (lastParsed.from instanceof Square) lastKeys.add(lastParsed.from.usi);
  }
  const lastToKey = lastParsed ? lastParsed.to.usi : null;

  const shownPosition = tryPreview ? positionFromSfen(tryPreview.sfen) : demo ? demo.frames[demo.step].pos : position;
  const shownLastKeys = tryPreview ? usiSquareKeys(tryPreview.lastUsi) : demo ? demo.frames[demo.step].lastKeys : lastKeys;
  const shownLastTo = tryPreview ? (tryPreview.lastUsi ? tryPreview.lastUsi.slice(2, 4) : null) : demo ? demo.frames[demo.step].lastTo : lastToKey;

  // 自分で手を探すので、選んだ駒の行き先を光らせる。
  const picking = !!bookQuiz && !trying && !demo;
  const quizFromKey = picking && selected?.kind === "board" ? selected.square.usi : null;
  const quizGlow = picking
    ? selected?.kind === "board"
      ? new Set((moveDests.get(selected.square.usi) ?? []).map((d) => d.usi))
      : selected?.kind === "hand"
        ? new Set((dropDests.get(selected.pieceType) ?? []).map((d) => d.usi))
        : undefined
    : undefined;

  function handleSquareClick(square: Square) {
    if (!picking) return;
    bookSelectSquare(square);
  }
  function handlePickHand(type: PieceType, color: Color) {
    if (picking) bookSelectHand(type, color);
  }
  const selectedHandType = picking && selected?.kind === "hand" ? selected.pieceType : null;
  const canPick = picking;

  return (
    <Screen className="learn-screen learn-wrap">
      <TopBar backLabel="戻る" onBack={onBack} title={title} />
      <div className="learn-prog" role="progressbar" aria-label="章の進み具合" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <i style={{ width: `${total === 0 ? 0 : Math.min(100, (done / total) * 100)}%` }} />
      </div>

      <div className="learn-hands">
        <HandChip label="▲持駒" position={shownPosition} color={Color.BLACK} flipped={flipped}
          canPick={canPick && myColor === Color.BLACK} selectedType={myColor === Color.BLACK ? selectedHandType : null} onPick={handlePickHand} />
        <HandChip label="△持駒" position={shownPosition} color={Color.WHITE} flipped={flipped}
          canPick={canPick && myColor === Color.WHITE} selectedType={myColor === Color.WHITE ? selectedHandType : null} onPick={handlePickHand} />
      </div>

      <Board
        position={shownPosition}
        fromKey={quizFromKey}
        fromHand={null}
        destKeys={quizGlow}
        ghost={ghost}
        lastKeys={shownLastKeys}
        emphasizeLast
        lastToKey={shownLastTo}
        onSquareClick={handleSquareClick}
        onHandPieceClick={() => {}}
        clickableHandColor="none"
        // 後手番のコースでは盤を後手側から見た向きにする(自分の駒が手前を向く)
        flipped={flipped}
        hideHands
        missKeys={missKeys}
        answerKeys={answerKeys}
      />

      <section className="dojo-panel learn-panel" aria-live="polite">
        {demo ? (
          <DemoPanel demo={demo} setDemo={setDemo} />
        ) : chapterDone ? (
          <CompletePanel
            title={title}
            correct={stat.correct}
            total={stat.total}
            nextLabel={path && onNextChapter ? path.chapters[chapterIndex + 1]?.entry.label ?? "" : null}
            examReady={stat.ready && !!onExam}
            onNext={onNextChapter}
            onStrategy={onStrategy ?? onBack}
            onExam={onExam}
          />
        ) : pendingAck ? (
          <ResultPanel ack={pendingAck} open={moreOpen} setOpen={setMoreOpen} onDemo={startDemo} onNext={acknowledgeMove} />
        ) : bookQuiz ? (
          <QuestionPanel
            quiz={bookQuiz}
            moveNumber={moveNumber}
            lastOpponent={lastOpponent}
            aim={guide?.aim ?? buildHint(guide?.note, guide ? moveFromUSI(position, guide.usi)?.displayText : undefined)}
            sharp={!!guide?.sharp}
            introNote={
              !lastOpponent && path && chapterIndex > 0 && startDepth > 0 && nodeHistory.length === startDepth && !dev
                ? `${startDepth}手目までは学んだ形と同じ。ここから ${path.chapters[chapterIndex].entry.label}`
                : ""
            }
            onTry={() => setTrying(true)}
          />
        ) : (
          <>
            <p className="oppline">{lastOpponent ? lastOpponent.moveNumber : moveNumber}手目 ・ 相手の手は自動で進みます</p>
            {lastOpponent && oppPhase === "shown" ? <OppLine ack={lastOpponent} big /> : <p className="oppbig">相手が指します…</p>}
          </>
        )}
      </section>

      {trying && bookQuiz?.wrong && (
        <TryMove
          sfenBefore={currentNode.sfen}
          attemptedUsi={bookQuiz.wrong.attemptedUsi}
          attemptedText={bookQuiz.wrong.attemptedText}
          correctUsi={bookQuiz.wrong.correctUsi}
          correctText={bookQuiz.wrong.correctText}
          onPreview={onPreview}
          onClose={closeTry}
        />
      )}
    </Screen>
  );
}

/** 自分の番: 「あなたの番 ・ n手目」+ 相手の手 + ねらい。外したときは赤い一行 / 緑枠+答え。 */
function QuestionPanel({
  quiz, moveNumber, lastOpponent, aim, sharp, introNote, onTry,
}: {
  quiz: BookQuizState;
  moveNumber: number;
  lastOpponent: AckMove | null;
  aim: string | null;
  sharp: boolean;
  introNote: string;
  onTry: () => void;
}) {
  const wrong = quiz.wrong;

  // 別の良い手(許容手・同じくらい良い手): 認めたうえで、定跡の手を緑の枠で示す。
  if (wrong && wrong.kind !== "bad") {
    const mark = wrong.attemptedText.slice(0, 1);
    return (
      <>
        <p className="soft-t">{mark} その手も悪くありません。定跡は {wrong.correctText} です</p>
        <p className="expl">
          {wrong.attemptedText} も有力ですが、この章では {wrong.correctText} で覚えます。緑の枠の手を指してください。
        </p>
      </>
    );
  }

  const isDeviation = !!lastOpponent?.deviation;
  const isVariation = isDeviation && !!lastOpponent?.variation;
  return (
    <>
      <p className="turn">
        {isVariation
          ? `相手が別の手を指しました(${lastOpponent.moveText})。この局面の正しい手は？`
          : isDeviation
            ? `相手が定跡を外れました(${lastOpponent.moveText})。咎める手を指してください`
            : `あなたの番 ・ ${moveNumber}手目`}
      </p>
      {lastOpponent && !isDeviation && <OppLine ack={lastOpponent} />}
      {introNote && <p className="oppline">{introNote}</p>}
      <div className="aim">
        {aim ? (
          <>
            <div className="aim-t">{moveNumber}手目のねらい{sharp ? " ・ 急所" : ""}</div>
            <p>{aim}</p>
          </>
        ) : (
          <div className="aim-t">{moveNumber}手目{sharp ? " ・ 急所" : ""} ・ 次の一手は？</div>
        )}
      </div>
      {wrong && quiz.misses === 1 && (
        <p className="miss-l">× {wrong.attemptedText} — 定跡の手ではありません。もう一度</p>
      )}
      {wrong && quiz.misses >= 2 && (
        <>
          <p className="ans-l">答えは {wrong.correctText}。緑の枠のとおり指してください</p>
          <button type="button" className="btn-secondary full" onClick={onTry}>
            ▶ {wrong.attemptedText}を指すとどうなる？
          </button>
        </>
      )}
    </>
  );
}

/** 正解の結果: 「○ 正解」+ 理由 + くわしく + 次へ。 */
function ResultPanel({
  ack, open, setOpen, onDemo, onNext,
}: {
  ack: AckMove;
  open: boolean;
  setOpen: (v: boolean) => void;
  onDemo: (d: MoveDemo) => void;
  onNext: () => void;
}) {
  const demos = ack.demos ?? [];
  const hasMore = !!ack.more || demos.length > 0;
  return (
    <>
      <p className="good"><b>○ 正解 {ack.moveText}</b></p>
      {ack.note && <p className="expl">{ack.note}</p>}
      {hasMore && (
        <button type="button" className="tbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
          くわしく {open ? "▴" : "▾"}
        </button>
      )}
      {open && (
        <>
          {ack.more && <p className="more">{ack.more}</p>}
          {demos.map((d) => (
            <button key={d.title} type="button" className="btn-secondary full mb" onClick={() => onDemo(d)}>
              ▶ 実演 {d.title}
            </button>
          ))}
        </>
      )}
      <button type="button" className="btn-primary full" onClick={onNext}>次へ</button>
    </>
  );
}

/** 実演の再生中: 題・手順(いまの手は太字)・◀ ▶ と「5 / 6手」・結論・閉じる。 */
function DemoPanel({ demo, setDemo }: { demo: DemoState; setDemo: (d: DemoState | null) => void }) {
  const last = demo.frames.length - 1;
  const go = (step: number) => setDemo({ ...demo, step: Math.max(0, Math.min(last, step)), auto: false });
  return (
    <>
      <h3 className="dt">実演 {demo.demo.title}</h3>
      <ol className="mlist">
        {demo.frames.slice(1).map((f, i) => (
          <li key={i} className={i + 1 === demo.step ? "cur" : ""}>
            <span>{i + 1}</span>
            {f.text}
          </li>
        ))}
      </ol>
      <div className="step">
        <button type="button" className="btn-secondary sq" aria-label="1手戻る" disabled={demo.step <= 0} onClick={() => go(demo.step - 1)}>◀</button>
        <span className="meta">{demo.step} / {last}手</span>
        <button type="button" className="btn-secondary sq" aria-label="1手進む" disabled={demo.step >= last} onClick={() => go(demo.step + 1)}>▶</button>
      </div>
      {demo.step >= last && <p className="demo-text">{demo.demo.text}</p>}
      <button type="button" className="btn-secondary full" onClick={() => setDemo(null)}>実演を閉じる</button>
    </>
  );
}

/** 章を終えた: まとめ2行 + 次の章へ(主)+ 認定試験(副)。点数は出さない。 */
function CompletePanel({
  title, correct, total, nextLabel, examReady, onNext, onStrategy, onExam,
}: {
  title: string;
  correct: number;
  total: number;
  /** 次の章の名前。null なら最後の章。 */
  nextLabel: string | null;
  examReady: boolean;
  onNext?: () => void;
  onStrategy: () => void;
  onExam?: () => void;
}) {
  return (
    <>
      <h2 className="done">{title}を<span className="nw">終えました</span></h2>
      <p className="res-p">正解した問題 {correct} / {total}</p>
      <p className="res-p">間違えた問題は明日の復習に出ます</p>
      <div className="res-actions">
        {nextLabel !== null && onNext ? (
          <button type="button" className="btn-primary full" onClick={onNext}>次の章へ ▶ {nextLabel}</button>
        ) : (
          <button type="button" className="btn-primary full" onClick={onStrategy}>戦法のページへ戻る</button>
        )}
        {examReady && onExam && (
          <button type="button" className="btn-secondary full" onClick={onExam}>この章の認定試験を受ける</button>
        )}
      </div>
    </>
  );
}

/** 本線の手数(逸れ手は数えない)。 */
function countMoves(course: JosekiCourse): number {
  let count = 0;
  let current = course.root;
  for (;;) {
    const main = mainBranchOf(current);
    if (!main || !main.child) break;
    count++;
    current = main.child;
  }
  return count;
}
