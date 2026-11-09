# 測り直し C の結果(2026-11-09)

本線のうち、旧エンジンの記録がなかった262局面を、新エンジン(つようら王11mini)で測った。1段目(500万ノード)262局面、境目の23局面は2段目(4000万ノード)の値で判定。データは scripts/lab-out/remeasure-C-*.jsonl(git の管理外)。

## 結論
- 最善との差が100を超えた本線の手は12か所(学ぶ側5・相手7)。残りの250局面は100以内。
- 多いのは nakabisha-vs-5yonfu--kakukoukan(4)と sankenbisha-gote--aifuri-mukai(3)。
- A の結果(docs/remeasure-A-result.md)の「本線の手の差し替え」と合わせて、直しの案の第2弾で扱う。

## 100を超えた手(差の大きい順。手数は記録の ply の値)
| 差 | 段 | 手 | 新の最善 | 種類 | 章:手数 |
|---|---|---|---|---|---|
| 381 | 1 | 9c9d | 2b3c | 学ぶ側 | sankenbisha-gote--aifuri-mukai:30 |
| 380 | 1 | 2b3c | B*4e | 相手 | nakabisha-vs-5yonfu--kakukoukan:24 |
| 287 | 1 | 1g1f | 7f7e | 相手 | sankenbisha-gote--aifuri-mukai:31 |
| 228 | 1 | 6d5e | 7i6h | 学ぶ側 | nakabisha-vs-5yonfu--kakukoukan:23 |
| 217 | 1 | 9g9f | 3g3f | 相手 | nakabisha-vs-chousoku-kakukoukan--gote:25 |
| 204 | 1 | 8i7g | 5e7g | 学ぶ側 | nakabisha-vs-5yonfu--kakukoukan:25 |
| 199 | 1 | 5i6h | 1g1f | 学ぶ側 | nakabisha-vs-8yonfu--kakukoukan:9 |
| 182 | 1 | 7h8g | 2e2d | 相手 | sankenbisha-gote--hidarimino:35 |
| 169 | 1 | 6g6f | 6i7h | 相手 | sankenbisha-gote--aifuri-naka:23 |
| 142 | 2 | 4i5h | 5f5e | 相手 | nakabisha-vs-maruyama--gote:19 |
| 109 | 2 | 5b6c | 5a6b | 相手 | sankenbisha-ishida--aifuri-shiken:32 |
| 106 | 2 | 6b7a | 7b7c | 学ぶ側 | sankenbisha-gote--aifuri-mukai:14 |
