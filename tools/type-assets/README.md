# 3D文字・HDRI（PRIVATE_SPEC）

主要告知の既存DOM文言からNoto Sans CJK JP Blackの押し出しメッシュを作る。新しい説明文は追加しない。黒い背面／銀の側面／色付き前面の3層。背面・銀層は輪郭を拡張せず、前面のみ微小な内向きベベルを使う。大きな外向きベベルは漢字の細部の自己交差や英字の穴塞がりを起こすため使用しない。CSS側の実文字は透明にして読み上げを維持。フォントにない字や読込失敗では既存CSS文字を表示。通常ステージ名、本文、ベルナビは既存表示。

描画は既存LCD rendererのポスト処理後へ重ねる。別WebGLRendererは追加しない。文字形状は8件までキャッシュ。表示切替時のせり出しと照明の横移動はreduced-motionに対応。文字色は赤BIG／青BIG／ブーストへ合わせる。

添付 studio_small_09_2k.exr を assets/environment に原本のままコピー。背景写真にはせず反射へ使用。物理マテリアルの文字にはHDR PMREM、Phong構造物にはピーク圧縮したCube反射を使用。構造物の反射強度は不透明0.18／透明0.25。入力ファイルの音声・画像編集はしていない。元データ提供元・再配布条件はユーザー側で確認すること。

## ビルド

このディレクトリで npm install 後、`node build.cjs /path/to/NotoSansCJKjp-Black.otf`。runtimeにはnpm不要。ソースフォントは https://github.com/notofonts/noto-cjk/tree/main/Sans/OTF/Japanese 。OFLは assets/fonts/OFL.txt に保存。出力サブセット名は Slot Noto Sans CJK JP Black Subset。EXRLoader / FontLoader / fflateのみを束ね、既存window.THREEを共有。Three本体の重複はない。

## 確認範囲

実ブラウザでHDRI読込完了、赤BIG／青BIGの3D文字、色・明るさ、コンソールエラーなしを確認。赤BIGは1280×800相当でも確認。文字が黒く沈む初期試作から正面の補助光、縁の厚みを修正。EXRコピーのSHA-256一致、変更JSの構文を確認。読込失敗時の経路はコード確認のみ。全告知・全端末の網羅テストは実施しない。ゲームの抽選・停止制御・音源・操作部は変更なし。
