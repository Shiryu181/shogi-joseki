import { useMemo } from "react";
import { useProgressStore, itemKey, LEARNED_STREAK } from "../../store/progressStore";
import { quizItemsOf } from "../../domain/reviewQueue";
import { useExamStore } from "../../store/examStore";
import type { PathChapter } from "../../domain/josekiLoader";
import "./Dashboard.css";

export interface DashboardProps {
  /** 学習中の戦法の章。学習画面と同じ並び順(学習パス)を渡す。 */
  chapters: PathChapter[];
  strategyName: string;
  sideLabel: string;
  /** 「続きから」。まだ覚えきっていない最初の章へ進む。 */
  onContinue: (chapterIndex: number) => void;
  onReview: () => void;
  onPickStrategy: () => void;
  onExam: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

/** 月曜始まりで直近7日を出す。配列の末尾が今日。 */
function weekDays(): Date[] {
  const out: Date[] = [];
  const today = new Date();
  // 月曜を週の始まりにするため、今日が週の何日目かを求める(月=0 … 日=6)。
  const offset = (today.getDay() + 6) % 7;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset + i);
    out.push(d);
  }
  return out;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * ホーム。毎日ここから始める画面。
 * 並びは「タイトル → カレンダー → 学習中 → 今日の復習 → 3つのボタン」。
 * 色面は木目の帯(カレンダー)だけに絞り、赤は学習した日の朱印にだけ使う。
 */
export function Dashboard({
  chapters, strategyName, sideLabel,
  onContinue, onReview, onPickStrategy, onExam, onSettings, onAbout,
}: DashboardProps) {
  const items = useProgressStore((s) => s.items);
  // 合格した章の数。認定試験のボタンに出す。
  const examPassed = useExamStore((s) => Object.values(s.results).filter((r) => r.passed).length);
  const days = useProgressStore((s) => s.days);
  const streak = useProgressStore((s) => s.streak());

  const stats = useMemo(() => {
    const per = chapters.map(({ entry, course }) => {
      const qs = quizItemsOf(course);
      const learned = qs.filter((q) => (items[itemKey(q.sfen, q.usi)]?.streak ?? 0) >= LEARNED_STREAK).length;
      return { entry, total: qs.length, learned, items: qs };
    });
    const total = per.reduce((a, b) => a + b.total, 0);
    const learned = per.reduce((a, b) => a + b.learned, 0);
    const doneChapters = per.filter((p) => p.total > 0 && p.learned === p.total).length;

    // 今日の復習: 期日が来ている問題(重複する局面は1問として数える)。
    const seen = new Set<string>();
    let due = 0, dueSharp = 0;
    for (const p of per) {
      for (const q of p.items) {
        const k = itemKey(q.sfen, q.usi);
        if (seen.has(k)) continue;
        seen.add(k);
        const rec = items[k];
        if (!rec || rec.due <= ymd(new Date())) { due++; if (q.sharp) dueSharp++; }
      }
    }
    // 続きから: まだ覚えきっていない最初の章。
    const nextIndex = Math.max(0, per.findIndex((p) => p.learned < p.total));
    return { per, total, learned, doneChapters, due, dueSharp, nextIndex };
  }, [chapters, items]);

  const week = weekDays();
  const studied = new Set(days);
  const todayKey = ymd(new Date());
  const ratio = stats.total === 0 ? 0 : Math.round((stats.learned / stats.total) * 100);
  const nextChapter = stats.per[stats.nextIndex]?.entry;

  return (
    <div className="dash-wrap">
      <div className="dash-frame">
        <div className="dash-hero">
          <div className="dash-brand">定跡道場</div>

          <div className="dash-cal">
            {week.map((d) => {
              const key = ymd(d);
              const isToday = key === todayKey;
              return (
                <div className="dash-day" key={key}>
                  <div className="dash-dow">{DOW[d.getDay()]}</div>
                  <div className={`dash-cell${isToday ? " today" : ""}`}>
                    <span className="dash-d">{d.getDate()}</span>
                    {/* 学習した日の朱印。画面で赤を使うのはここだけ。 */}
                    {studied.has(key) && <span className="dash-stamp"><b>定跡</b></span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dash-calfoot">
            <div className="dash-streak"><b>{streak}</b><span>日連続</span></div>
            <div className="dash-calnote">
              {studied.has(todayKey) ? "今日は学習済みです" : "今日はまだ学習していません"}
            </div>
          </div>
        </div>

        <div className="dash-pad">
          <div className="dash-sec">学習中</div>
          <div className="dash-card">
            <div className="dash-sthead">
              <div className="dash-stname">{strategyName}</div>
              <div className="dash-stside">{sideLabel}</div>
              <div className="dash-stn">{stats.learned} / {stats.total} 問</div>
            </div>
            <div className="dash-bar"><i style={{ width: `${ratio}%` }} /></div>
            <p className="dash-stsub">
              {chapters.length}章中{stats.doneChapters}章を達成 ・ 覚えた問題が {ratio}%
            </p>
            <button type="button" className="dash-btn" onClick={() => onContinue(stats.nextIndex)}>
              続きから{nextChapter ? `(第${stats.nextIndex + 1}章 ${nextChapter.label})` : ""}
            </button>
          </div>

          <div className="dash-sec">今日の復習</div>
          <div className="dash-card">
            <div className="dash-rv">
              <div className="dash-rvn">{stats.due}<span> 問</span></div>
              <div className="dash-rvt">
                <b>今日の復習</b>
                {stats.due === 0 ? "期日が来た手はありません" : `うち急所 ${stats.dueSharp}問`}
              </div>
              <button
                type="button"
                className="dash-btn main dash-rvbtn"
                onClick={onReview}
                disabled={stats.due === 0}
              >
                はじめる
              </button>
            </div>
          </div>

          <div className="dash-tri">
            <button type="button" onClick={onPickStrategy}>
              <svg viewBox="0 0 24 24"><path d="M12 3l3 3.5-1 13.5H10L9 6.5z" /><path d="M4 20h16" /></svg>
              <span className="l">学習する<br />戦法を選ぶ</span>
            </button>
            <button type="button" onClick={onExam}>
              <svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z" /><path d="M9 9h6" /></svg>
              <span className="l">認定試験</span>
              <span className="s">{examPassed > 0 ? `${examPassed}章 合格` : "章ごとに受験"}</span>
            </button>
            <button type="button" onClick={onSettings}>
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
              </svg>
              <span className="l">設定</span>
              <span className="s">見た目・記録</span>
            </button>
          </div>

          <button type="button" className="dash-foot" onClick={onAbout}>
            このアプリについて・ライセンス
          </button>
        </div>
      </div>
    </div>
  );
}
