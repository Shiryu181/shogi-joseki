import { useState } from "react";
import { useSettingsStore } from "../../store/settingsStore";
import type { Theme } from "../../store/settingsStore";
import { useProgressStore } from "../../store/progressStore";
import { usePointsStore } from "../../store/pointsStore";
import "./Settings.css";

export interface SettingsProps {
  onBack: () => void;
}

const THEMES: { value: Theme; label: string; note: string }[] = [
  { value: "auto", label: "端末に合わせる", note: "OS の設定に従います" },
  { value: "light", label: "明るい", note: "" },
  { value: "dark", label: "暗い", note: "" },
];

/** 設定。いまはテーマと記録のリセットだけ。 */
export function Settings({ onBack }: SettingsProps) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const items = useProgressStore((s) => s.items);
  const days = useProgressStore((s) => s.days);
  const resetProgress = useProgressStore((s) => s.reset);
  const total = usePointsStore((s) => s.total);
  // 消す操作は取り消せないので、必ず一度確認を挟む。
  const [confirming, setConfirming] = useState(false);

  const learned = Object.values(items).filter((i) => i.streak >= 2).length;

  return (
    <div className="set-wrap">
      <header className="set-head">
        <button type="button" className="back" onClick={onBack}>◀ 戻る</button>
        <span className="set-title">設定</span>
      </header>

      <div className="set-pad">
        <div className="set-sec">見た目</div>
        <div className="set-card">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`set-row${theme === t.value ? " on" : ""}`}
              onClick={() => setTheme(t.value)}
            >
              <span className="set-row-l">
                {t.label}
                {t.note && <small>{t.note}</small>}
              </span>
              <span className="set-check">{theme === t.value ? "✓" : ""}</span>
            </button>
          ))}
        </div>

        <div className="set-sec">学習の記録</div>
        <div className="set-card">
          <div className="set-stat">
            <div><b>{Object.keys(items).length}</b><span>解いた問題</span></div>
            <div><b>{learned}</b><span>覚えた問題</span></div>
            <div><b>{days.length}</b><span>学習した日</span></div>
            <div><b>{total}</b><span>累計ポイント</span></div>
          </div>
        </div>

        <div className="set-card set-danger">
          {!confirming ? (
            <>
              <p className="set-note">
                解いた記録・覚えた問題・学習した日をすべて消します。消すと元に戻せません。
              </p>
              <button type="button" className="set-del" onClick={() => setConfirming(true)}>
                学習の記録を消す
              </button>
            </>
          ) : (
            <>
              <p className="set-note">
                本当に消しますか。{Object.keys(items).length}問の記録と{days.length}日分の学習履歴が無くなります。
              </p>
              <div className="set-confirm">
                <button type="button" onClick={() => setConfirming(false)}>やめる</button>
                <button
                  type="button"
                  className="set-del"
                  onClick={() => { resetProgress(); setConfirming(false); }}
                >
                  消す
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
