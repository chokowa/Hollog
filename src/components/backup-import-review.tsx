"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, FileText, ImageOff, Link, Settings, Tags, X } from "lucide-react";
import { AppButton } from "@/components/ui/app-button";
import type { ImportConflict, ImportConflictChoice, ImportPostsPreview } from "@/hooks/use-posts";

type BackupImportReviewProps = {
  backupPostCount: number;
  preview: ImportPostsPreview;
  choices: Record<string, ImportConflictChoice>;
  isBusy: boolean;
  onChoiceChange: (key: string, choice: ImportConflictChoice) => void;
  onConfirm: () => void;
  onConfirmAll: (choice: ImportConflictChoice) => void;
  onCancel: () => void;
};

type ConflictSelectionMode = "all-existing" | "all-imported" | "individual";
type ConflictStepView = "mode" | "individual";

const fieldLabels: Record<ImportConflict["fields"][number], string> = {
  body: "本文",
  url: "URL",
  ogp: "プレビュー",
};

function summarizeBodyShort(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "（本文なし）";
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed;
}

function summarizeOgp(conflict: ImportConflict, side: "existing" | "imported") {
  const ogp = conflict[side].ogp;
  if (!ogp) return "（プレビューなし）";
  return [ogp.title, ogp.description, ogp.siteName].filter(Boolean).join(" / ") || "（プレビューなし）";
}

function formatDifferenceTitle(fields: ImportConflict["fields"]) {
  if (fields.length === 1) return `${fieldLabels[fields[0]]}に違いがあります`;
  if (fields.length === 2) return `${fieldLabels[fields[0]]}と${fieldLabels[fields[1]]}に違いがあります`;
  return "内容に違いがあります";
}

function getConflictPreviewText(conflict: ImportConflict) {
  if (conflict.existing.body.trim() || conflict.imported.body.trim()) {
    return summarizeBodyShort(conflict.existing.body || conflict.imported.body);
  }
  if (conflict.existing.url || conflict.imported.url) {
    return conflict.existing.url || conflict.imported.url;
  }
  return summarizeOgp(conflict, conflict.existing.ogp ? "existing" : "imported");
}

function getSidePreviewText(conflict: ImportConflict, side: "existing" | "imported") {
  if (conflict.fields.includes("body")) {
    return summarizeBodyShort(conflict[side].body);
  }
  if (conflict.fields.includes("url")) {
    return conflict[side].url || "（URLなし）";
  }
  if (conflict.fields.includes("ogp")) {
    return summarizeOgp(conflict, side);
  }
  return getConflictPreviewText(conflict);
}

function RestoreCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-border bg-card/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {title ? <p className="mb-3 text-sm font-semibold text-foreground">{title}</p> : null}
      {children}
    </div>
  );
}

function StepRail({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <aside className="hidden w-16 shrink-0 justify-center px-3 py-5 sm:flex">
      <div className="relative flex flex-col items-center gap-12">
        <div className="absolute bottom-8 top-8 w-px bg-border" />
        {Array.from({ length: totalSteps }, (_, index) => {
          const active = index === currentStep;
          const done = index < currentStep;
          return (
            <div
              key={index}
              className={`relative z-10 grid h-11 w-11 place-items-center rounded-full border text-sm font-semibold transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-[0_0_24px_rgba(139,92,246,0.45)]"
                  : done
                    ? "border-primary/70 bg-primary/20 text-primary"
                    : "border-border bg-background text-muted-foreground"
              }`}
            >
              {done ? <Check size={17} /> : index + 1}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function StepHeader({
  step,
  totalSteps,
  title,
  description,
}: {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-border bg-card/70 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold text-muted-foreground">
          {step}/{totalSteps}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function BackupImportReview({
  backupPostCount,
  preview,
  choices,
  isBusy,
  onChoiceChange,
  onConfirm,
  onConfirmAll,
  onCancel,
}: BackupImportReviewProps) {
  const totalSteps = 5;
  const [currentStep, setCurrentStep] = useState(0);
  const [selectionMode, setSelectionMode] = useState<ConflictSelectionMode | null>(null);
  const [conflictStepView, setConflictStepView] = useState<ConflictStepView>("mode");

  const conflicts = preview.conflicts;
  const currentConflict = conflicts[0];
  const replaceCount = conflicts.filter((conflict) => choices[conflict.key] === "use-imported").length;
  const keepCount = preview.conflictCount - replaceCount;
  const unchangedCount = preview.duplicateCount - preview.conflictCount;
  const stepOneLines = [
    `同じ内容 ${Math.max(unchangedCount, 0)}件`,
    `確認が必要 ${preview.conflictCount}件`,
    `新しく追加 ${preview.addedCount}件`,
  ].filter(Boolean);
  const finalSummaryRows = [
    { label: "バックアップ内の投稿", value: `${backupPostCount}件` },
    { label: "同じ内容のため変更なし", value: `${Math.max(unchangedCount, 0)}件` },
    { label: "今のアプリの内容を残す", value: `${Math.max(keepCount, 0)}件` },
    { label: "バックアップの内容にする", value: `${replaceCount}件` },
    { label: "バックアップから追加", value: `${preview.addedCount}件` },
  ];

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const goToNextStep = () => {
    if (currentStep === 2 && conflictStepView === "mode" && selectionMode === "individual") {
      setConflictStepView("individual");
      return;
    }
    setCurrentStep((step) => Math.min(totalSteps - 1, step + 1));
  };

  const goToPrevStep = () => {
    if (currentStep === 2 && conflictStepView === "individual") {
      setConflictStepView("mode");
      return;
    }
    setCurrentStep((step) => Math.max(0, step - 1));
  };

  const handleSelectionModeChange = (mode: ConflictSelectionMode) => {
    setSelectionMode(mode);
    if (mode === "all-existing") {
      onConfirmAll("keep-existing");
      setConflictStepView("mode");
      return;
    }
    if (mode === "all-imported") {
      onConfirmAll("use-imported");
      setConflictStepView("mode");
      return;
    }
    setConflictStepView("mode");
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-foreground/30 px-3 py-4 backdrop-blur-md sm:items-center">
      <section className="backup-restore-shell flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-border bg-background shadow-[0_28px_80px_rgba(0,0,0,0.55)] sm:h-[760px] sm:max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-border bg-background/90 px-5 py-5">
          <div className="min-w-9">
            <button
              type="button"
              onClick={onCancel}
              disabled={isBusy}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold tracking-[0] text-foreground">バックアップの復元</p>
            <p className="mt-1 text-xs text-muted-foreground">バックアップファイルを確認して、復元する内容を選びます</p>
          </div>
          <div className="w-9" />
        </div>

        <div className="flex min-h-0 flex-1">
          <StepRail currentStep={currentStep} totalSteps={totalSteps} />
          <div className="screen-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {currentStep === 0 && (
            <div>
              <StepHeader
                step={1}
                totalSteps={totalSteps}
                title="復元される内容"
                description="このバックアップで復元される内容と、復元されない内容を確認してください。"
              />
              <div className="space-y-4 px-5 py-5">
                <RestoreCard title="復元される">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { label: "投稿", icon: FileText },
                      { label: "タグ", icon: Tags },
                      { label: "URLとリンクのプレビュー", icon: Link },
                      { label: "表示設定", icon: Settings },
                    ].map(({ label, icon: Icon }) => (
                      <div key={label} className="flex items-center gap-3 rounded-2xl bg-secondary/75 px-3 py-3 text-sm text-foreground">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                          <Icon size={17} />
                        </span>
                        {label}
                      </div>
                    ))}
                  </div>
                </RestoreCard>
                <RestoreCard title="復元されない内容">
                  <div className="flex items-center gap-3 rounded-2xl bg-secondary/75 px-3 py-3 text-sm text-foreground">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
                      <ImageOff size={17} />
                    </span>
                    投稿に添付した写真・動画の本体
                  </div>
                </RestoreCard>
                <RestoreCard title="復元の手順">
                  <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
                    <p>1. バックアップの内容を確認します。</p>
                    <p>2. 同じ投稿がある場合、今のアプリかバックアップのどちらの内容を残すか選びます。</p>
                    <p>3. 最後に復元内容を確認して開始します。</p>
                  </div>
                </RestoreCard>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div>
              <StepHeader
                step={2}
                totalSteps={totalSteps}
                title="バックアップの確認"
                description="まず、このバックアップに何件の投稿が入っているかを確認します。"
              />
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-[22px] border border-border bg-card/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="text-sm text-muted-foreground">バックアップ内の投稿</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{backupPostCount}件</p>
                </div>
                <RestoreCard>
                  <div className="divide-y divide-border">
                    {stepOneLines.map((line, index) => (
                      <div key={line} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <span className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
                            {index === 0 ? <Check size={16} /> : index === 1 ? <AlertTriangle size={16} /> : <FileText size={16} />}
                          </span>
                          {line.replace(/\s\d+件$/, "")}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{line.match(/\d+件$/)?.[0]}</span>
                      </div>
                    ))}
                  </div>
                </RestoreCard>
              </div>
            </div>
          )}

          {currentStep === 2 && preview.conflictCount === 0 && (
            <div>
              <StepHeader
                step={3}
                totalSteps={totalSteps}
                title="確認が必要な投稿の選択"
                description="このバックアップには、選択が必要な投稿はありません。"
              />
              <div className="space-y-4 px-5 py-5">
                <RestoreCard title="選択は不要です">
                  <div className="flex items-start gap-3 rounded-2xl bg-secondary/75 p-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">すでにある投稿の内容がすべて一致しています。</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        今のアプリかバックアップを選ぶ必要はありません。このまま次へ進んでください。
                      </p>
                    </div>
                  </div>
                </RestoreCard>
              </div>
            </div>
          )}

          {currentStep === 2 && currentConflict && (
            <div>
              <StepHeader
                step={3}
                totalSteps={totalSteps}
                title={conflictStepView === "mode" ? "残す内容の選択" : "確認が必要な投稿の選択"}
                description={
                  conflictStepView === "mode"
                    ? "先に、違いがある投稿をどう扱うか選びます。"
                    : "一覧から投稿を選び、それぞれ残す内容を選びます。"
                }
              />
              <div className="space-y-4 px-5 py-5">
                {conflictStepView === "mode" ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => handleSelectionModeChange("all-existing")}
                      disabled={isBusy}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${
                        selectionMode === "all-existing"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:bg-muted/40"
                      } disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">すべて今のアプリの内容を残す</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            違いがある投稿は、今アプリにある内容をそのまま残します。
                          </p>
                        </div>
                        {selectionMode === "all-existing" ? (
                          <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
                            選択中
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectionModeChange("all-imported")}
                      disabled={isBusy}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${
                        selectionMode === "all-imported"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:bg-muted/40"
                      } disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">すべてバックアップの内容にする</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            違いがある投稿は、バックアップ内の内容に置き換えます。
                          </p>
                        </div>
                        {selectionMode === "all-imported" ? (
                          <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
                            選択中
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectionModeChange("individual")}
                      disabled={isBusy}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${
                        selectionMode === "individual"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:bg-muted/40"
                      } disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">個別に選ぶ</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            次の画面で投稿ごとに、今の内容かバックアップの内容を選びます。
                          </p>
                        </div>
                        {selectionMode === "individual" ? (
                          <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
                            選択中
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <RestoreCard title="投稿ごとに選択">
                      <div className="space-y-3">
                        {conflicts.map((conflict) => {
                          const selectedChoice = choices[conflict.key] ?? "keep-existing";
                          return (
                            <div
                              key={conflict.key}
                              className="rounded-[20px] border border-border bg-background/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground">{formatDifferenceTitle(conflict.fields)}</p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                                  selectedChoice === "use-imported"
                                    ? "bg-primary/20 text-primary"
                                    : "bg-secondary text-muted-foreground"
                                }`}>
                                  {selectedChoice === "use-imported" ? "バックアップ" : "今の内容"}
                                </span>
                              </div>
                              <div className="mt-3 grid gap-2">
                                <div className="rounded-2xl border border-border bg-card/75 p-3">
                                  <p className="text-[11px] font-semibold text-muted-foreground">今の内容</p>
                                  <p className="mt-1 break-words text-xs leading-relaxed text-foreground">
                                    {getSidePreviewText(conflict, "existing")}
                                  </p>
                                </div>
                                <div className="rounded-2xl border border-border bg-card/75 p-3">
                                  <p className="text-[11px] font-semibold text-muted-foreground">バックアップ</p>
                                  <p className="mt-1 break-words text-xs leading-relaxed text-foreground">
                                    {getSidePreviewText(conflict, "imported")}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => onChoiceChange(conflict.key, "keep-existing")}
                                  className={`min-h-11 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                                    selectedChoice === "keep-existing"
                                      ? "border-primary bg-primary/15 text-primary"
                                      : "border-border bg-card/80 text-foreground hover:bg-muted"
                                  }`}
                                >
                                  今の内容を残す
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onChoiceChange(conflict.key, "use-imported")}
                                  className={`min-h-11 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                                    selectedChoice === "use-imported"
                                      ? "border-primary bg-primary/15 text-primary"
                                      : "border-border bg-card/80 text-foreground hover:bg-muted"
                                  }`}
                                >
                                  バックアップの内容にする
                                </button>
                              </div>
                              {conflict.mergedTags.length > 0 ? (
                                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                                  復元後のタグ: {conflict.mergedTags.map((tag) => `#${tag}`).join(" ")}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </RestoreCard>
                    </div>
                )}

                {conflictStepView === "individual" ? null : null}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div>
              <StepHeader
                step={4}
                totalSteps={totalSteps}
                title="設定と復元されない内容"
                description="投稿以外に変わる内容と、復元されない内容を確認します。"
              />
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-[24px] border border-border bg-card p-4">
                  <p className="text-sm font-semibold text-foreground">表示設定はバックアップ時点に戻ります</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {["テーマ", "非表示タグ", "タグ候補", "投稿カードの並び順"].map((item) => (
                      <span key={item} className="rounded-full bg-secondary px-3 py-1.5">{item}</span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    テーマなどの表示設定も、バックアップに保存されている内容へ変わります。
                  </p>
                </div>
                <div className="rounded-[24px] border border-border bg-card p-4">
                  <p className="text-sm font-semibold text-foreground">復元されない内容</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    写真や動画の本体はバックアップに含まれていないため復元されません。
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div>
              <StepHeader
                step={5}
                totalSteps={totalSteps}
                title="最終確認して復元"
                description="復元内容を確認し、問題なければ開始します。"
              />
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-[24px] border border-border bg-card p-4">
                  <div className="space-y-3">
                    {finalSummaryRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-4">
                        <span className="text-sm text-muted-foreground">{row.label}</span>
                        <span className="text-sm font-semibold text-foreground">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[24px] border border-border bg-card p-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    表示設定はバックアップに保存されている内容へ変わります。写真や動画の本体は復元されません。
                  </p>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        <footer className="border-t border-border bg-background/90 px-5 py-4 sm:pl-[5.75rem]">
          {currentStep === 0 && (
            <AppButton type="button" block onClick={goToNextStep} disabled={isBusy}>
              内容を確認する
            </AppButton>
          )}

          {currentStep === 1 && (
            <div className="grid grid-cols-2 gap-2">
              <AppButton type="button" variant="ghost" onClick={goToPrevStep} disabled={isBusy}>
                前へ
              </AppButton>
              <AppButton type="button" onClick={goToNextStep} disabled={isBusy}>
                次へ
              </AppButton>
            </div>
          )}

          {currentStep === 2 && (
            <div className="grid grid-cols-2 gap-2">
              <AppButton type="button" variant="ghost" onClick={goToPrevStep} disabled={isBusy}>
                前へ
              </AppButton>
              <AppButton
                type="button"
                onClick={goToNextStep}
                disabled={isBusy || (preview.conflictCount > 0 && conflictStepView === "mode" && !selectionMode)}
              >
                {preview.conflictCount > 0 && conflictStepView === "mode" ? "この選び方で進む" : "次へ"}
              </AppButton>
            </div>
          )}

          {currentStep === 3 && (
            <div className="grid grid-cols-2 gap-2">
              <AppButton type="button" variant="ghost" onClick={goToPrevStep} disabled={isBusy}>
                前へ
              </AppButton>
              <AppButton type="button" onClick={goToNextStep} disabled={isBusy}>
                最終確認へ
              </AppButton>
            </div>
          )}

          {currentStep === 4 && (
            <div className="grid grid-cols-2 gap-2">
              <AppButton type="button" variant="ghost" onClick={goToPrevStep} disabled={isBusy}>
                戻る
              </AppButton>
              <AppButton type="button" onClick={onConfirm} disabled={isBusy}>
                復元を開始
              </AppButton>
              </div>
            )}
        </footer>
      </section>
    </div>
  );
}
