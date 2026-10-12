# UI 監査サマリー
390x844 @2x / ライト・ダーク / 38状態 / 実行 243s。詳細は metrics.json、文言は strings.json。
基準: 文字コントラスト(出現途中の半透明文字は除外) 4.5 未満(大きい文字は 3 未満)、タップ領域 44px 未満、隣り合う操作の間隔 8px 未満、300ms 超のアニメーション。
盤の升(81個)と持ち駒は「盤」として1行にまとめて数える。

## 状態ごとの指摘(指摘のあるものだけ)
- **04 about** L: 小さい操作7(戻る/ライセンス全文(GP/ソースコード(Git) | D: 小さい操作7(戻る/ライセンス全文(GP/ソースコード(Git)
- **05 settings-fresh** L: 小さい操作1(◀ 戻る) 間隔<8px:2 | D: 小さい操作1(◀ 戻る) 間隔<8px:2
- **06 strategy** L: 間隔<8px:8 | D: 間隔<8px:8
- **07 strategy-sheet** L: 間隔<8px:10 | D: 間隔<8px:10
- **14 learn-trymove** L: 間隔<8px:7 | D: 間隔<8px:7
- **37 settings** L: 小さい操作1(◀ 戻る) 間隔<8px:2 | D: 小さい操作1(◀ 戻る) 間隔<8px:2
- **38 settings-confirm** L: 小さい操作1(◀ 戻る) 間隔<8px:2 | D: 小さい操作1(◀ 戻る) 間隔<8px:2
- 指摘なし: home-first, home-due, home-nodue, chapter, chapter-exam, learn-opponent-auto, learn-your-turn, learn-wrong-1, learn-wrong-2, learn-accepted, learn-correct, learn-correct-expanded, learn-demo, learn-deviation, learn-chapter-complete, learn-sente-first-question, learn-chapter-intro, learn-all-done, home-alldone, review-question, review-hint, review-wrong-1, review-wrong-2, review-accepted, review-correct, review-end, exam-list, exam-question, exam-result-pass, exam-list-after, exam-result-fail

## 色の一覧(状態をまたいだ使用要素数。上位)
- light: 文字色11種 / 背景色13種 / 罫線色11種
  - text: #2a1f14×868 #2b2013×831 #f6ecd2×166 #54452f×156 #25593f×20 #a8281c×16 #6b4f14×8 #3f2c1e×7 #8f1f15×5 #22385a×1
  - bg: #cba85e×836 #f3deaa×836 #efe3c6×111 #3f2c1e×107 #f8f0da×30 #cdbf94×29 #a8281c38×25 #e7c787×21 #22385a×19 #e6d6ad×12
  - border: #000000×3402 #7a5428×3028 #cbb987×452 #f6ecd2×136 #3f2c1e×112 #5a3d1d×84 #cdbf94×62 #a8833a×35 #a8281c×8 #6b4f14×4
- dark: 文字色9種 / 背景色13種 / 罫線色8種
  - text: #efe6d3×1014 #241a0d×831 #bcb09a×154 #f6ecd2×20 #6fbf95×20 #caa55e×16 #eb8a7c×16 #8f1f15×5 #efe6d373×1
  - bg: #8a6c38×836 #d9bc80×836 #2e271d×111 #1e150d×79 #3a3226×42 #4a4030×29 #bcb09a×28 #a8281c38×25 #c9a461×21 #34588f×19
  - border: #000000×3402 #4a3216×3028 #4a4030×514 #efe6d3×136 #8a7e66×112 #8a6c38×84 #caa55e×43 #eb8a7c×8

## 字の大きさ(px×テキスト数、全状態の合計)
- 10.5×20 11×3 11.5×6 12×379 12.5×13 13×130 13.5×4 14×150 14.5×1 15×243 16×86 17×30 18×91 19×13 20×39 20.55×820 22×40 30×1 32×4 40×3 48×3
- 太さ: 400×778 500×96 600×922 700×281 900×2

## 低コントラストの組み合わせ(文字色/背景色/サイズ。多い順)
- light: 0組 / 計0件
- dark: 0組 / 計0件

## 小さいタップ領域(<44px。ラベル別、全状態で1つにまとめる)
- 8種
  - 「盤:board-cell」38.8x38.8 button.cell 枠/面あり (21状態)
  - 「◀ 戻る」47.3x32 button.back **枠も面も無い** (3状態)
  - 「戻る」34x34 button.back 枠/面あり (1状態)
  - 「ライセンス全文(GPL-3.0)」142.8x13 a **枠も面も無い** (1状態)
  - 「ソースコード(GitHub)」125.4x13 a **枠も面も無い** (1状態)
  - 「ソースコード(WebAssembly」186.9x13 a **枠も面も無い** (1状態)
  - 「ソースコード(本体)」107.5x13 a **枠も面も無い** (1状態)
  - 「ライセンス全文」86.3x13 a **枠も面も無い** (1状態)

## 先頭ゼロの数字・数字の書き方
- 先頭ゼロの数字: なし
- 書き方(#=数字、前後1〜2字つき): #×233  1#×15  △#四歩×11  ▲#四歩×10   #×9  ▲#六歩×7   # /×7  6#×6   #手目×6  と#問×6   #章 ×4   #章×4  は#筋か×4   #/1×4  △#二香×4  △#五歩×4  ▲#一飛×4  3#×3  △#二金×3  △#八角×3   #/3×2  2#×2

## 300ms を超えるアニメーション・トランジション
- なし

## 撮れなかった状態
- なし
