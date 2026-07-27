import { useState } from "react";
import { Sandbox } from "./features/sandbox/Sandbox";
import { Learn } from "./features/learn/Learn";

/**
 * Phase 0/1 検証用の最小切り替え。DESIGN.md §5 のホーム/タブ導線は未実装(後続フェーズ)。
 */
function App() {
  const [screen, setScreen] = useState<"sandbox" | "learn">("learn");

  return (
    <div>
      <div
        style={{
          position: "fixed",
          top: 8,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          gap: 6,
          background: "rgba(0,0,0,0.55)",
          padding: 4,
          borderRadius: 20,
        }}
      >
        <button
          type="button"
          onClick={() => setScreen("learn")}
          style={{
            padding: "4px 12px",
            borderRadius: 16,
            border: "none",
            cursor: "pointer",
            background: screen === "learn" ? "#fff" : "transparent",
            color: screen === "learn" ? "#241a0d" : "#fff",
            fontSize: 12,
          }}
        >
          学習(なぞり)
        </button>
        <button
          type="button"
          onClick={() => setScreen("sandbox")}
          style={{
            padding: "4px 12px",
            borderRadius: 16,
            border: "none",
            cursor: "pointer",
            background: screen === "sandbox" ? "#fff" : "transparent",
            color: screen === "sandbox" ? "#241a0d" : "#fff",
            fontSize: 12,
          }}
        >
          Sandbox
        </button>
      </div>
      {screen === "learn" ? <Learn /> : <Sandbox />}
    </div>
  );
}

export default App;
