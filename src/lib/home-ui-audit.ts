import { readFileSync } from "node:fs";
import path from "node:path";

type AuditSeverity = "pass" | "warn" | "fail";

type AuditFinding = {
  id: string;
  severity: AuditSeverity;
  title: string;
  summary: string;
  file: string;
  triggeredBy?: string;
  expectedFailure?: string;
  hint?: string;
};

type AuditResult = {
  findingCount: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  findings: AuditFinding[];
};

type SourceBundle = {
  postFeed: string;
  bottomNav: string;
  appHeader: string;
  page: string;
};

function readSource(projectRoot: string, relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function includesAll(source: string, snippets: string[]) {
  return snippets.every((snippet) => source.includes(snippet));
}

function push(
  findings: AuditFinding[],
  finding: Omit<AuditFinding, "file"> & { file: string },
) {
  findings.push(finding);
}

function auditSwipeDelete(findings: AuditFinding[], source: SourceBundle) {
  const hasSwipeCore = includesAll(source.postFeed, [
    "SWIPE_DELETE_THRESHOLD",
    "handlePointerDown",
    "handlePointerMove",
    "finishSwipe",
    "onDelete(post, height)",
  ]);

  if (!hasSwipeCore) {
    push(findings, {
      id: "home-swipe-delete-core",
      severity: "fail",
      title: "投稿カードのスワイプ削除条件が不足しています",
      summary: "HOME の主要操作である横スワイプ削除の基本ハンドラが揃っていません。",
      file: "src/components/post-feed.tsx",
      triggeredBy: "`SWIPE_DELETE_THRESHOLD` やスワイプ完了処理の一部が見つかりませんでした。",
      expectedFailure: "カードを横に払っても削除に入らない、または削除動作が途中で止まる可能性があります。",
      hint: "投稿カードを左へスワイプして削除できるかを手動確認してください。",
    });
    return;
  }

  const blocksMediaAndButtons = includesAll(source.postFeed, [
    'target.closest("button, a, [data-card-media], img, input, textarea, select")',
    "canStartPostSwipe",
    "target.closest(\"[data-horizontal-scroll]",
  ]);

  push(findings, {
    id: "home-swipe-delete-guards",
    severity: blocksMediaAndButtons ? "pass" : "warn",
    title: "投稿カードのスワイプ誤爆ガード",
    summary: blocksMediaAndButtons
      ? "ボタン・画像・横スクロール帯でスワイプ開始を抑制する条件があります。"
      : "スワイプ削除はありますが、画像やボタン付近の誤爆を防ぐ条件が弱い可能性があります。",
    file: "src/components/post-feed.tsx",
    triggeredBy: blocksMediaAndButtons
      ? "`button`, `img`, `[data-horizontal-scroll]` 付近を除外する条件が確認できました。"
      : "スワイプ開始条件はありますが、ボタンや画像付近の除外条件が十分に見つかりませんでした。",
    expectedFailure: blocksMediaAndButtons
      ? "大きな懸念は見えていません。"
      : "画像を触ったつもりで削除スワイプが始まる、タグを横に送るつもりでカードが動く、という誤爆を想定しています。",
    hint: "カード内のタグ、画像、各種ボタンを触った時に誤って削除スワイプにならないか確認すると安心です。",
  });
}

function auditTagScrollAndLongPress(findings: AuditFinding[], source: SourceBundle) {
  const hasTagScroll = includesAll(source.postFeed, [
    "overflow-x-auto",
    "onScroll={updateTagScrollButtons}",
    'aria-label="タグを左へ送る"',
    'aria-label="タグを右へ送る"',
  ]);

  push(findings, {
    id: "home-tag-scroll",
    severity: hasTagScroll ? "pass" : "warn",
    title: "タグ列の横スクロール導線",
    summary: hasTagScroll
      ? "横スクロール本体と左右送りボタンの両方が用意されています。"
      : "タグ列はありますが、狭い端末で横スクロール導線が足りない可能性があります。",
    file: "src/components/post-feed.tsx",
    triggeredBy: hasTagScroll
      ? "`overflow-x-auto` と左右送りボタンの両方が見つかりました。"
      : "タグ列はありますが、明示的な横送り導線が不足しています。",
    expectedFailure: hasTagScroll
      ? "大きな懸念は見えていません。"
      : "タグが増えた時に、端のタグへ到達しづらくなる可能性があります。",
    hint: "タグが多い状態で、指スワイプと左右送りの両方が使えるか確認してください。",
  });

  const hasLongPress = includesAll(source.postFeed, [
    "tagLongPressTimerRef",
    "window.setTimeout(() => {",
    "setTagMenuState",
    "onPointerDown={(event) => {",
    "onPointerUp={() => {",
    "onPointerLeave={() => {",
  ]);

  const noPointerCancel = !source.postFeed.includes("onPointerCancel");

  push(findings, {
    id: "home-tag-long-press",
    severity: hasLongPress ? (noPointerCancel ? "warn" : "pass") : "fail",
    title: "タグ長押しメニューの安定性",
    summary: !hasLongPress
      ? "タグ長押しでメニューを開く前提の処理が不足しています。"
      : noPointerCancel
        ? "長押し実装はありますが、`pointercancel` が無く、スクロールや割り込みでタイマーが残る可能性があります。"
        : "長押しメニューの基本処理が揃っています。",
    file: "src/components/post-feed.tsx",
    triggeredBy: !hasLongPress
      ? "長押しタイマーや `setTagMenuState` の組み合わせが不足しています。"
      : noPointerCancel
        ? "`onPointerDown / onPointerUp / onPointerLeave` はありますが `onPointerCancel` がありません。"
        : "長押しタイマーと解除条件が一通り揃っています。",
    expectedFailure: !hasLongPress
      ? "タグを長押ししてもメニューが出ない可能性があります。"
      : noPointerCancel
        ? "長押し開始後に指がシステム側へ奪われた時、メニューが意図せず開く可能性を想定しています。"
        : "大きな懸念は見えていません。",
    hint: "タグを長押ししたまま少し指を動かす、あるいはスクロールしながら触る操作を試すと危険箇所を見つけやすいです。",
  });
}

function auditMediaTapTargets(findings: AuditFinding[], source: SourceBundle) {
  const cardOpensDetail = includesAll(source.postFeed, [
    'className="timeline-media-shell',
    "onClick={() => onPostClick(post.id)}",
  ]);
  const zoomButtonStopsPropagation = includesAll(source.postFeed, [
    "const openMediaViewer = (event: React.MouseEvent, itemIndex: number) => {",
    "event.stopPropagation();",
    'aria-label="拡大表示"',
  ]);

  push(findings, {
    id: "home-media-tap-targets",
    severity: cardOpensDetail && zoomButtonStopsPropagation ? "pass" : "warn",
    title: "メディア一覧のタップ対象分離",
    summary: cardOpensDetail && zoomButtonStopsPropagation
      ? "カードタップと拡大ボタンのイベントが分かれています。"
      : "メディアカード全体のタップと拡大ボタンの役割が近く、誤操作が起きやすい可能性があります。",
    file: "src/components/post-feed.tsx",
    triggeredBy: cardOpensDetail && zoomButtonStopsPropagation
      ? "カード全体クリックと拡大ボタン側の `stopPropagation()` が確認できました。"
      : "カード全体の `onClick` と拡大ボタンの役割分離が弱く見えます。",
    expectedFailure: cardOpensDetail && zoomButtonStopsPropagation
      ? "大きな懸念は見えていません。"
      : "拡大したいのに詳細へ飛ぶ、または詳細へ行きたいのに拡大が開く誤操作を想定しています。",
    hint: "画像タップで詳細へ行くのか、拡大ボタンでだけビューアが開くのか、想定通りか手で確認してください。",
  });
}

function auditOverlayStacking(findings: AuditFinding[], source: SourceBundle) {
  const hasBottomNav = source.bottomNav.includes('timeline-bottom-nav fixed bottom-0');
  const hasFab = source.bottomNav.includes('timeline-post-fab fixed bottom-20') && source.bottomNav.includes("z-50");
  const hasQuickMenuOverlay = source.bottomNav.includes('fixed inset-0 z-40') && source.bottomNav.includes("isQuickMenuOpen");
  const hasToast = source.page.includes("pointer-events-none fixed inset-x-0 bottom-6 z-[100]");
  const hasInlineUndoCard = source.postFeed.includes("1件削除しました") && source.postFeed.includes("pendingDeletedHeights");

  push(findings, {
    id: "home-overlay-stack",
    severity: hasBottomNav && hasFab && hasQuickMenuOverlay && hasToast ? (hasInlineUndoCard ? "pass" : "warn") : "fail",
    title: "固定要素どうしの重なり",
    summary: hasBottomNav && hasFab && hasQuickMenuOverlay && hasToast
      ? hasInlineUndoCard
        ? "削除取り消しは固定トーストではなく、削除されたカード位置に出るため下部ナビとの重なりリスクは下がっています。"
        : "HOME には下部ナビ、FAB、クイックメニュー、トーストが複数重なります。コード上は成立していますが、画面高が低い端末で干渉しやすい構成です。"
      : "固定要素の積み重ねが崩れている可能性があります。",
    file: "src/app/page.tsx",
    triggeredBy: hasBottomNav && hasFab && hasQuickMenuOverlay && hasToast
      ? hasInlineUndoCard
        ? "`fixed bottom-0` の下部ナビと `fixed bottom-20` の FAB はありますが、削除取り消し表示はカード位置に差し込まれています。"
        : "`fixed bottom-0` の下部ナビ、`fixed bottom-20` の FAB、`bottom-6` のトースト、`z-40~100` の複数固定要素が同時に存在します。"
      : "固定要素の一部が見つからず、重なり構造の整合性に不安があります。",
    expectedFailure: hasBottomNav && hasFab && hasQuickMenuOverlay && hasToast
      ? hasInlineUndoCard
        ? "削除取り消しについては大きな懸念は見えていません。通常トーストが出る操作だけ、下部固定UIとの距離を確認してください。"
        : "『最後のカードが上にスクロールしすぎて消える』ではなく、下端に出る固定 UI が縦方向で近すぎて、見えていても押しにくい・一部が隠れる・メニューが窮屈になる、を想定しています。"
      : "固定 UI の前後関係が崩れ、メニューやトーストが別の要素の裏に入る可能性があります。",
    hint: hasInlineUndoCard
      ? "削除後、消したカード位置に取り消しカードが出て、下部ナビに被らないか確認してください。"
      : "小さい画面で、削除取り消しトースト表示中に FAB や下部ナビが隠れないか確認してください。",
  });
}

function auditSearchAndHeader(findings: AuditFinding[], source: SourceBundle) {
  const hasSearchToggle = includesAll(source.appHeader, [
    "setIsSearchOpen((prev) => !prev)",
    "placeholder=\"本文・URL・タグを検索\"",
    "autoFocus",
  ]);

  push(findings, {
    id: "home-search-toggle",
    severity: hasSearchToggle ? "pass" : "warn",
    title: "ヘッダー検索の開閉導線",
    summary: hasSearchToggle
      ? "検索開閉と入力フォーカスの基本処理があります。"
      : "検索UIはありますが、開閉やフォーカス体験に欠けがある可能性があります。",
    file: "src/components/app-header.tsx",
    triggeredBy: hasSearchToggle
      ? "開閉トグルと検索入力 `autoFocus` が確認できました。"
      : "検索を開く処理か、開いた後の入力フォーカスのどちらかが不足しています。",
    expectedFailure: hasSearchToggle
      ? "大きな懸念は見えていません。"
      : "検索アイコンを押しても入力しづらい、または閉じた時に表示が崩れる可能性があります。",
    hint: "検索を開いてすぐ入力できるか、閉じたあとに上部レイアウトが崩れないか確認してください。",
  });
}

function auditFabLongPress(findings: AuditFinding[], source: SourceBundle) {
  const hasLongPressTimer = includesAll(source.bottomNav, [
    "LONG_PRESS_MS = 420",
    "onPointerDown={(event) => {",
    "window.setTimeout(openQuickMenu, LONG_PRESS_MS)",
    "onPointerUp={clearLongPressTimer}",
    "onPointerCancel={clearLongPressTimer}",
    "onPointerLeave={clearLongPressTimer}",
  ]);

  const suppressesClickAfterLongPress = includesAll(source.bottomNav, [
    "didLongPressRef.current",
    "event.preventDefault();",
    "onPostClick();",
  ]);

  push(findings, {
    id: "home-fab-long-press",
    severity: hasLongPressTimer && suppressesClickAfterLongPress ? "pass" : "warn",
    title: "FAB のタップと長押しの分離",
    summary: hasLongPressTimer && suppressesClickAfterLongPress
      ? "通常タップと長押しクイックメニューの分離処理があります。"
      : "FAB 長押し後に通常クリックが混ざる、またはメニューが開きにくい可能性があります。",
    file: "src/components/bottom-nav.tsx",
    triggeredBy: hasLongPressTimer && suppressesClickAfterLongPress
      ? "長押しタイマー、解除条件、長押し後クリック抑止が揃っています。"
      : "長押し後のクリック抑止か、長押し解除条件の一部が不足しています。",
    expectedFailure: hasLongPressTimer && suppressesClickAfterLongPress
      ? "大きな懸念は見えていません。"
      : "長押ししたのに通常の新規投稿が開く、または短押しなのにクイックメニューが出る誤判定を想定しています。",
    hint: "短押しで投稿作成、長押しでクイックメニューが安定して分かれるか確認してください。",
  });
}

function auditStickyAndViewport(findings: AuditFinding[], source: SourceBundle) {
  const stickyTopChrome = source.postFeed.includes('timeline-top-chrome sticky top-0 z-20');
  const bottomPadding = source.postFeed.includes('className="flex flex-col gap-3 pb-[22rem]"');
  const bottomNav = source.bottomNav.includes('timeline-bottom-nav fixed bottom-0');

  push(findings, {
    id: "home-scroll-safe-space",
    severity: stickyTopChrome && bottomPadding && bottomNav ? "warn" : "fail",
    title: "スクロール終端と固定ナビの干渉",
    summary: stickyTopChrome && bottomPadding && bottomNav
      ? "下部余白を広げ、カードメニュー側でも必要に応じて開く前にスクロールする処理があります。"
      : "スクロール領域と固定ナビの安全余白が不足している可能性があります。",
    file: "src/components/post-feed.tsx",
    triggeredBy: stickyTopChrome && bottomPadding && bottomNav
      ? "一覧側は `pb-[22rem]` で、同時に `fixed bottom-0` のナビと `fixed bottom-20` の FAB が存在します。`さらに表示` は存在しても、IntersectionObserver で自動読み込みされるため見えない場合があります。"
      : "一覧末尾の余白か、固定ナビの存在のどちらかが不足しています。",
    expectedFailure: stickyTopChrome && bottomPadding && bottomNav
      ? "大きな懸念は下がっています。最後のカードの `…` メニューが下に開けるか、開く前の補助スクロールが自然かを確認してください。"
      : "一覧の最下部要素が固定ナビの背後やすぐ近くに来て、操作しにくい可能性があります。",
    hint: "一番下までスクロールして、最後のカードの `…` を押した時にメニューが近い位置へ自然に開くか確認してください。",
  });
}

export function runHomeUiAudit(projectRoot: string): AuditResult {
  const source: SourceBundle = {
    postFeed: readSource(projectRoot, "src/components/post-feed.tsx"),
    bottomNav: readSource(projectRoot, "src/components/bottom-nav.tsx"),
    appHeader: readSource(projectRoot, "src/components/app-header.tsx"),
    page: readSource(projectRoot, "src/app/page.tsx"),
  };

  const findings: AuditFinding[] = [];

  auditSwipeDelete(findings, source);
  auditTagScrollAndLongPress(findings, source);
  auditMediaTapTargets(findings, source);
  auditOverlayStacking(findings, source);
  auditSearchAndHeader(findings, source);
  auditFabLongPress(findings, source);
  auditStickyAndViewport(findings, source);

  return {
    findingCount: findings.length,
    passCount: findings.filter((finding) => finding.severity === "pass").length,
    warnCount: findings.filter((finding) => finding.severity === "warn").length,
    failCount: findings.filter((finding) => finding.severity === "fail").length,
    findings,
  };
}
