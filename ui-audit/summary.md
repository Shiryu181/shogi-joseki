# UI 監査サマリー
390x844 @2x / ライト・ダーク / 41状態 / 実行 252s。詳細は metrics.json、文言は strings.json。
基準: 文字コントラスト(出現途中の半透明文字は除外) 4.5 未満(大きい文字は 3 未満)、タップ領域 44px 未満、隣り合う操作の間隔 8px 未満、300ms 超のアニメーション。
盤の升(81個)と持ち駒は「盤」として1行にまとめて数える。

## 状態ごとの指摘(指摘のあるものだけ)
- **04 about** L: 間隔<8px:3 | D: 間隔<8px:3
- **05 settings-fresh** L: 間隔<8px:2 | D: 間隔<8px:2
- **06 strategy** L: 間隔<8px:8 | D: 間隔<8px:8
- **07 strategy-sheet** L: 間隔<8px:10 | D: 間隔<8px:10
- **14 learn-trymove** L: 間隔<8px:7 | D: 間隔<8px:7
- **34 exam-result-pass** L: 間隔<8px:5 | D: 間隔<8px:5
- **37 exam-result-fail** L: 間隔<8px:9 | D: 間隔<8px:9
- **40 settings** L: 間隔<8px:2 | D: 間隔<8px:2
- **41 settings-confirm** L: 間隔<8px:2 | D: 間隔<8px:2
- 指摘なし: home-first, home-due, home-nodue, chapter, chapter-exam, learn-opponent-auto, learn-your-turn, learn-wrong-1, learn-wrong-2, learn-accepted, learn-correct, learn-correct-expanded, learn-demo, learn-deviation, learn-chapter-complete, learn-sente-first-question, learn-chapter-intro, learn-all-done, home-alldone, review-question, review-hint, review-wrong-1, review-wrong-2, review-accepted, review-correct, review-end, exam-list, exam-question, exam-review-correct, exam-list-after, exam-review-wrong, exam-review-skipped

## 用語チェック(禁止語・算用数字の章番号)
- 違反なし

## 色の一覧(状態をまたいだ使用要素数。上位)
- light: 文字色10種 / 背景色12種 / 罫線色10種
  - text: #2b2013×951 #2a1f14×947 #f6ecd2×203 #54452f×159 #25593f×21 #a8281c×18 #8f1f15×5 #3f2c1e×4 #22385a×4 #2a1f1473×1
  - bg: #cba85e×956 #f3deaa×956 #3f2c1e×123 #efe3c6×110 #f8f0da×43 #cdbf94×29 #a8281c38×25 #e7c787×24 #22385a×22 #e6d6ad×15
  - border: #000000×3888 #7a5428×3463 #cbb987×444 #f6ecd2×164 #3f2c1e×152 #5a3d1d×96 #cdbf94×73 #a8833a×42 #a8281c×16 #22385a×4
- dark: 文字色10種 / 背景色12種 / 罫線色8種
  - text: #efe6d3×1128 #241a0d×951 #bcb09a×159 #f6ecd2×23 #6fbf95×21 #eb8a7c×18 #caa55e×8 #8f1f15×5 #efe6d373×1 #1e150d×1
  - bg: #8a6c38×956 #d9bc80×956 #2e271d×110 #1e150d×95 #3a3226×58 #4a4030×29 #bcb09a×28 #a8281c38×25 #c9a461×24 #34588f×22
  - border: #000000×3888 #4a3216×3463 #4a4030×517 #efe6d3×164 #8a7e66×152 #8a6c38×96 #caa55e×46 #eb8a7c×16

## 字の大きさ(px×テキスト数、全状態の合計)
- 10.5×4 12×432 12.5×1 13×132 14×163 14.5×1 15×301 16×86 17×33 18×96 19×13 20×31 20.55×938 22×63 32×4 40×12 48×3
- 太さ: 400×841 500×123 600×1027 700×317 900×5

## 低コントラストの組み合わせ(文字色/背景色/サイズ。多い順)
- light: 0組 / 計0件
- dark: 0組 / 計0件

## 小さいタップ領域(<44px。ラベル別、全状態で1つにまとめる)
- 1種
  - 「盤:board-cell」38.8x38.8 button.cell 枠/面あり (24状態)

## 先頭ゼロの数字・数字の書き方
- 先頭ゼロの数字: なし
- 書き方(#=数字、前後1〜2字つき): #×260  △#四歩×14  1#×13  ▲#四歩×11   #×11   # /×7  6#×6   #手目×6  △#二香×6  と#問×6  ▲#六歩×5   #章 ×4   #章×4  は#筋か×4   #/1×4  △#二金×4  ▲#一飛×4  # /×4  3#×3  △#八角×3  △#二飛×3  △#二玉×3

## 300ms を超えるアニメーション・トランジション
- なし

## 撮れなかった状態
- なし
