# 測り直し A の結果(2026-11-09)

新エンジン(つようら王11mini)で、A の範囲 574 局面を測った結果。1段目 500万ノード(574局面)、境目の 96 局面は 2段目 4000万ノードの値で判定。章のデータは変えていない(まとめだけ)。再生成は `node scripts/remeasure-A-summary.mjs`。

## 結論

- **直しが要る項目: 局面+手で 66 か所(章×手で数えると 92)。** 同じ局面は章をまたいで1行にまとめて表にした。
- **咎めの枝**: 損が 300 未満に落ちた = **4** か所(消す候補)。300 以上のまま 53。枝の中の自分の手が 100 超 = **3**。
- **「唯一」**: 次善との差が 100 未満 = **9**(「唯一」を外す候補)、書いた手が最善でなくなった = **4**。100 以上のまま 25。逆に、唯一と書いていないが差 100 以上 = 94(参考)。「唯一ではありません」と書いた 15 か所のうち、実は差 100 以上 = 3。
- **変化の枝**: 枝の中の自分の手 100 超 = **9**、相手の手 100 超 = **10**、入口(相手の別の手)100 超 = **15**。
- **境目の本線の手**(旧で差 60〜140 だった 60 か所): 100 超 = **16**(学ぶ側 7・相手 12。同じ局面でも章によって学ぶ側と相手が分かれるので合計は一致しない)。
  - 多くの章に共通する入口の手が影響の大半: △５四歩(2手目、新の差 161、新の最善 △８四歩、10章)、▲７五歩(3手目、新の差 213、新の最善 ▲７八金、10章)。この 2 か所だけで章×手 20 件。
- **文の数字**: 旧エンジンの数字(d16〜d22 の差・損・評価値)を書いた文は 807 文(42 章の 3230 文中)。うち**書き直しが要る文 = 110**(判定が変わった手の文 54、新の測定と数字がずれる文 69、重なりは除く)。残りは新しい測定が無く、旧の数字のまま。

### 直しの量の見込み(推測)
- 枝を消す・付け替える 19 か所(咎め 4・変化の入口 15)、手の差し替え 38 か所(枝の中 22、境目の本線 16)、「唯一」の言い直し 13 か所、数字の書き直し 110 文。
- 所要の目安(推測): 枝を消す・付け替える 1か所 約22分、手の差し替え(枝の中) 約40分、境目の本線の差し替え 約45分(以降の作り直しと再測定を含む)、「唯一」の言い直し 約5分、数字の書き直し 1文 約4分で見ると、枝の削除 約7時間・枝の中の差し替え 約15時間・本線 約12時間・唯一 約1時間・数字 約7時間、**合計 約42時間**。重複する直し(同じ文を数字と唯一で2回)があるので、実際はこれより少なめ。
- **本線に手を入れる 16 か所のうち、共通の入口 2 か所(石田流 ▲7五歩・中飛車後手の △5四歩など)は章の骨格に関わる**。ここを先に決めないと、文の数字を直しても二度手間になる。残りの本線の手は章ごとに差し替えるか、100 超のまま『ミスではない』として扱うかを決める。
- 大きく変わる章(直しの件数の多い順): sankenbisha-ishida--deashi(7)、sankenbisha-ishida--bokin(6)、sankenbisha-ishida--aifuri-shiken(6)、nakabisha-vs-anaguma--7suji(5)、nakabisha-vs-ibisha--gokigen24(5)、nakabisha-vs-hidarimino--gote(4)、nakabisha-vs-chousoku--gote(4)、nakabisha-vs-sankenbisha--aifuri(4)。

凡例: 数字は新エンジンの損(最善との差)または差。`*` は 2段目(4000万ノード)の値。「旧」は scripts/lab-out の旧エンジン記録(深さ違いは範囲)。無いときは `-`(旧の記録が lab-out に無い局面)。

## 章ごとの件数

章×手での数え方(共通の局面は各章に数える)。

| 章 | 咎め消 | 咎め残 | 咎め枝自100超 | 唯一外す | 唯一非最善 | 変化100超 | 境目100超 | 要直し文 |
|---|---|---|---|---|---|---|---|---|
| nakabisha-vs-anaguma--7suji | 1 | 0 | 0 | 0 | 0 | 0 | 4 | 2 |
| nakabisha-vs-hidarimino--gote | 0 | 2 | 0 | 1 | 0 | 1 | 2 | 4 |
| nakabisha-vs-ibisha--gokigen24 | 1 | 7 | 2 | 0 | 0 | 0 | 2 | 1 |
| nakabisha-vs-chousoku--gote | 0 | 3 | 0 | 0 | 0 | 0 | 4 | 0 |
| nakabisha-vs-sankenbisha--aifuri | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 1 |
| nakabisha-vs-chousoku--sente | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| nakabisha-vs-sankenbisha--sente | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| nakabisha-vs-anaguma--sente | 0 | 2 | 0 | 0 | 0 | 0 | 2 | 0 |
| nakabisha-vs-hidarimino--sente | 0 | 2 | 0 | 1 | 0 | 0 | 1 | 3 |
| nakabisha--shote-sente | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| nakabisha-vs-5yonfu--horyu | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 2 |
| nakabisha-vs-5yonfu--kakukoukan | 0 | 2 | 0 | 1 | 0 | 2 | 0 | 6 |
| nakabisha-vs-ibisha--jikyusen | 0 | 1 | 0 | 1 | 0 | 2 | 0 | 5 |
| nakabisha-vs-8yonfu--kakukoukan | 0 | 2 | 0 | 0 | 1 | 0 | 0 | 9 |
| nakabisha--shote | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| nakabisha-vs-ufogin--gote | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| nakabisha-vs-chokyusen--kaihi | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| nakabisha-vs-maruyama--gote | 0 | 2 | 0 | 0 | 0 | 0 | 1 | 6 |
| nakabisha-vs-chousoku-kakukoukan--gote | 0 | 2 | 0 | 0 | 0 | 2 | 1 | 10 |
| nakabisha-vs-ureshino--gote | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| nakabisha-vs-onigoroshi--gote | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| sankenbisha-ishida--deashi | 0 | 0 | 0 | 0 | 0 | 6 | 1 | 4 |
| sankenbisha-ishida--kakugawari | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| sankenbisha-ishida--honkumi | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 2 |
| sankenbisha-ishida--migishiken | 0 | 2 | 0 | 0 | 0 | 1 | 1 | 1 |
| sankenbisha-ishida--hidarimino | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 |
| sankenbisha-ishida--anaguma | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| sankenbisha-ishida--aifuri | 0 | 1 | 0 | 0 | 0 | 0 | 2 | 2 |
| sankenbisha-ishida--sugairyu | 0 | 2 | 0 | 1 | 1 | 1 | 1 | 4 |
| sankenbisha-ishida--bokin | 0 | 2 | 0 | 1 | 2 | 2 | 1 | 8 |
| sankenbisha-ishida--aifuri-shiken | 0 | 2 | 0 | 3 | 0 | 2 | 1 | 13 |
| sankenbisha-gote--deashi | 0 | 1 | 0 | 0 | 0 | 4 | 0 | 3 |
| sankenbisha-gote--minokansei | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| sankenbisha-gote--bogin | 0 | 2 | 0 | 0 | 0 | 1 | 1 | 3 |
| sankenbisha-gote--hayashikake | 0 | 2 | 0 | 0 | 0 | 1 | 0 | 4 |
| sankenbisha-gote--anaguma | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 |
| sankenbisha-gote--hidarimino | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 2 |
| sankenbisha-gote--aifuri-mukai | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| sankenbisha-gote--aifuri-naka | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| sankenbisha-gote--aisanken | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 2 |
| sankenbisha-gote--migishiken | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 2 |
| sankenbisha-gote--nanamebogin | 0 | 1 | 0 | 1 | 0 | 2 | 0 | 3 |

合計(章×手): 咎め消 4 / 咎め残 53 / 咎め枝自 3 / 唯一外 10 / 唯一非最善 4 / 変化 34 / 境目 37 / 要直し文 110

## 1. 咎めの枝

咎めの外れる手 57 局面(章×手 57)の損。基準は相手の損 300 以上。

### 1-a. 損が 300 未満になった(消える候補) 4

| 章 | 外れる手 | 旧の損 | 新の損 | 新の最善 | どう直すか |
|---|---|---|---|---|---|
| nakabisha-vs-anaguma--7suji 23手目 | ▲６八角 | 269 | 261*(1段目296) | ▲６六歩 | 消す、または文を「損◯◯の小さな悪手」に言い直して変化の枝へ |
| nakabisha-vs-ibisha--gokigen24 13手目 | ▲２一飛成 | - | 186 | ▲２八飛 | 消す、または文を「損◯◯の小さな悪手」に言い直して変化の枝へ |
| nakabisha-vs-sankenbisha--aifuri 17手目 | ▲５八玉 | - | 213 | ▲６五歩 | 消す、または文を「損◯◯の小さな悪手」に言い直して変化の枝へ |
| sankenbisha-gote--aifuri-mukai 29手目 | ▲６四歩 | - | 290*(1段目318) | ▲８六飛 | 消す、または文を「損◯◯の小さな悪手」に言い直して変化の枝へ |

### 1-b. 300 以上のまま残る 53

最小は 403。300〜399 は 0、400〜599 は 18、600 以上 35。薄い順に 8 か所:

| 章 | 外れる手 | 旧の損 | 新の損 |
|---|---|---|---|
| sankenbisha-ishida--sugairyu 22手目 | △７四歩 | - | 403 |
| nakabisha-vs-chousoku--gote 37手目 | ▲５六歩 | - | 413 |
| sankenbisha-gote--aisanken 15手目 | ▲４六歩 | - | 413 |
| sankenbisha-gote--aifuri-naka 31手目 | ▲１七桂 | - | 425 |
| nakabisha-vs-ibisha--gokigen24 35手目 | ▲６三銀成 | 267 | 455 |
| sankenbisha-gote--hidarimino 31手目 | ▲３五歩 | - | 462 |
| sankenbisha-ishida--bokin 28手目 | △６五歩 | - | 472 |
| sankenbisha-gote--bogin 33手目 | ▲３七飛 | 302 | 479 |

### 1-c. 咎めの枝の中の自分の手が最善との差 100 超 3

| 章 | 自分の手 | 旧の差 | 新の差 | 新の最善 | どう直すか |
|---|---|---|---|---|---|
| nakabisha-vs-ibisha--gokigen24 30手目 | △３五桂 | - | 383 | △２六桂 | 差し替え(新の最善 △２六桂)、または枝ごと消す |
| nakabisha-vs-ibisha--gokigen24 38手目 | △７六龍 | - | 184 | △８九飛 | 差し替え(新の最善 △８九飛)、または枝ごと消す |
| nakabisha-vs-ureshino--gote 28手目 | △５六飛 | - | 327 | △８八飛成 | 差し替え(新の最善 △８八飛成)、または枝ごと消す |

参考: 咎めの枝の中の相手の手が 100 超 9 か所(咎めの枝の相手の手は、咎めを受けて指す手なので基準の対象外。件数のみ)。

## 2. 「唯一」

「唯一」と書いた手 38 か所(章×手 42)を測った。

### 2-a. 次善との差が 100 未満(「唯一」を外す候補) 9

| 章 | 手 | 種類 | 旧(文の次善との差) | 新の次善との差 | 次善 | どう直すか |
|---|---|---|---|---|---|---|
| nakabisha-vs-5yonfu--kakukoukan 11手目 | ▲７五角 | 唯一 | - | 59* | ▲７五歩 | 文から「唯一」を外し、「次善との差◯◯」に言い直す |
| nakabisha-vs-hidarimino--gote 32手目 | △７五銀 | 唯一 | 71・108・154 | 73* | △９二香 | 文から「唯一」を外し、「次善との差◯◯」に言い直す |
| nakabisha-vs-hidarimino--sente 29手目 | ▲８六歩 | 唯一 | 146・119・223 | 59 | ▲３五歩 | 文から「唯一」を外し、「次善との差◯◯」に言い直す |
| nakabisha-vs-ibisha--jikyusen 33手目 | ▲４七銀上 | 唯一 | - | 1 | ▲４八飛 | 文から「唯一」を外し、「次善との差◯◯」に言い直す |
| sankenbisha-gote--nanamebogin 32手目 | △３二飛 | 唯一(節のコメント) | - | 35 | △３一飛 | 文から「唯一」を外し、「次善との差◯◯」に言い直す |
| sankenbisha-ishida--aifuri-shiken 15手目 ほか1章 | ▲７四歩 | 唯一(咎めの返し)/唯一 | - | 15 | ▲５五角 | 文から「唯一」を外し、「次善との差◯◯」に言い直す |
| sankenbisha-ishida--aifuri-shiken 17手目 | ▲７四飛 | 唯一(節のコメント) | 84・88 | 90* | ▲５五角 | 文から「唯一」を外し、「次善との差◯◯」に言い直す |
| sankenbisha-ishida--bokin 17手目 | ▲６五歩 | 唯一 | - | 2 | ▲７七桂 | 文から「唯一」を外し、「次善との差◯◯」に言い直す |
| sankenbisha-ishida--sugairyu 11手目 | ▲６六飛 | 唯一(咎めの返し) | - | 4 | ▲５八玉 | 文から「唯一」を外し、「次善との差◯◯」に言い直す |

### 2-b. 唯一と書いた手が最善でなくなった 4

| 章 | 手 | 種類 | 新の差 | 新の最善 | どう直すか |
|---|---|---|---|---|---|
| nakabisha-vs-8yonfu--kakukoukan 7手目 | ▲８八銀 | 唯一 | 43 | ▲８八飛 | 文から「唯一」を外し、新の最善との並びに言い直す(差は100以内) |
| sankenbisha-ishida--bokin 17手目 | ▲１六歩 | 唯一(節のコメント) | 7 | ▲７七角 | 文から「唯一」を外し、新の最善との並びに言い直す(差は100以内) |
| sankenbisha-ishida--bokin 29手目 | ▲７七桂 | 唯一(節のコメント) | 55* | ▲４六歩 | 文から「唯一」を外し、新の最善との並びに言い直す(差は100以内) |
| sankenbisha-ishida--sugairyu 11手目 | ▲７七桂 | 唯一(節のコメント) | 20 | ▲１六歩 | 文から「唯一」を外し、新の最善との並びに言い直す(差は100以内) |

### 2-c. 差 100 以上のまま 25(変更なし)

### 2-d. 参考: 「唯一ではありません」と書いたが次善との差が 100 以上 3

| 章 | 手 | 新の次善との差 |
|---|---|---|
| nakabisha-vs-chousoku-kakukoukan--gote 30手目 | △２一飛 | 130* |
| nakabisha-vs-hidarimino--sente 24手目 | △２三銀 | 114* |
| nakabisha-vs-hidarimino--sente 29手目 | ▲３五銀 | 108* |

### 2-e. 参考: 「唯一」と書いていないが次善との差 100 以上 94

測ったのは境目・枝の局面に限るので、これで全部ではない。咎めの枝の中は 74 か所(咎めを受けた後の決まった返しで、差が大きいのは自然。書き足しは任意)。それ以外 20 か所を載せる(本線・変化の枝)。

| 章 | 手 | 種類 | 次善との差 |
|---|---|---|---|
| nakabisha-vs-5yonfu--kakukoukan 8手目 | △２二銀 | 変化の枝の中の相手の手 | 200 |
| nakabisha-vs-5yonfu--kakukoukan 9手目 | ▲５三角 | 変化の枝の中の自分の手 | 148 |
| nakabisha-vs-5yonfu--kakukoukan 12手目 | △４四角 | 変化の枝の中の相手の手 | 351 |
| nakabisha-vs-5yonfu--kakukoukan 12手目 | △５三玉 | 変化の枝の中の相手の手 | 1528 |
| nakabisha-vs-5yonfu--kakukoukan 14手目 | △４四歩 | 変化の枝の中の相手の手 | 125 |
| nakabisha-vs-5yonfu--kakukoukan 16手目 | △５五歩 | 変化の枝の中の相手の手 | 286 |
| nakabisha-vs-hidarimino--sente 27手目 | ▲４五銀 | 変化の枝の中の自分の手 | 210 |
| sankenbisha-gote--aisanken 15手目 | ▲７四飛 | 変化の枝の中の相手の手 | 199 |
| sankenbisha-gote--aisanken 18手目 | △７三歩 | 変化の枝の中の自分の手 | 130 |
| sankenbisha-gote--deashi 6手目 | △３三角 | 変化の枝の中の自分の手 | 183 |
| sankenbisha-gote--hayashikake 24手目 | △２二飛 | 変化の枝の中の自分の手 | 123 |
| sankenbisha-gote--hidarimino 34手目 | △４四銀 | 変化の枝の中の自分の手 | 355 |
| sankenbisha-gote--hidarimino 34手目 | △２四歩 | 変化の枝の中の自分の手 | 261 |
| sankenbisha-gote--migishiken 32手目 | △４二飛 | 変化の枝の中の自分の手 | 193 |
| sankenbisha-ishida--aifuri-shiken 12手目 | △７四歩 | 変化の枝の中の相手の手 | 217 |
| sankenbisha-ishida--honkumi 23手目 | ▲６五歩 | 変化の枝の中の自分の手 | 160 |
| sankenbisha-ishida--sugairyu 12手目 | △２七角成 | 変化の枝の中の相手の手 | 166 |
| sankenbisha-ishida--sugairyu 13手目 | ▲７四歩 | 変化の枝の中の自分の手 | 332 |
| sankenbisha-ishida--sugairyu 14手目 | △７四歩 | 変化の枝の中の相手の手 | 151 |
| sankenbisha-ishida--sugairyu 15手目 | ▲５五角 | 変化の枝の中の自分の手 | 314 |

## 3. 変化の枝

### 3-a. 枝の中の自分の手が 100 超 9

| 章 | 自分の手 | 旧の差 | 新の差 | 新の最善 | どう直すか |
|---|---|---|---|---|---|
| nakabisha-vs-5yonfu--kakukoukan 11手目 | ▲７五角成 | - | 125* | ▲８六角成 | 差し替え(新の最善 ▲８六角成)、または枝ごと消す |
| nakabisha-vs-chousoku-kakukoukan--gote 12手目 | △１四歩 | - | 182* | △３二金 | 差し替え(新の最善 △３二金)、または枝ごと消す |
| nakabisha-vs-ibisha--jikyusen 25手目 | ▲２八玉 | - | 142 | ▲７八飛 | 差し替え(新の最善 ▲７八飛)、または枝ごと消す |
| sankenbisha-gote--aifuri-mukai 12手目 | △９四歩 | - | 166 | △１四歩 | 差し替え(新の最善 △１四歩)、または枝ごと消す |
| sankenbisha-gote--deashi 4手目 | △４四歩 | 32 | 103* | △５四歩 | 差し替え(新の最善 △５四歩)、または枝ごと消す |
| sankenbisha-gote--deashi 4手目 | △４四歩 | 40〜54 | 117* | △８八角成 | 差し替え(新の最善 △８八角成)、または枝ごと消す |
| sankenbisha-gote--hidarimino 30手目 | △７三桂 | - | 232 | △２二飛 | 差し替え(新の最善 △２二飛)、または枝ごと消す |
| sankenbisha-gote--migishiken 28手目 | △７四歩 | - | 138* | △５三銀 | 差し替え(新の最善 △５三銀)、または枝ごと消す |
| sankenbisha-ishida--deashi 3手目 | ▲６六歩 | 48〜90 | 121* | ▲２六歩 | 差し替え(新の最善 ▲２六歩)、または枝ごと消す |

### 3-b. 枝の中の相手の手が 100 超 10

| 章 | 相手の手 | 旧の差 | 新の差 | 新の最善 | どう直すか |
|---|---|---|---|---|---|
| nakabisha-vs-hidarimino--gote 23手目 | ▲２六飛 | - | 105* | ▲６六歩 | 差し替え(新の最善 ▲６六歩)、またはミス側(咎めの枝)へ移す |
| nakabisha-vs-ibisha--jikyusen 24手目 | △３一玉 | - | 117* | △７五歩 | 差し替え(新の最善 △７五歩)、またはミス側(咎めの枝)へ移す |
| sankenbisha-gote--bogin 29手目 | ▲３八飛 | - | 121* | ▲４五歩 | 差し替え(新の最善 ▲４五歩)、またはミス側(咎めの枝)へ移す |
| sankenbisha-gote--hidarimino 31手目 | ▲３七桂 | - | 118* | ▲３五歩 | 差し替え(新の最善 ▲３五歩)、またはミス側(咎めの枝)へ移す |
| sankenbisha-gote--migishiken 27手目 | ▲８六歩 | - | 107* | ▲３七桂 | 差し替え(新の最善 ▲３七桂)、またはミス側(咎めの枝)へ移す |
| sankenbisha-gote--nanamebogin 27手目 | ▲４六銀 | - | 135* | ▲４六歩 | 差し替え(新の最善 ▲４六歩)、またはミス側(咎めの枝)へ移す |
| sankenbisha-gote--nanamebogin 33手目 | ▲３八飛 | - | 113* | ▲２四歩 | 差し替え(新の最善 ▲２四歩)、またはミス側(咎めの枝)へ移す |
| sankenbisha-ishida--deashi 6手目 | △４五角 | 261〜295 | 466 | △８四歩 | 差し替え(新の最善 △８四歩)、またはミス側(咎めの枝)へ移す |
| sankenbisha-ishida--deashi 8手目 | △６四歩 | 0 | 106* | △９四歩 | 差し替え(新の最善 △９四歩)、またはミス側(咎めの枝)へ移す |
| sankenbisha-ishida--migishiken 24手目 | △５四銀 | 285 | 249 | △３三角 | 差し替え(新の最善 △３三角)、またはミス側(咎めの枝)へ移す |

### 3-c. 入口(相手の別の手)が 100 超 15

| 章 | 入口の手 | 旧の差 | 新の差 | 新の最善 | どう直すか |
|---|---|---|---|---|---|
| nakabisha-vs-5yonfu--horyu 12手目 | △７七角成 | - | 113* | △３二玉 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| nakabisha-vs-5yonfu--kakukoukan 6手目 | △８四歩 | - | 249 | △６二銀 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| nakabisha-vs-chousoku-kakukoukan--gote 11手目 | ▲７七桂 | - | 143 | ▲６八玉 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-gote--deashi 3手目 | ▲７五歩 | 80〜136 | 213 | ▲７八金 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-gote--deashi 3手目 | ▲５六歩 | - | 192 | ▲７八金 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-gote--hayashikake 29手目 | ▲８六歩 | - | 149 | ▲４五歩 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-ishida--aifuri-shiken 6手目 | △３二飛 | - | 223* | △７二銀 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-ishida--aifuri-shiken 6手目 | △５二飛 | - | 146* | △７二銀 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-ishida--bokin 14手目 | △７二飛 | - | 118* | △５二金右 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-ishida--bokin 30手目 | △５二金 | - | 153* | △６三銀 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-ishida--deashi 2手目 | △５四歩 | 19〜92 | 161 | △８四歩 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-ishida--deashi 4手目 | △４四歩 | 32 | 103* | △５四歩 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-ishida--deashi 4手目 | △３五歩 | 101 | 118* | △５四歩 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-ishida--honkumi 22手目 | △６五歩 | - | 408 | △６三銀 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |
| sankenbisha-ishida--sugairyu 10手目 | △４五角 | - | 166 | △６二銀 | 変化の枝を消す、または咎めの枝(損300以上か)に付け替える |

## 4. 境目の本線の手

旧で差 60〜140 だった本線の手 60 か所(章×手 119)。新で 100 以内に収まった 44、100 超になった 16(学ぶ側 7・相手 12)。

### 4-a. 学ぶ側の手が 100 超

| 章 | 手 | 旧の差 | 新の差 | 新の最善(評価) | どう直すか |
|---|---|---|---|---|---|
| sankenbisha-ishida--aifuri-shiken 3手目 ほか8章 | ▲７五歩 | 80〜136 | 213 | ▲７八金(82) | 差し替え(新の最善)。以降の本線を作り直し。共通の入口なので全章に効く |
| nakabisha-vs-anaguma--7suji 2手目 ほか8章 | △５四歩 | 19〜92 | 161 | △８四歩(-25) | 差し替え(新の最善)。以降の本線を作り直し。共通の入口なので全章に効く |
| nakabisha-vs-chousoku--gote 28手目 | △９四歩 | 46〜76 | 191 | △６三銀(38) | 差し替え(新の最善)。以降の本線を作り直し |
| nakabisha-vs-sankenbisha--aifuri 14手目 | △４四銀 | 24〜77 | 156 | △２四歩(100) | 差し替え(新の最善)。以降の本線を作り直し |
| sankenbisha-ishida--aifuri 3手目 | ▲６六歩 | 48〜90 | 121* | ▲２六歩(20) | 差し替え(新の最善)。以降の本線を作り直し |
| sankenbisha-ishida--hidarimino 21手目 | ▲７七角 | 81〜111 | 108* | ▲１六歩(-22) | 差し替え(新の最善)。以降の本線を作り直し |
| nakabisha--shote 4手目 | △５四歩 | 88 | 104* | △４四歩(-71) | 差し替え(新の最善)。以降の本線を作り直し |

### 4-b. 相手の本線の手が 100 超

| 章 | 手 | 旧の差 | 新の差 | 新の最善(評価) | どう直すか |
|---|---|---|---|---|---|
| nakabisha-vs-anaguma--sente 16手目 ほか1章 | △３三角 | 34〜97 | 150 | △７七角成(108) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| nakabisha-vs-anaguma--7suji 9手目 ほか1章 | ▲５八金右 | 36〜73 | 121* | ▲３三角成(264) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| nakabisha-vs-ibisha--gokigen24 7手目 | ▲２四歩 | 78〜110 | 307 | ▲６八玉(202) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| nakabisha-vs-chousoku--gote 27手目 | ▲９六歩 | 20〜98 | 246 | ▲３七桂(176) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| nakabisha-vs-chousoku--gote 39手目 | ▲３四飛 | 0〜79 | 244 | ▲２九飛(147) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| sankenbisha-gote--aisanken 3手目 | ▲７五歩 | 80〜136 | 213 | ▲７八金(82) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| nakabisha-vs-anaguma--sente 24手目 | △２二角 | 0〜72 | 164 | △８四飛(-240) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| sankenbisha-ishida--aifuri 2手目 | △５四歩 | 19〜92 | 161 | △８四歩(-25) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| nakabisha-vs-anaguma--7suji 25手目 | ▲８八銀 | 77〜97 | 141* | ▲６七金(221) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| nakabisha-vs-sankenbisha--aifuri 3手目 | ▲６六歩 | 48〜90 | 121* | ▲２六歩(20) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| nakabisha-vs-anaguma--7suji 19手目 | ▲９八香 | 76〜105 | 105* | ▲３六歩(95) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |
| sankenbisha-gote--bogin 27手目 | ▲３八飛 | 22〜87 | 104* | ▲３五歩(148) | 相手の手を新の最善へ差し替え、または『相手のミス』として咎め/変化の枝へ移す |

## 5. 最善手が入れ替わり、本線の手が最善でなくなったうち 100 超

本線の手(4)と、唯一と書いた手(2-b)のうち、新で最善が別の手になり差が 100 超のもの 16 か所(章×手 37)。4 と 2-b の再掲で、新の最善手の評価値を添え、差が大きい順に並べた。評価値は手番側から見た値。

| 章 | 手 | 学ぶ側 | 新の差 | 新の最善 | 最善の評価 |
|---|---|---|---|---|---|
| nakabisha-vs-ibisha--gokigen24 7手目 | ▲２四歩 | 相手 | 307 | ▲６八玉 | 202 |
| nakabisha-vs-chousoku--gote 27手目 | ▲９六歩 | 相手 | 246 | ▲３七桂 | 176 |
| nakabisha-vs-chousoku--gote 39手目 | ▲３四飛 | 相手 | 244 | ▲２九飛 | 147 |
| sankenbisha-gote--aisanken 3手目 ほか9章 | ▲７五歩 | 相手 | 213 | ▲７八金 | 82 |
| nakabisha-vs-chousoku--gote 28手目 | △９四歩 | 自分 | 191 | △６三銀 | 38 |
| nakabisha-vs-anaguma--sente 24手目 | △２二角 | 相手 | 164 | △８四飛 | -240 |
| nakabisha-vs-anaguma--7suji 2手目 ほか9章 | △５四歩 | 自分 | 161 | △８四歩 | -25 |
| nakabisha-vs-sankenbisha--aifuri 14手目 | △４四銀 | 自分 | 156 | △２四歩 | 100 |
| nakabisha-vs-anaguma--sente 16手目 ほか1章 | △３三角 | 相手 | 150 | △７七角成 | 108 |
| nakabisha-vs-anaguma--7suji 25手目 | ▲８八銀 | 相手 | 141* | ▲６七金 | 221 |
| nakabisha-vs-anaguma--7suji 9手目 ほか1章 | ▲５八金右 | 相手 | 121* | ▲３三角成 | 264 |
| nakabisha-vs-sankenbisha--aifuri 3手目 ほか1章 | ▲６六歩 | 相手 | 121* | ▲２六歩 | 20 |
| sankenbisha-ishida--hidarimino 21手目 | ▲７七角 | 自分 | 108* | ▲１六歩 | -22 |
| nakabisha-vs-anaguma--7suji 19手目 | ▲９八香 | 相手 | 105* | ▲３六歩 | 95 |
| nakabisha--shote 4手目 | △５四歩 | 自分 | 104* | △４四歩 | -71 |
| sankenbisha-gote--bogin 27手目 | ▲３八飛 | 相手 | 104* | ▲３五歩 | 148 |

## 6. 文に書いた数字が新しい測定と合わなくなったもの

- 対象 42 章の文(note・aim・punishNote・節の comment)3230 文のうち、測定の数字を書いたもの = **807** 文。ほぼ全部が旧エンジン(水匠 d16〜d22)の測定。
- **書き直しが要る文 = 110**。内訳: 判定が変わった手の文 54、新と数字がずれる文 69(新の値が旧の範囲から ±30 かつ ±25% の外。重なりは除く)。
- ずれの多くは大きな損(1000 超)。新エンジンは大きな差を約 1.5 倍、小さな差を約 0.8 倍にするため、数字を書いた文は『旧エンジンの測定』と明記するか、新の値に置き換えるかを決める必要がある。
- 数字入りの文のうち新の測定と照合できたのは 197 文(照合できた = 同じ手の差・損・次善との差が文から取れたもの)。評価値(+◯◯、-◯◯)や指し継ぎの値(『20手指し継いで +3068 以上』など)は今回の A では測っていないので、旧の数字のまま(数も上の 807 文に含む)。

章ごとの数(『全文』は note・aim・punishNote・節の comment の合計):

| 章 | 数字入りの文 | 全文 | 要直し文 |
|---|---|---|---|
| nakabisha-vs-anaguma--7suji | 3 | 56 | 2 |
| nakabisha-vs-hidarimino--gote | 40 | 93 | 4 |
| nakabisha-vs-ibisha--gokigen24 | 3 | 123 | 1 |
| nakabisha-vs-chousoku--gote | 3 | 86 | 0 |
| nakabisha-vs-sankenbisha--aifuri | 1 | 61 | 1 |
| nakabisha-vs-chousoku--sente | 1 | 58 | 0 |
| nakabisha-vs-sankenbisha--sente | 2 | 97 | 0 |
| nakabisha-vs-anaguma--sente | 2 | 73 | 0 |
| nakabisha-vs-hidarimino--sente | 44 | 91 | 3 |
| nakabisha--shote-sente | 0 | 39 | 0 |
| nakabisha-vs-5yonfu--horyu | 23 | 63 | 2 |
| nakabisha-vs-5yonfu--kakukoukan | 58 | 99 | 6 |
| nakabisha-vs-ibisha--jikyusen | 39 | 97 | 5 |
| nakabisha-vs-8yonfu--kakukoukan | 52 | 91 | 9 |
| nakabisha--shote | 0 | 11 | 0 |
| nakabisha-vs-ufogin--gote | 0 | 40 | 0 |
| nakabisha-vs-chokyusen--kaihi | 0 | 21 | 0 |
| nakabisha-vs-maruyama--gote | 54 | 103 | 6 |
| nakabisha-vs-chousoku-kakukoukan--gote | 54 | 107 | 10 |
| nakabisha-vs-ureshino--gote | 1 | 48 | 0 |
| nakabisha-vs-onigoroshi--gote | 1 | 21 | 0 |
| sankenbisha-ishida--deashi | 5 | 80 | 4 |
| sankenbisha-ishida--kakugawari | 4 | 47 | 1 |
| sankenbisha-ishida--honkumi | 7 | 70 | 2 |
| sankenbisha-ishida--migishiken | 12 | 66 | 1 |
| sankenbisha-ishida--hidarimino | 8 | 52 | 2 |
| sankenbisha-ishida--anaguma | 9 | 61 | 1 |
| sankenbisha-ishida--aifuri | 19 | 79 | 2 |
| sankenbisha-ishida--sugairyu | 23 | 89 | 4 |
| sankenbisha-ishida--bokin | 27 | 94 | 8 |
| sankenbisha-ishida--aifuri-shiken | 49 | 118 | 13 |
| sankenbisha-gote--deashi | 13 | 74 | 3 |
| sankenbisha-gote--minokansei | 10 | 58 | 0 |
| sankenbisha-gote--bogin | 22 | 94 | 3 |
| sankenbisha-gote--hayashikake | 20 | 84 | 4 |
| sankenbisha-gote--anaguma | 27 | 103 | 2 |
| sankenbisha-gote--hidarimino | 22 | 92 | 2 |
| sankenbisha-gote--aifuri-mukai | 34 | 95 | 1 |
| sankenbisha-gote--aifuri-naka | 39 | 105 | 1 |
| sankenbisha-gote--aisanken | 24 | 72 | 2 |
| sankenbisha-gote--migishiken | 24 | 108 | 2 |
| sankenbisha-gote--nanamebogin | 28 | 111 | 3 |

### ずれの例(新の値が旧の範囲から大きく外れる、新が小さい順→差の大きい例)

小さな差・損のずれ(1000 未満)56 文のうち 10 件、大きな損のずれ 6 件。

| 章 | 手 | 文の種類 | 旧(文) | 新 | 文の抜粋 |
|---|---|---|---|---|---|
| nakabisha-vs-5yonfu--kakukoukan 13手目 | ▲４四馬 | note/margin | 316〜346 | 878 | 馬で、4四の角を取ります。唯一の手です(次善との差は d16 337・d18 346・d20 316 |
| sankenbisha-ishida--aifuri-shiken 14手目 | △７四歩 | punishNote/loss | 262〜282 | 644 | 突き出された歩を、▲7四歩と取るだけで歩を1枚得します。後手の飛車は4二にいて、7四には届かないので |
| nakabisha-vs-5yonfu--kakukoukan 11手目 | ▲５三角成 | note/margin | 140〜241 | 517 | 角を5三へ進めて、馬にします。唯一の手です(次善との差は d16 140・d18 241・d20 2 |
| sankenbisha-gote--migishiken 33手目 | ▲４五桂 | punishNote/loss | 491〜545 | 862 | 4五は後手の4四の銀の利きの中なので、桂は銀に取られます。△4五銀と桂を取れば、後手が桂を得します( |
| sankenbisha-gote--migishiken 29手目 | ▲４五桂 | punishNote/loss | 453〜475 | 749 | 4五は後手の4四の歩の利きの中なので、桂は歩に取られます。△4五歩と桂を取れば、桂と歩の交換で後手が |
| nakabisha-vs-chousoku-kakukoukan--gote 11手目 | ▲３六歩 | punishNote/loss | 584〜622 | 853 | 3六に歩が進んで、3七があきました。そこで△5五角と打つと、角は2八の飛車に(4六・3七の道)、9九 |
| nakabisha-vs-hidarimino--gote 34手目 | △７五飛 | note/margin | 591〜631 | 852 | 飛車で、7五の角を取り返します。7五の角を守る先手の駒はありません(盤で確かめた)。唯一の手です(次 |
| sankenbisha-gote--hayashikake 29手目 | ▲３五歩 | punishNote/loss | 312 | 561 | 3筋の歩を突くのは、早仕掛けを急いだ手ですが、後手の3四の歩に取られて、先手は歩を損します。測定では |
| sankenbisha-ishida--sugairyu 12手目 | △８六歩 | punishNote/loss | 285〜312 | 518 | 8筋の歩は8二の飛車が支えていますが、▲同歩のあと△同飛と取り返すと、7六の飛車に▲同飛と取られて、 |
| sankenbisha-ishida--bokin 26手目 | △７四歩 | punishNote/loss | 310〜353 | 543 | 突き出された歩を、▲7四歩と取るだけで歩を1枚得します。8四の金では取り返せません。△同金と取ると、 |
| nakabisha-vs-chousoku-kakukoukan--gote 10手目 | △３三桂 | note/margin | 3455〜3516 | 1346 | 桂で、3三の馬を取り返します。唯一の手です(次善との差は d16 3463・d18 3455・d20 |
| nakabisha-vs-8yonfu--kakukoukan 7手目 | ▲２二角成 | note/margin | 3108〜3244 | 1589 | 角で、2二の角を取ります。2二に利く後手の駒がないので、取り返されません。次善の手との差は d16  |
| nakabisha-vs-8yonfu--kakukoukan 6手目 | △３二銀 | punishNote/loss | 3182〜3310 | 1670 | 3一の銀が3二へ動くと、2二の角を守る駒がなくなります。3一の銀の利きが消え、8二の飛車の利きも3二 |
| sankenbisha-ishida--aifuri-shiken 12手目 | △４五歩 | punishNote/loss | 3052〜3255 | 1557 | 4四の歩が動くと、先手の角の筋(8八から2二まで)が通ります。2二の相手の角は、3二の銀が飛車の横の |
| sankenbisha-gote--anaguma 31手目 | ▲７九金 | punishNote/loss | 3172 | 1729 | 穴熊を完成させたい気持ちで指しやすい手ですが、2二の飛車が2八の先手の飛車に当たっています。△2八飛 |
| nakabisha-vs-chousoku-kakukoukan--gote 9手目 | ▲７八銀 | punishNote/loss | 2942〜3177 | 1868* | 8八の先手の角は、これまで7九の銀が守っていました。その銀を7八へ上げると、8八に利く先手の駒がなく |

## 付録: まとめ方
- 判定は 2段目がある局面は 2段目の値、ほかは 1段目。損は最善との差(手番側)。候補外の手は指した後を探索した値(via:child)。
- 表は同じ局面+手を1行にまとめ、『ほかN章』と書いた。章×手の数は章ごとの直しの数を見るときに使う。
- 「自分の手/相手の手」は、章の mySide と局面の手番で決めた。『境目(本線)』は旧の記録で差 60〜140 だった本線の手に限る(cases.json と同じ)。
- 『唯一(節のコメント)』は、手を指した後の局面の comment に『唯一』とあるものを、その手の判定として扱った。comment が次の手を指している場合は対象の手がずれうるので、直す前に確かめる。
- 「唯一ではありません」と書いた文は『唯一』の判定から外し、2-d に分けた。
- 「要直し文」は、(判定が変わった手の)数字入りの文・『唯一』を含む文・咎めの punishNote と、数字ずれの文の和集合。機械の目安で、直す前に章ごとに目で確かめる。
- 測定が無かった対象: 0 局面。
