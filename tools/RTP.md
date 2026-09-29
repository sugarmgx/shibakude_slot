# BT版の実装準拠測定
PRIVATE_SPEC。仕様と測定条件は [BT_SPEC](../docs/BT_SPEC.md) を参照。

```sh
node --test tests/rtp.test.cjs tests/reel-control.test.cjs
node tools/rtp.cjs --games 200000 --batches 2 --seed 820
```

実際のapp.jsから抽選・停止候補・表示役・払い出し・BTとCZの精算を読み込む。
seed固定。停止位置は一様でブラウザーAUTOのフレームタイミングは再現しない。
投入・払出・差枚・有料Gを毎ゲーム照合し、矛盾時は失敗させる。
initialGames / initialHits は通常＋通常CZの有料Gからの初当たり。
BT再当選と中段チェリーの2回目以降の保証は初当たりに含めない。

boost欄は元版からの負の回帰検査用で常に0になるべき。
設定の抽選値はapp/bt-rules.js。旧SETTING_PROFILESのAT係数はBT調整には使わない。
結果は有限試行の実測であり、理論機械割や厳密な95%信頼区間ではない。
