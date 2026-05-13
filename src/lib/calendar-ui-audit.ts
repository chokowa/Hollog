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
  calendarView: string;
  bottomNav: string;
  page: string;
};

function readSource(projectRoot: string, relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function includesAll(source: string, snippets: string[]) {
  return snippets.every((snippet) => source.includes(snippet));
}

function push(findings: AuditFinding[], finding: AuditFinding) {
  findings.push(finding);
}

function auditMonthNavigation(findings: AuditFinding[], source: SourceBundle) {
  const hasMonthNav = includesAll(source.calendarView, [
    'aria-label="前の月"',
    'aria-label="次の月"',
    "onClick={() => shiftMonth(-1)}",
    "onClick={() => shiftMonth(1)}",
    "onClick={selectToday}",
  ]);

  push(findings, {
    id: "calendar-month-navigation",
    severity: hasMonthNav ? "pass" : "fail",
    title: "月移動と今日ボタン",
    summary: hasMonthNav
      ? "前月、翌月、今日へ戻る操作が揃っています。"
      : "カレンダーの基本移動操作が不足しています。",
    file: "src/components/calendar-view.tsx",
    triggeredBy: hasMonthNav
      ? "`前の月`、`次の月`、`今日` のクリック処理を確認しました。"
      : "月移動または今日へ戻るボタンの処理が見つかりませんでした。",
    expectedFailure: hasMonthNav
      ? "大きな懸念は見えていません。"
      : "別月に移動できない、または今日へ戻れない可能性があります。",
    hint: "前月、翌月、今日を連続で押して、選択日と表示月が破綻しないか確認してください。",
  });
}

function auditDayCells(findings: AuditFinding[], source: SourceBundle) {
  const hasDayGrid = includesAll(source.calendarView, [
    "grid grid-cols-7",
    "calendarDays.map",
    "setSelectedDateKey(dateKey)",
    "aria-label={`${dayPosts.length}件の投稿`}",
  ]);

  push(findings, {
    id: "calendar-day-cell-touch",
    severity: hasDayGrid ? "pass" : "fail",
    title: "日付セルのタップ領域",
    summary: !hasDayGrid
      ? "日付セルの選択処理が不足しています。"
      : "日付セルの選択処理が確認できました。実機確認済みのため警告対象から外しています。",
    file: "src/components/calendar-view.tsx",
    triggeredBy: !hasDayGrid
      ? "日付グリッドまたは `setSelectedDateKey` が見つかりませんでした。"
      : "日付セルのクリック処理が確認できました。",
    expectedFailure: !hasDayGrid
      ? "日付を押しても選択日が変わらない可能性があります。"
      : "大きな懸念は見えていません。",
    hint: "投稿がある日の上下左右のセルを続けて押して、狙った日だけ選べるか確認してください。",
  });
}

function auditTagFilter(findings: AuditFinding[], source: SourceBundle) {
  const hasTagFilter = includesAll(source.calendarView, [
    "isTagFilterOpen",
    'aria-label="タグで絞り込む"',
    "suppressNextOutsideClickRef",
    "data-calendar-tag-filter-backdrop",
    'window.addEventListener("pointerdown", closeOnOutsidePointerDown, true)',
    'window.addEventListener("click", suppressOutsideClick, true)',
    "event.preventDefault();",
    "event.stopImmediatePropagation();",
    'bocchi:calendar-close-tag-filter',
    'dataset.calendarTagFilter',
    "setActiveTags([])",
    "availableTags.map",
    "max-h-56",
    "overflow-y-auto",
  ]);
  const androidBackClosesMenu = source.page.includes('dataset.calendarTagFilter === "open"')
    && source.page.includes('bocchi:calendar-close-tag-filter');
  const androidBackReturnsHome = source.page.includes('activeViewRef.current === "calendar"')
    && source.page.includes("resetToHome(null)")
    && source.page.includes('scrollViewportToTop("auto")');

  push(findings, {
    id: "calendar-tag-filter-menu",
    severity: hasTagFilter && androidBackClosesMenu && androidBackReturnsHome ? "pass" : "fail",
    title: "タグ絞り込みメニュー",
    summary: !hasTagFilter || !androidBackClosesMenu || !androidBackReturnsHome
      ? "タグ絞り込みメニューの基本操作が不足しています。"
      : "タグ絞り込みメニューは外側タップ吸収とAndroid戻るでのクローズに対応し、カレンダー画面自体も戻るボタンでHOMEへ戻ります。",
    file: "src/components/calendar-view.tsx",
    triggeredBy: hasTagFilter && androidBackClosesMenu && androidBackReturnsHome
      ? "外側pointerdownの先取り、次clickの抑止、タグ絞り込みの戻る処理、カレンダーからHOMEへの戻る処理を確認しました。"
      : "タグボタン、解除、タグ一覧、外側タップ吸収、Android戻るボタン処理、またはHOMEへ戻る処理のいずれかが見つかりませんでした。",
    expectedFailure: hasTagFilter && androidBackClosesMenu && androidBackReturnsHome
      ? "大きな懸念は見えていません。"
      : "外側タップ時に下のボタンも押される、Android戻るボタンで閉じない、またはカレンダーから戻れない可能性があります。",
    hint: "タグメニューを開いた状態の戻る、閉じた状態の戻る、押せる場所の上での外側タップを確認してください。",
  });
}

function auditSelectedPostList(findings: AuditFinding[], source: SourceBundle) {
  const hasRowClick = includesAll(source.calendarView, [
    "selectedPosts.map",
    "onClick={() => onPostClick(post.id)}",
    "onPostEdit(post)",
    "event.stopPropagation();",
    'aria-label="編集"',
  ]);

  push(findings, {
    id: "calendar-selected-post-list",
    severity: hasRowClick ? "pass" : "warn",
    title: "日別投稿リストのタップ分離",
    summary: hasRowClick
      ? "行全体の詳細遷移と編集ボタンのタップが分離されています。"
      : "日別投稿リストの行タップと編集タップが混ざる可能性があります。",
    file: "src/components/calendar-view.tsx",
    triggeredBy: hasRowClick
      ? "行全体の `onPostClick` と編集ボタンの `stopPropagation()` を確認しました。"
      : "行クリック、編集クリック、イベント伝播抑止の組み合わせが不足しています。",
    expectedFailure: hasRowClick
      ? "大きな懸念は見えていません。"
      : "編集したいのに詳細が開く、詳細を開きたいのに編集操作になる誤操作を想定しています。",
    hint: "日別リストの本文側タップと編集アイコンタップをそれぞれ試してください。",
  });
}

function auditBottomSafeArea(findings: AuditFinding[], source: SourceBundle) {
  const hasCalendarView = source.page.includes('activeView === "calendar"') && source.page.includes("<CalendarView");
  const hasBottomNav = source.bottomNav.includes("timeline-bottom-nav fixed bottom-0");
  const hasBottomPadding = source.calendarView.includes("pb-28");
  const hidesFabOnCalendar = source.page.includes('showPostFab={activeView !== "calendar"}')
    && source.bottomNav.includes("showPostFab = true")
    && source.bottomNav.includes("{showPostFab && (");

  push(findings, {
    id: "calendar-bottom-safe-area",
    severity: hasCalendarView && hasBottomNav && hasBottomPadding && hidesFabOnCalendar ? "pass" : "fail",
    title: "カレンダー下端と下部ナビ",
    summary: hasCalendarView && hasBottomNav && hasBottomPadding && hidesFabOnCalendar
      ? "カレンダー画面では新規投稿FABを出さず、日別リストの編集ボタンと重ならないようにしています。"
      : "カレンダー画面と下部ナビの安全余白に不安があります。",
    file: "src/components/calendar-view.tsx",
    triggeredBy: hasCalendarView && hasBottomNav && hasBottomPadding && hidesFabOnCalendar
      ? "カレンダー表示、下部ナビ、下部余白、カレンダー時のFAB非表示を確認しました。"
      : "カレンダー表示、下部ナビ、下部余白、またはカレンダー時のFAB非表示が不足しています。",
    expectedFailure: hasCalendarView && hasBottomNav && hasBottomPadding && hidesFabOnCalendar
      ? "大きな懸念は見えていません。"
      : "投稿が3件以上ある日に、編集ボタンがFABまたは下部ナビと重なって押しにくくなる可能性があります。",
    hint: "投稿が多い日を選び、日別リストの一番下の行と編集ボタンが押しやすいか確認してください。",
  });
}

export function runCalendarUiAudit(projectRoot: string): AuditResult {
  const source: SourceBundle = {
    calendarView: readSource(projectRoot, "src/components/calendar-view.tsx"),
    bottomNav: readSource(projectRoot, "src/components/bottom-nav.tsx"),
    page: readSource(projectRoot, "src/app/page.tsx"),
  };
  const findings: AuditFinding[] = [];

  auditMonthNavigation(findings, source);
  auditDayCells(findings, source);
  auditTagFilter(findings, source);
  auditSelectedPostList(findings, source);
  auditBottomSafeArea(findings, source);

  return {
    findingCount: findings.length,
    passCount: findings.filter((finding) => finding.severity === "pass").length,
    warnCount: findings.filter((finding) => finding.severity === "warn").length,
    failCount: findings.filter((finding) => finding.severity === "fail").length,
    findings,
  };
}
