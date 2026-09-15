import { useEffect, useState } from "react";
import { usePointsStore } from "../store/pointsStore";
import "./PointsBadge.css";

/**
 * 累計ポイントの小さなバッジ。正解して点が入ると「+10」が上に浮かんで消える。
 * 派手にはしない(アプリ全体の落ち着いた調子に合わせる)。
 */
export function PointsBadge() {
  const total = usePointsStore((s) => s.total);
  const lastGain = usePointsStore((s) => s.lastGain);
  const clearGain = usePointsStore((s) => s.clearGain);
  const [pop, setPop] = useState<{ amount: number; key: number } | null>(null);

  useEffect(() => {
    if (!lastGain) return;
    setPop({ amount: lastGain.amount, key: lastGain.at });
    const t = setTimeout(() => {
      setPop(null);
      clearGain();
    }, 1100);
    return () => clearTimeout(t);
  }, [lastGain, clearGain]);

  return (
    <span className="points-badge" aria-label={`累計 ${total} ポイント`}>
      <span className="points-star">★</span>
      {total.toLocaleString()}
      {pop && (
        <span key={pop.key} className="points-pop" aria-hidden="true">
          +{pop.amount}
        </span>
      )}
    </span>
  );
}
