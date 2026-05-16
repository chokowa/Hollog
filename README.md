## Getting Started

開発サーバーを起動する場合:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開くと確認できます。

## App Simulation

手動確認の前に、主要な保存・更新・削除・復元・タブ別表示・インポート競合・設定保存まわりをコード上でシミュレートできます。

```bash
npm run simulate:app
```

このコマンドは実アプリを起動せず、状態遷移と保存ロジックを直接たどるスモークテストです。

## HOME UI Audit

HOME 画面については、人間が触りそうな操作を前提にした軽量監査も実行できます。

```bash
npm run audit:home-ui
npm run audit:calendar-ui
npm run audit:ui
```

これは実描画ではなく、タップ、長押し、横スクロール、固定 UI の重なりなどをコード上から見て `pass / warn / fail` を返します。`audit:ui` は HOME とカレンダーをまとめて確認します。`warn` が出た箇所を優先して手動テストすると、確認範囲をかなり絞れます。

## Design Rules

開発中のデザイン判断は [DESIGN.md](DESIGN.md) を基準にします。Android / Capacitor 優先、HOMEタイムライン主役、ローカル保存の安心感を軸に、色・レイアウト・操作・検証のルールをまとめています。

デザインやUIを触った後の基本チェック:

```bash
npm run design:check
```

## Notes

- Android / Capacitor を優先する方針です。
- Web UI を触らずに確認できるロジックは、なるべく `simulate:app` に追加していく想定です。
