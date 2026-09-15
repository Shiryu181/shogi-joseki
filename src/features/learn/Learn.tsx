import { useEffect, useMemo } from "react";
import { Color, PieceType, Square, moveFromUSI, parseUSIMove } from "../../domain/shogi";
import { useLearnStore, branchMove, positionFromNode } from "../../store/learnStore";
import type { JosekiCourse, JosekiNode } from "../../domain/types";
import type { LearnPath } from "../../domain/josekiLoader";
import { Board } from "../../ui/Board";
import type { GhostPiece, HandHighlight } from "../../ui/Board";
import { CommentPanel } from "../../ui/CommentPanel";
import { buildHint } from "../../domain/hint";
import { BranchNav } from "../../ui/BranchNav";
import "./Learn.css";

export interface LearnProps {
  /** 表示するコース。切り替え時は都度渡し直す(本物のコース ⇔ 分岐ナビ動作確認用デモ)。 */
  course: JosekiCourse;
  /** 戻るボタンの遷移先。 */
  onBack: () => void;
  /**
   * 学習パス(章の並び)。戦法を選んだら盤の上で章を順に通す。
   * 未指定なら単独コースとして動く(開発用の分岐デモなど)。
   */
  path?: LearnPath;
  chapterIndex?: number;
  /** 「次の章へ」。最後の章では呼ばれない。 */
  onNextChapter?: () => void;
}

/**
 * 学習モード(なぞり)画面。DESIGN.md §5.3 準拠。
 * 本線を1手ずつ、なぞりガイド(from強調+dest glow+ghost駒)で提示し、
 * 光っている升をクリックするか「なぞって次へ」ボタンで進める。
 * 分岐(本線/変化/逸れ手)がある局面では BranchNav で切替可能。
 */
export function Learn({ course, onBack, path, chapterIndex = 0, onNextChapter }: LearnProps) {
  const storeCourse = useLearnStore((s) => s.course);
  const currentNode = useLearnStore((s) => s.currentNode);
  const nodeHistory = useLearnStore((s) => s.nodeHistory);
  const selectedBranchIndex = useLearnStore((s) => s.selectedBranchIndex);
  const position = useLearnStore((s) => s.position);
  const autoAdvanceOpponent = useLearnStore((s) => s.autoAdvanceOpponent);
  const pendingAck = useLearnStore((s) => s.pendingAck);
  const quiz = useLearnStore((s) => s.quiz);
  const moveDests = useLearnStore((s) => s.moveDests);
  const dropDests = useLearnStore((s) => s.dropDests);
  const lastMoveUsi = useLearnStore((s) => s.lastMoveUsi);
  const selected = useLearnStore((s) => s.selected);
  const quizSelectSquare = useLearnStore((s) => s.quizSelectSquare);
  const quizSelectHand = useLearnStore((s) => s.quizSelectHand);
  const bookQuiz = useLearnStore((s) => s.bookQuiz);
  const lastOpponent = useLearnStore((s) => s.lastOpponent);
  const bookQuizEnabled = useLearnStore((s) => s.bookQuizEnabled);
  const bookSelectSquare = useLearnStore((s) => s.bookSelectSquare);
  const bookSelectHand = useLearnStore((s) => s.bookSelectHand);
  const bookRetry = useLearnStore((s) => s.bookRetry);
  const bookReveal = useLearnStore((s) => s.bookReveal);
  const quizRetry = useLearnStore((s) => s.quizRetry);
  const quizReveal = useLearnStore((s) => s.quizReveal);
  const quizReturnToMainLine = useLearnStore((s) => s.quizReturnToMainLine);
  const attemptSquare = useLearnStore((s) => s.attemptSquare);
  const advance = useLearnStore((s) => s.advance);
  const chooseBranch = useLearnStore((s) => s.chooseBranch);
  const goToMove = useLearnStore((s) => s.goToMove);
  const loadCourse = useLearnStore((s) => s.loadCourse);
  const pauseAutoAdvance = useLearnStore((s) => s.pauseAutoAdvance);
  const resumeAutoAdvance = useLearnStore((s) => s.resumeAutoAdvance);

  // 表示すべきコースがストアの現在のコースと違う(画面切替など)場合は読み込み直す。
  useEffect(() => {
    if (storeCourse.id !== course.id) {
      loadCourse(course);
      // 2章目以降は、前の章と序盤が共通なので、分かれる地点まで飛んで再開する。
      const chapter = path?.chapters[chapterIndex];
      if (chapter && chapter.divergeAt > 1) goToMove(chapter.divergeAt);
    }
  }, [course, storeCourse.id, loadCourse, goToMove, path, chapterIndex]);

  // マウント中だけ相手の手の自動進行タイマーを有効にする。他画面へ移動した(アンマウントされた)
  // 間は裏で手が進み続けないよう、離脱時に必ず保留中のタイマーを破棄する。
  useEffect(() => {
    resumeAutoAdvance();
    return () => pauseAutoAdvance();
  }, [resumeAutoAdvance, pauseAutoAdvance]);

  const guide = branchMove(currentNode, selectedBranchIndex);
  const isGoal = !guide;
  const moveNumber = nodeHistory.length + 1;
  const totalMoves = useMemo(() => countMoves(course.root), [course]);

  // 確認待ち中(相手の手を自動で指した直後)は、解説を読むことに集中してもらうため
  // 次の自分の手のガイドは出さない。「次へ」を押すと通常の表示に戻る。
  const guideHidden = pendingAck !== null || quiz !== null || bookQuiz !== null;
  const parsed = guide && !guideHidden ? parseUSIMove(guide.usi) : null;
  const moveInfo = guide && !guideHidden ? moveFromUSI(position, guide.usi) : null;

  // 手数ジャンプ用に、本線の各手の表示テキストを作っておく(「最初へ」ボタンの代わり)。
  const mainLine = useMemo(() => {
    const out: { n: number; text: string }[] = [];
    let node = course.root;
    let pos = positionFromNode(node);
    for (let n = 1; ; n++) {
      const mv = node.branches.find((b) => b.kind === "main");
      if (!mv || !mv.child) break;
      const info = moveFromUSI(pos, mv.usi);
      out.push({ n, text: info?.displayText ?? mv.usi });
      node = mv.child;
      pos = positionFromNode(node);
    }
    return out;
  }, [course]);

  const fromKey = parsed && parsed.from instanceof Square ? parsed.from.usi : null;
  const fromHand: HandHighlight | null =
    parsed && !(parsed.from instanceof Square) ? { type: parsed.from, color: position.color } : null;
  const glowKeys = parsed ? new Set([parsed.to.usi]) : undefined;

  let ghost: GhostPiece | null = null;
  if (parsed) {
    const movingType = parsed.from instanceof Square ? position.board.at(parsed.from)?.type : parsed.from;
    if (movingType) {
      ghost = { key: parsed.to.usi, color: position.color, type: movingType };
    }
  }

  // 直前に指された手の移動元・移動先。相手の手は自動で進むので、
  // どの駒が動いたのかを盤上ではっきり示す。
  const lastParsed = lastMoveUsi ? parseUSIMove(lastMoveUsi) : null;
  let lastKeys: Set<string> | undefined;
  if (lastParsed) {
    lastKeys = new Set<string>([lastParsed.to.usi]);
    if (lastParsed.from instanceof Square) lastKeys.add(lastParsed.from.usi);
  }
  const lastToKey = lastParsed ? lastParsed.to.usi : null;

  function handleSquareClick(square: Square) {
    if (quiz) { quizSelectSquare(square); return; }
    if (bookQuiz) { bookSelectSquare(square); return; }
    attemptSquare(square);
  }

  // 出題中は「自分で合法手を探す」ので、選択した駒の行き先を光らせる。
  const inQuiz = quiz !== null || bookQuiz !== null;
  const quizFromKey = inQuiz && selected?.kind === "board" ? selected.square.usi : null;
  const quizGlow = inQuiz
    ? selected?.kind === "board"
      ? new Set((moveDests.get(selected.square.usi) ?? []).map((d) => d.usi))
      : selected?.kind === "hand"
        ? new Set((dropDests.get(selected.pieceType) ?? []).map((d) => d.usi))
        : undefined
    : undefined;
  const quizFromHand =
    inQuiz && selected?.kind === "hand" ? { type: selected.pieceType, color: position.color } : null;

  function handleHandPieceClick(type: PieceType, color: Color) {
    // なぞりモードでは持ち駒トレイのクリックでは進めない(移動先マスのクリックのみ受理)。
    // 出題中は自分で手を探すので、打つ手のために持ち駒も選べるようにする。
    if (quiz) quizSelectHand(type, color);
    else if (bookQuiz) bookSelectHand(type, color);
  }

  // ストアがまだこのコースを読み込み切っていない(切替直後の1レンダー)場合は
  // currentNode が別コースのものである可能性があるため、描画をスキップする。
  if (storeCourse.id !== course.id) return null;

  const myColor = course.mySide === "sente" ? Color.BLACK : Color.WHITE;
  const isOpponentTurn = !isGoal && position.color !== myColor;
  const showWaitPill = isOpponentTurn && autoAdvanceOpponent && !pendingAck;

  return (
    <div className="learn-wrap">
      <div className="learn-frame">
        <div className="abar">
          <button type="button" className="back" onClick={onBack} aria-label="戻る">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="learn-head">
            <div className="tl">定跡道場 ・ 学習</div>
            <h1>{path ? path.title : course.title}</h1>
          </div>
        </div>
        {/* 手番・手数のバッジと章の帯を1行にまとめる(縦の場所を取らないように)。
            章は今いる章を濃くする。押してその章へ移ることはできない(順に通すため)。 */}
        <div className="chapters" aria-label="進み具合">
          <span className={`badge b-turn${position.color === Color.WHITE ? " gote" : ""}`}>
            {position.color === Color.BLACK ? "▲ 先手" : "△ 後手"}
          </span>
          <span className="badge b-prog">
            {Math.min(nodeHistory.length + 1, totalMoves)}/{totalMoves}手
          </span>
          {path?.chapters.map((ch, i) => (
            <span key={ch.entry.id} className={`chapter${i === chapterIndex ? " on" : i < chapterIndex ? " done" : ""}`}>
              {ch.entry.label}
            </span>
          ))}
        </div>
        <Board
          position={position}
          fromKey={inQuiz ? quizFromKey : fromKey}
          fromHand={inQuiz ? quizFromHand : fromHand}
          glowKeys={inQuiz ? undefined : glowKeys}
          destKeys={inQuiz ? quizGlow : undefined}
          ghost={inQuiz ? null : ghost}
          lastKeys={lastKeys}
          emphasizeLast
          lastToKey={lastToKey}
          onSquareClick={handleSquareClick}
          onHandPieceClick={handleHandPieceClick}
          clickableHandColor={inQuiz ? (course.mySide === "sente" ? Color.BLACK : Color.WHITE) : "none"}
          // 後手番のコースでは盤を後手側から見た向きにする(自分の駒が手前を向く)
          flipped={course.mySide === "gote"}
        />
        {quiz && !quiz.solved && (
          <div className={`quizpill${position.color === myColor ? "" : " waiting"}`}>
            {position.color !== myColor
              ? "相手が応じています…"
              : quiz.step === 0
                ? "相手が定跡を外しました。咎める手を指してください"
                : "続けて咎める手を指してください"}
          </div>
        )}
        {showWaitPill && !quiz && <div className="waitpill">相手が指しています…</div>}
        {pendingAck && !quiz && (
          <div className="ackpill">
            {pendingAck.by === "me" ? "正解です。解説を読んで「次へ」" : "相手が指しました。解説を読んで「次へ」"}
          </div>
        )}
        {!isGoal && !showWaitPill && !pendingAck && !quiz && !bookQuiz && (
          <div className="guidepill">光っているマスへ動かして次の手をなぞる</div>
        )}
        {/* 章の冒頭(分かれ目の直後、相手の手が自動で入った直後まで)に出す */}
        {path && chapterIndex > 0 && nodeHistory.length <= path.chapters[chapterIndex].divergeAt && (
          <div className="chapter-intro">
            {path.chapters[chapterIndex].divergeAt - 1}手目までは学んだ形と同じ。ここから {path.chapters[chapterIndex].entry.label}
          </div>
        )}
        {bookQuiz && !bookQuiz.revealed ? (
          <div className="learn-navrow">
          {/* 「◀ 戻る」と書いたボタン型のセレクト。開くと過去の手が並び、選ぶとその局面へ戻る。
              バッジをセレクト化した案は気づかれないので、押せると分かる見た目にした。 */}
          <select
            className="back-select"
            aria-label="戻る手を選ぶ"
            value=""
            disabled={nodeHistory.length === 0}
            onChange={(e) => { if (e.target.value) goToMove(Number(e.target.value)); }}
          >
            <option value="">◀ 戻る</option>
            {mainLine
              .filter((m) => m.n <= nodeHistory.length)
              .reverse()
              .map((m) => (
                <option key={m.n} value={m.n}>
                  {m.n}手目 {m.text} の前に戻る
                </option>
              ))}
          </select>
            <button type="button" onClick={bookRetry} disabled={!bookQuiz.wrong}>
              もう一度
            </button>
            <button type="button" onClick={bookReveal}>
              答えを見る
            </button>
          </div>
        ) : quiz ? (
          <div className="learn-navrow">
            {quiz.solved ? (
              <button type="button" className="primary" onClick={quizReturnToMainLine}>
                本線に戻って続ける ▶
              </button>
            ) : (
              <>
                <button type="button" onClick={quizRetry} disabled={!quiz.wrong}>
                  もう一度
                </button>
                <button type="button" onClick={quizReveal}>
                  答えを見る
                </button>
              </>
            )}
          </div>
        ) : (
        <div className="learn-navrow">
          {/* 「◀ 戻る」と書いたボタン型のセレクト。開くと過去の手が並び、選ぶとその局面へ戻る。
              バッジをセレクト化した案は気づかれないので、押せると分かる見た目にした。 */}
          <select
            className="back-select"
            aria-label="戻る手を選ぶ"
            value=""
            disabled={nodeHistory.length === 0}
            onChange={(e) => { if (e.target.value) goToMove(Number(e.target.value)); }}
          >
            <option value="">◀ 戻る</option>
            {mainLine
              .filter((m) => m.n <= nodeHistory.length)
              .reverse()
              .map((m) => (
                <option key={m.n} value={m.n}>
                  {m.n}手目 {m.text} の前に戻る
                </option>
              ))}
          </select>
          {isGoal && !pendingAck && path && onNextChapter ? (
            <button type="button" className="primary" onClick={onNextChapter}>
              次の章へ ▶ {path.chapters[chapterIndex + 1]?.entry.label ?? ""}
            </button>
          ) : (
            <button type="button" className="primary" onClick={advance} disabled={isGoal && !pendingAck}>
              {pendingAck ? "次へ ▶" : isGoal ? "この章は修了です" : "なぞって次へ ▶"}
            </button>
          )}
        </div>
        )}
        {bookQuiz ? (
          <div className="quizpanel">
            {lastOpponent && (
              <p className="opp-move">
                <span className="quiz-no">{lastOpponent.moveNumber}手目</span>
                相手 {lastOpponent.moveText}
                {lastOpponent.note ? ` — ${lastOpponent.note}` : ""}
              </p>
            )}
            {(() => {
              // 「なぜその手なのか」から逆算して考えられるよう、答えの手の解説を
              // 升だけ伏せて『ねらい』として先に見せる。問いの文は毎回同じなので出さず、
              // 手数だけを添える(盤の上の案内が「盤に指してください」と促している)。
              const hint = guide?.aim ?? buildHint(guide?.note, moveInfo?.displayText);
              return (
                <p className="quiz-aim">
                  <span className="quiz-no">{moveNumber}手目</span>
                  {hint ?? "次の一手は？"}
                </p>
              );
            })()}
            {currentNode.comment && <p className="quiz-comment">{currentNode.comment}</p>}
            {bookQuiz.wrong && (
              bookQuiz.wrong.openEnded ? (
                <p className="quiz-wrong soft">
                  △ {bookQuiz.wrong.attemptedText}
                  <span>
                    その手も悪くありません(差はわずかです)。この講座では {bookQuiz.wrong.correctText} と
                    進めます。
                  </span>
                </p>
              ) : (
                <p className="quiz-wrong">
                  ✕ {bookQuiz.wrong.attemptedText}
                  <span>
                    定跡は {bookQuiz.wrong.correctText} です。この手が悪いとは限りませんが、
                    まずは定跡の形を覚えましょう。
                  </span>
                </p>
              )
            )}
          </div>
        ) : quiz ? (
          <div className="quizpanel">
            <p className="quiz-head">
              <span className="quiz-no">{quiz.anchorMoveNumber}手目</span>
              相手は {quiz.deviationText} と定跡を外しました
            </p>
            {quiz.deviation.note && <p className="quiz-note">{quiz.deviation.note}</p>}
            {currentNode.comment && <p className="quiz-comment">{currentNode.comment}</p>}
            {quiz.wrong && (
              <p className="quiz-wrong">
                ✕ {quiz.wrong.attemptedText}
                <span>ここでは、もっと厳しい手があります。もう一度考えてみましょう。</span>
              </p>
            )}
            {quiz.solved && quiz.deviation.punishNote && (
              <p className="quiz-punish">{quiz.deviation.punishNote}</p>
            )}
          </div>
        ) : pendingAck ? (
          <CommentPanel
            isGoal={false}
            moveNumber={pendingAck.moveNumber}
            moveText={pendingAck.moveText}
            note={pendingAck.note}
            comment={pendingAck.comment}
            kind={pendingAck.kind}
            punishNote={pendingAck.punishNote}
          />
        ) : showWaitPill && bookQuizEnabled ? (
          // 相手が指すまでの待ち時間。ここで通常の解説パネルを出すと、
          // これから相手が指す手の解説が先に見えてしまい(ネタバレ)、
          // 指したあとに出題パネルでもう一度同じ説明が出て二重になる。
          <div className="quizpanel">
            <p className="quiz-comment">相手の手を待っています…</p>
          </div>
        ) : (
          <CommentPanel
            isGoal={isGoal}
            moveNumber={isGoal ? undefined : moveNumber}
            moveText={moveInfo?.displayText}
            note={guide?.note}
            comment={currentNode.comment}
            kind={guide?.kind}
            punishNote={guide?.punishNote}
            goalLabel={course.goalLabel}
          />
        )}
        {!pendingAck && !quiz && !bookQuiz && (
          <BranchNav branches={currentNode.branches} activeIndex={selectedBranchIndex} onSelect={chooseBranch} />
        )}
      </div>
    </div>
  );
}

function countMoves(node: JosekiNode): number {
  let count = 0;
  let current = node;
  while (current.branches.length > 0) {
    count++;
    // 逸れ手の枝を数に含めないよう、本線だけを辿る。
    const main = current.branches.find((b) => b.kind === "main") ?? current.branches[0];
    const child = main.child;
    if (!child) break;
    current = child;
  }
  return count;
}
