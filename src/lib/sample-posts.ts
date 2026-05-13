import type { Post, PostSource, PostType } from "@/types/post";

type SampleSeed = {
  type: PostType;
  body: string;
  url?: string;
  tags: string[];
  source: PostSource;
  postedFrom?: "post" | "clip";
};

const sampleSeeds: SampleSeed[] = [
  {
    type: "post",
    body: "駅前の小さな喫茶店で、だれにも見つからない席を確保。静かな午後にコードを書くの、かなり好きかもしれない。",
    url: "https://example.com/cafe-note",
    tags: ["cafe", "memo"],
    source: "manual",
  },
  {
    type: "posted",
    body: "新しい曲の断片を録ってみた。完璧じゃなくても、今日はちゃんと前に進めた気がする。",
    url: "https://example.com/demo-track",
    tags: ["song", "idea", "share"],
    source: "x",
    postedFrom: "post",
  },
  {
    type: "clip",
    body: "メモ: 投稿画面は『書き始めるハードルの低さ』が大事。入力欄が怖く見えないように余白を多めにしたい。",
    tags: ["design", "ux"],
    source: "web",
  },
  {
    type: "post",
    body: "深夜に見つけた展示メモ。白い壁より、少し色がついた背景の方が作品がやわらかく見えた。",
    url: "https://example.com/gallery-note",
    tags: ["art", "memo"],
    source: "manual",
  },
  {
    type: "clip",
    body: "あとで読む: Android の共有導線は『一瞬で保存できる安心感』が最優先。設定の多さは後回しでもいい。",
    url: "https://example.com/android-share-flow",
    tags: ["android", "reference", "todo"],
    source: "share",
  },
  {
    type: "posted",
    body: "今日の進捗。サムネイル周りの整理がやっと形になってきた。派手じゃないけど前進。",
    tags: ["dev", "progress"],
    source: "x",
    postedFrom: "post",
  },
  {
    type: "post",
    body: "雨の日はタスクを細かく刻んだ方が動ける。『5分だけやる』で始めると意外と続く。",
    tags: ["life", "todo"],
    source: "manual",
  },
  {
    type: "clip",
    body: "リンク保存テスト用。OGP が弱いページでも最低限のタイトルだけ拾えたら体験はだいぶ変わる。",
    url: "https://example.com/ogp-minimal",
    tags: ["ogp", "test"],
    source: "web",
  },
  {
    type: "post",
    body: "今のホーム画面、余白と線の情報量は良いけど、操作の優先度がもう少し見えた方が安心感が出そう。",
    tags: ["home", "design"],
    source: "manual",
  },
  {
    type: "posted",
    body: "気になっていた映画の感想。静かなシーンほど余韻が長くて、帰り道まで引きずるタイプだった。",
    url: "https://example.com/movie-note",
    tags: ["movie", "memo"],
    source: "x",
    postedFrom: "clip",
  },
  {
    type: "clip",
    body: "タグ長押しメニュー案。『非表示』『タグ編集』『このタグだけ見る』の並びが分かりやすいかも。",
    tags: ["tag", "ux"],
    source: "manual",
  },
  {
    type: "post",
    body: "散歩の途中で見つけた古本屋。入口の匂いだけで少し気分が戻る日ってある。",
    url: "https://example.com/bookstore-note",
    tags: ["walk", "memo"],
    source: "manual",
  },
  {
    type: "posted",
    body: "共有から保存する流れ、3秒以内に完了できるとかなり気持ちいい。体感速度って大事。",
    tags: ["share", "ux"],
    source: "x",
    postedFrom: "post",
  },
  {
    type: "post",
    body: "カレンダービューは『いつ保存したか』を眺められるだけでも、思考のログとしてけっこう面白い。",
    tags: ["calendar", "idea"],
    source: "manual",
  },
  {
    type: "clip",
    body: "あとで確認: 画像付き投稿の順序変更 UI は、ドラッグよりも明示ボタンの方が Android では安心かもしれない。",
    tags: ["media", "android", "todo"],
    source: "manual",
  },
  {
    type: "post",
    body: "人に見せる前のメモ置き場があるだけで、アイデアの温度が下がりにくい気がする。",
    tags: ["idea", "private"],
    source: "manual",
  },
  {
    type: "clip",
    body: "テスト用に保存した Amazon リンク。価格情報よりも、何が欲しかったかのメモを残したい。",
    url: "https://www.amazon.co.jp/example-item",
    tags: ["Amazon", "shopping"],
    source: "share",
  },
  {
    type: "posted",
    body: "今日の一曲。ループで流していたら、作業の速度まで少し整ってきた。",
    url: "https://example.com/song-loop",
    tags: ["music", "share"],
    source: "x",
    postedFrom: "clip",
  },
  {
    type: "post",
    body: "投稿カードの順番を入れ替える設定、意外と人によって欲しい並びが違いそう。",
    tags: ["settings", "idea"],
    source: "manual",
  },
  {
    type: "clip",
    body: "GitHub issue メモ。『不具合』だけじゃなく『不安ポイント』として記録できると整理しやすい。",
    url: "https://github.com/example/repo/issues/1",
    tags: ["GitHub", "reference"],
    source: "web",
  },
  {
    type: "post",
    body: "朝に 10 分だけ整理した机の上、夜までちゃんと効いている。環境って思った以上に強い。",
    tags: ["life", "memo"],
    source: "manual",
  },
  {
    type: "posted",
    body: "週末に試した UI 監査の話。100% じゃなくても、怪しい場所を先に絞れるだけでかなり助かる。",
    tags: ["ui", "testing"],
    source: "x",
    postedFrom: "post",
  },
  {
    type: "clip",
    body: "Instagram の保存候補。文章より画像起点の投稿は、あとで探しやすいラベルがあると助かる。",
    url: "https://www.instagram.com/p/example/",
    tags: ["Instagram", "reference"],
    source: "share",
  },
  {
    type: "post",
    body: "今日はタスクを減らすことを進捗にしたい。増やすより、減らす方が難しい日もある。",
    tags: ["todo", "mind"],
    source: "manual",
  },
  {
    type: "clip",
    body: "レイアウト確認メモ。固定トーストは便利だけど、下部 FAB とぶつかる時の圧迫感に注意。",
    tags: ["layout", "test"],
    source: "manual",
  },
  {
    type: "posted",
    body: "共有から入って、保存して、すぐ戻れる流れが整ってきた。これだけで使う気持ちがかなり変わる。",
    tags: ["android", "flow"],
    source: "x",
    postedFrom: "post",
  },
  {
    type: "post",
    body: "静かな時間にだけ進む作業がある。昼じゃなくて夜に向いてる実装もあるんだなと思う。",
    tags: ["night", "dev"],
    source: "manual",
  },
  {
    type: "clip",
    body: "YouTube の保存候補。後で見るだけじゃなく『なぜ後で見たいか』を一言残せると忘れにくい。",
    url: "https://youtu.be/example-video",
    tags: ["YouTube", "reference"],
    source: "share",
  },
  {
    type: "post",
    body: "タグが増えてくると、非表示機能のありがたみが急に出る。雑音を自分で減らせるのは大事。",
    tags: ["tag", "idea"],
    source: "manual",
  },
  {
    type: "posted",
    body: "今日のまとめ。派手な新機能より、毎日使う流れを少しずつ滑らかにする方が効いてくる。",
    tags: ["progress", "memo"],
    source: "x",
    postedFrom: "post",
  },
];

const baseDate = Date.parse("2026-05-08T08:20:00.000Z");
const hourMs = 60 * 60 * 1000;

export const samplePosts: Post[] = sampleSeeds.map((seed, index) => {
  const timestamp = new Date(baseDate - index * 7 * hourMs).toISOString();
  return {
    id: `sample-${index + 1}`,
    type: seed.type,
    postedFrom: seed.postedFrom,
    body: seed.body,
    url: seed.url,
    tags: seed.tags,
    source: seed.source,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
});
