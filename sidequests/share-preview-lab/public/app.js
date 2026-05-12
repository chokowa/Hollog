const state = {
  runners: [],
  corpus: [],
  lastPayload: null,
  selectedRunnerForSolo: "",
};

const elements = {
  urlInput: document.querySelector("#urlInput"),
  intentTitleInput: document.querySelector("#intentTitleInput"),
  intentTextInput: document.querySelector("#intentTextInput"),
  runnerList: document.querySelector("#runnerList"),
  corpusList: document.querySelector("#corpusList"),
  modeSelect: document.querySelector("#modeSelect"),
  timeoutSelect: document.querySelector("#timeoutSelect"),
  runButton: document.querySelector("#runButton"),
  runSelectedButton: document.querySelector("#runSelectedButton"),
  runCorpusButton: document.querySelector("#runCorpusButton"),
  exportButton: document.querySelector("#exportButton"),
  results: document.querySelector("#results"),
  runMeta: document.querySelector("#runMeta"),
  resultTemplate: document.querySelector("#resultCardTemplate"),
};

function getSelectedRunnerIds() {
  return Array.from(document.querySelectorAll("[data-runner-checkbox]:checked")).map((input) => input.value);
}

function getSelectedCorpusItems() {
  return Array.from(document.querySelectorAll("[data-corpus-checkbox]:checked")).map((input) => {
    return state.corpus.find((item) => item.id === input.value);
  }).filter(Boolean);
}

function setBusy(isBusy) {
  elements.runButton.disabled = isBusy;
  elements.runSelectedButton.disabled = isBusy;
  elements.runCorpusButton.disabled = isBusy;
  elements.runButton.textContent = isBusy ? "実行中..." : "比較実行";
}

function runnerLabel(runnerId) {
  return state.runners.find((runner) => runner.id === runnerId)?.label || runnerId;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function renderRunners() {
  elements.runnerList.innerHTML = "";
  for (const runner of state.runners) {
    const label = document.createElement("label");
    label.className = "runner-option";
    label.innerHTML = `
      <input data-runner-checkbox type="checkbox" value="${runner.id}" checked>
      <span>
        <strong>${runner.label}</strong>
        <small>${runner.description}</small>
      </span>
    `;
    elements.runnerList.append(label);
  }
}

function renderCorpus() {
  elements.corpusList.innerHTML = "";
  for (const item of state.corpus) {
    const label = document.createElement("label");
    label.className = "corpus-item";
    label.innerHTML = `
      <input data-corpus-checkbox type="checkbox" value="${item.id}">
      <span>
        <strong>${item.label}</strong>
        <span>${item.category} · ${item.url}</span>
      </span>
    `;
    label.addEventListener("dblclick", () => {
      elements.urlInput.value = item.url;
    });
    elements.corpusList.append(label);
  }
}

function previewMarkup(normalized) {
  if (!normalized || !(normalized.title || normalized.description || normalized.image || normalized.siteName)) {
    return `<div class="empty-preview">プレビュー素材なし</div>`;
  }
  const site = escapeHtml(normalized.siteName || normalized.finalUrl || "");
  const title = escapeHtml(normalized.title || normalized.finalUrl || "");
  const description = escapeHtml(normalized.description || "");
  const image = normalized.image ? `<img class="preview-image" src="${escapeHtml(normalized.image)}" alt="">` : "";
  return `
    ${image}
    <div class="preview-body">
      ${site ? `<p class="preview-site">${site}</p>` : ""}
      ${title ? `<p class="preview-title">${title}</p>` : ""}
      ${description ? `<p class="preview-description">${description}</p>` : ""}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderResults(payload) {
  state.lastPayload = payload;
  elements.exportButton.disabled = false;
  elements.results.innerHTML = "";
  elements.runMeta.textContent = `${payload.input.url} · ${payload.input.mode} · ${payload.results.length} runner(s)`;

  for (const result of payload.results) {
    const card = elements.resultTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector("h3").textContent = runnerLabel(result.runnerId);
    card.querySelector(".runner-id").textContent = result.runnerId;
    const status = card.querySelector(".status");
    status.textContent = result.status;
    status.classList.add(result.status);
    card.querySelector(".preview").innerHTML = previewMarkup(result.normalized);
    const metrics = card.querySelector(".metrics");
    const metricPairs = [
      ["duration", `${result.durationMs}ms`],
      ["phase", result.phase || ""],
      ["finalUrl", result.normalized?.finalUrl || ""],
      ["image", result.normalized?.image ? "yes" : "no"],
      ["favicon", result.normalized?.favicon ? "yes" : "no"],
      ["error", result.error?.message || ""],
    ];
    for (const [key, value] of metricPairs) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = value || "-";
      metrics.append(dt, dd);
    }
    card.querySelector("pre").textContent = JSON.stringify({
      normalized: result.normalized,
      raw: result.raw,
      error: result.error,
    }, null, 2);
    card.addEventListener("click", (event) => {
      if (event.target.closest("details")) return;
      state.selectedRunnerForSolo = result.runnerId;
      elements.runMeta.textContent = `${runnerLabel(result.runnerId)} selected for solo rerun`;
    });
    elements.results.append(card);
  }
}

async function runComparison({ runnerIds, url } = {}) {
  const targetUrl = url || elements.urlInput.value.trim();
  if (!targetUrl) {
    elements.runMeta.textContent = "URLを入力してください。";
    return;
  }

  const selectedRunnerIds = runnerIds || getSelectedRunnerIds();
  if (selectedRunnerIds.length === 0) {
    elements.runMeta.textContent = "runnerを1つ以上選んでください。";
    return;
  }

  setBusy(true);
  elements.runMeta.textContent = "実行中...";
  try {
    const payload = await fetchJson("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: targetUrl,
        runnerIds: selectedRunnerIds,
        mode: elements.modeSelect.value,
        timeoutMs: Number(elements.timeoutSelect.value),
        intent: {
          title: elements.intentTitleInput.value,
          text: elements.intentTextInput.value,
        },
      }),
    });
    renderResults(payload);
  } catch (error) {
    elements.runMeta.textContent = `harness-error: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

async function runCorpus() {
  const items = getSelectedCorpusItems();
  if (items.length === 0) {
    elements.runMeta.textContent = "コーパスURLを1つ以上選んでください。";
    return;
  }

  const aggregate = {
    input: {
      url: `${items.length} corpus item(s)`,
      mode: elements.modeSelect.value,
      timeoutMs: Number(elements.timeoutSelect.value),
      runnerIds: getSelectedRunnerIds(),
    },
    corpus: [],
    results: [],
  };

  setBusy(true);
  elements.results.innerHTML = "";
  try {
    for (const item of items) {
      elements.runMeta.textContent = `${item.label} を実行中...`;
      const payload = await fetchJson("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: item.url,
          runnerIds: getSelectedRunnerIds(),
          mode: elements.modeSelect.value,
          timeoutMs: Number(elements.timeoutSelect.value),
        }),
      });
      aggregate.corpus.push(item);
      aggregate.results.push(...payload.results.map((result) => ({ ...result, corpusId: item.id, corpusLabel: item.label })));
    }
    renderResults(aggregate);
  } catch (error) {
    elements.runMeta.textContent = `harness-error: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

function exportLastPayload() {
  if (!state.lastPayload) return;
  const blob = new Blob([JSON.stringify(state.lastPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `share-preview-lab-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function init() {
  const [runnersPayload, corpusPayload] = await Promise.all([
    fetchJson("/api/runners"),
    fetchJson("/api/corpus"),
  ]);
  state.runners = runnersPayload.runners;
  state.corpus = corpusPayload.items;
  renderRunners();
  renderCorpus();
  elements.urlInput.value = state.corpus[0]?.url || "";

  elements.runButton.addEventListener("click", () => runComparison());
  elements.runSelectedButton.addEventListener("click", () => {
    const runnerId = state.selectedRunnerForSolo || getSelectedRunnerIds()[0];
    runComparison({ runnerIds: runnerId ? [runnerId] : [] });
  });
  elements.runCorpusButton.addEventListener("click", runCorpus);
  elements.exportButton.addEventListener("click", exportLastPayload);
}

init().catch((error) => {
  elements.runMeta.textContent = `harness-error: ${error.message}`;
});
