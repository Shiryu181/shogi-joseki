import { useEffect, useMemo } from "react";
import { Color, Square, parseUSIMove } from "../../domain/shogi";
import { primaryBranch, usePracticeStore } from "../../store/practiceStore";
import type { JosekiCourse } from "../../domain/types";
import { Board } from "../../ui/Board";
import type { GhostPiece, HandHighlight } from "../../ui/Board";
import { formatSenteViewScore } from "../../engine/scoreView";
import "./Practice.css";

export interface PracticeProps {
  /** 表示するコース。切り替え時は都度渡し直す。 */
  course: JosekiCourse;
}

/**
 * 練習モード(実戦)画面。DESIGN.md §4.2 / §5.4 準拠。
 * 自分の手番だけ盤を自由に操作でき(合法手なら何でも指せる)、相手の手番は
 * コースの台本を少し間を置いて自動で指す。判定は「収録済みの定石手と一致するか」
 * だけで行い(エンジンなし)、不一致は評価的な断定をせず正解手を提示する。
 */
export function Practice({ course }: PracticeProps) {
  const storeCourse = usePracticeStore((s) => s.course);
  const currentNode = usePracticeStore((s) => s.currentNode);
  const position = usePracticeStore((s) => s.position);
  const moveDests = usePracticeStore((s) => s.moveDests);
  const dropDests = usePracticeStore((s) => s.dropDests);
  const selected = usePracticeStore((s) => s.selected);
  const status = usePracticeStore((s) => s.status);
  const moveIndex = usePracticeStore((s) => s.moveIndex);
  const totalMoves = usePracticeStore((s) => s.totalMoves);
  const correctCount = usePracticeStore((s) => s.correctCount);
  const mistakeCount = usePracticeStore((s) => s.mistakeCount);
  const wrongAttempt = usePracticeStore((s) => s.wrongAttempt);
  const lastMove = usePracticeStore((s) => s.lastMove);
  const hintOn = usePracticeStore((s) => s.hintOn);
  const engineStatus = usePracticeStore((s) => s.engineStatus);
  const engineComparisonStatus = usePracticeStore((s) => s.engineComparisonStatus);
  const engineComparison = usePracticeStore((s) => s.engineComparison);
  const selectSquare = usePracticeStore((s) => s.selectSquare);
  const selectHand = usePracticeStore((s) => s.selectHand);
  const toggleHint = usePracticeStore((s) => s.toggleHint);
  const retry = usePracticeStore((s) => s.retry);
  const restart = usePracticeStore((s) => s.restart);
  const loadCourse = usePracticeStore((s) => s.loadCourse);
  const ensureEngineLoaded = usePracticeStore((s) => s.ensureEngineLoaded);

  // 表示すべきコースがストアの現在のコースと違う(画面切替など)場合は読み込み直す。
  useEffect(() => {
    if (storeCourse.id !== course.id) {
      loadCourse(course);
    }
  }, [course, storeCourse.id, loadCourse]);

  // エンジンの遅延ロード: 練習画面に入ったときに一度だけ要求する(学習/Sandboxでは
  // 呼ばれないため、そちらではロードされない)。既にロード済み/失敗確定なら
  // ensureEngineLoaded 内部で何もしない。エンジンが無くても練習モードは
  // 台本判定でそのまま動く(グレースフルデグレード)。
  useEffect(() => {
    ensureEngineLoaded();
  }, [ensureEngineLoaded]);

  const myColor = course.mySide === "sente" ? Color.BLACK : Color.WHITE;

  // 自分の駒を選択中はその合法手先を光らせる(sandboxStore と同じ挙動)。
  const selectedGlowKeys = useMemo(() => {
    if (!selected) return undefined;
    const dests =
      selected.kind === "board" ? (moveDests.get(selected.square.usi) ?? []) : (dropDests.get(selected.pieceType) ?? []);
    return new Set(dests.map((s) => s.usi));
  }, [selected, moveDests, dropDests]);

  // ヒント: 何も選択していない自分の手番でだけ、次の定石手の from/to を光らせる。
  const hintGuide = hintOn && status === "userTurn" && !selected ? primaryBranch(currentNode) : null;
  const hintParsed = hintGuide ? parseUSIMove(hintGuide.usi) : null;
  const hintFromKey = hintParsed && hintParsed.from instanceof Square ? hintParsed.from.usi : null;
  const hintFromHand: HandHighlight | null =
    hintParsed && !(hintParsed.from instanceof Square) ? { type: hintParsed.from, color: position.color } : null;
  const hintGlowKeys = hintParsed ? new Set([hintParsed.to.usi]) : undefined;
  let hintGhost: GhostPiece | null = null;
  if (hintParsed) {
    const movingType = hintParsed.from instanceof Square ? position.board.at(hintParsed.from)?.type : hintParsed.from;
    if (movingType) hintGhost = { key: hintParsed.to.usi, color: position.color, type: movingType };
  }

  const fromKey = selected?.kind === "board" ? selected.square.usi : hintFromKey;
  const fromHand: HandHighlight | null = selected?.kind === "hand" ? { type: selected.pieceType, color: myColor } : hintFromHand;
  const glowKeys = selectedGlowKeys ?? hintGlowKeys;
  const ghost = selected ? null : hintGhost;

  const lastKeys = useMemo(() => {
    if (!lastMove) return undefined;
    const parsed = parseUSIMove(lastMove.usi);
    if (!parsed) return undefined;
    const keys = new Set<string>([parsed.to.usi]);
    if (parsed.from instanceof Square) keys.add(parsed.from.usi);
    return keys;
  }, [lastMove]);

  // ストアがまだこのコースを読み込み切っていない場合は描画をスキップする(Learn と同様)。
  if (storeCourse.id !== course.id) return null;

  const displayMoveNumber = Math.min(moveIndex + 1, totalMoves);
  const turnMark = position.color === Color.BLACK ? "▲" : "△";
  const opponentDeviated = lastMove?.by === "opponent" && lastMove.kind === "deviation";

  function handleSquareClick(square: Square) {
    selectSquare(square);
  }

  return (
    <div className="practice-wrap">
      <div className="practice-frame">
        <div className="practice-head">
          <div className="tl">JOSEKI DOJO ・ 練習(実戦)</div>
          <h1>{course.title}</h1>
        </div>

        <div className="binfo">
          {status === "goal" ? (
            <span className="badge b-goal">達成</span>
          ) : (
            <span className={`badge b-turn${status === "opponentTurn" ? " waiting" : ""}`}>
              {turnMark} {status === "userTurn" ? "あなたの手番" : "相手の手番"}
            </span>
          )}
          {opponentDeviated && <span className="badge b-line">相手が定石を外した</span>}
          <span className="badge b-prog">
            {displayMoveNumber} / {totalMoves} 手
          </span>
          <span className="badge b-good">正解 {correctCount}</span>
          <span className="badge b-bad">ミス {mistakeCount}</span>
          {engineStatus === "loading" && <span className="badge b-engine loading">エンジン準備中…</span>}
          {engineStatus === "ready" && <span className="badge b-engine on">エンジン準備完了</span>}
          {engineStatus === "unavailable" && <span className="badge b-engine off">エンジン利用不可</span>}
        </div>

        <Board
          position={position}
          fromKey={fromKey}
          fromHand={fromHand}
          glowKeys={glowKeys}
          lastKeys={lastKeys}
          ghost={ghost}
          onSquareClick={handleSquareClick}
          onHandPieceClick={(type, color) => selectHand(type, color)}
          clickableHandColor={status === "userTurn" ? myColor : "none"}
        />

        {status === "opponentTurn" && <div className="waitpill">相手が指しています…</div>}
        {hintGuide && <div className="hintpill">光っているマスへ動かすと定石の手になります</div>}

        {status === "goal" ? (
          <div className="goal-banner">
            <b>理想陣形に到達しました</b>
            <p>{course.goalFormation}</p>
            <div className="goal-stats">
              <span>
                手数 {totalMoves} ・ 正解 {correctCount} ・ ミス {mistakeCount}
              </span>
            </div>
          </div>
        ) : (
          <div className="feedback-area">
            {wrongAttempt ? (
              <div className="explain">
                <div className="mvnow">
                  <span className="no">あなたが指した手</span>
                  <span className="mv">{wrongAttempt.attemptedText}</span>
                </div>
                <div className="fb wrong">
                  <span className="ic">✕</span>
                  <div>
                    <b>定石(このコース)の手ではありません</b>
                  </div>
                </div>
                <div className="fb right">
                  <span className="ic">✓</span>
                  <div>
                    <b>この局面の定石手は {wrongAttempt.correctText} です</b>
                    {wrongAttempt.correctNote && <span className="s">{wrongAttempt.correctNote}</span>}
                  </div>
                </div>

                {engineComparisonStatus === "thinking" && (
                  <div className="engine-panel engine-thinking">エンジンが確認中…</div>
                )}
                {engineComparisonStatus === "error" && (
                  <div className="engine-panel engine-note">エンジンの評価を取得できませんでした</div>
                )}
                {engineComparisonStatus === "done" && engineComparison && (
                  <div className="engine-panel">
                    <div className="engine-panel-title">
                      エンジン評価(先手視点・各{(engineComparison.thinkMs / 1000).toFixed(1)}秒思考)
                    </div>
                    <div className="engine-row">
                      <span className="engine-label">あなたの手 {engineComparison.yourMove.displayText}</span>
                      <span className="engine-score">{formatSenteViewScore(engineComparison.yourMove)}</span>
                    </div>
                    <div className="engine-row">
                      <span className="engine-label">定石手 {engineComparison.josekiMove.displayText}</span>
                      <span className="engine-score">{formatSenteViewScore(engineComparison.josekiMove)}</span>
                    </div>
                    <div className="engine-caveat">
                      エンジンによる目安の評価値です。数値差が小さい場合は誤差の範囲のことがあります。
                    </div>
                  </div>
                )}
              </div>
            ) : (
              lastMove?.by === "user" && (
                <div key={moveIndex} className="correct-flash">
                  <span className="ic">✓</span>
                  <span>正解です({lastMove.displayText})</span>
                </div>
              )
            )}
          </div>
        )}

        <div className="practice-navrow">
          <button type="button" onClick={toggleHint} disabled={status !== "userTurn"} aria-pressed={hintOn}>
            💡 ヒント
          </button>
          <button type="button" onClick={retry} disabled={!wrongAttempt}>
            もう一度
          </button>
          <button type="button" className="primary" onClick={restart}>
            ⟲ 最初からやり直す
          </button>
        </div>
      </div>
    </div>
  );
}
