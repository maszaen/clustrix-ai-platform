import { debounce } from '../utils/timing.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CHART_DAYS = 370;
const MODEL_COLOR_CACHE = new Map();
let lastResponse = null;

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseInputDate(value) {
  if (!value) return null;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  const [year, month, day] = parts;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  const end = startOfDay(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function generateDateRange(start, end) {
  const days = [];
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return days;
  }
  let current = startOfDay(start);
  const final = endOfDay(end);
  let safety = 0;
  while (current <= final && safety < MAX_CHART_DAYS) {
    days.push(formatInputDate(current));
    current = new Date(current.getTime() + DAY_MS);
    safety += 1;
  }
  return days;
}

function formatNumber(value, fractionDigits = 0) {
  const formatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits > 0 ? Math.min(1, fractionDigits) : 0,
  });
  return formatter.format(value);
}

function hashStringToHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

function getModelColor(model) {
  if (!model) {
    return '#8884d8';
  }
  if (MODEL_COLOR_CACHE.has(model)) {
    return MODEL_COLOR_CACHE.get(model);
  }
  const hue = hashStringToHue(model);
  const color = `hsl(${hue}, 65%, 55%)`;
  MODEL_COLOR_CACHE.set(model, color);
  return color;
}

function computeAxisTicks(maxValue) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return [0, 1, 2, 3, 4];
  }
  const baseStep = Math.ceil(maxValue / 4);
  const ticks = [];
  for (let i = 0; i <= 4; i += 1) {
    ticks.push(baseStep * i);
  }
  return ticks;
}

function normalizeEntries(entries = []) {
  const grouped = new Map();
  const colorMap = new Map();
  let maxTokens = 0;

  for (const entry of entries) {
    const { date, provider, model, tokens } = entry;
    if (!date || !provider || !model) continue;
    const safeTokens = Number(tokens) || 0;
    if (safeTokens > maxTokens) {
      maxTokens = safeTokens;
    }
    if (!grouped.has(date)) {
      grouped.set(date, new Map());
    }
    const providerMap = grouped.get(date);
    if (!providerMap.has(provider)) {
      providerMap.set(provider, []);
    }
    providerMap.get(provider).push({ ...entry, tokens: safeTokens });
    if (!colorMap.has(model)) {
      colorMap.set(model, getModelColor(model));
    }
  }

  for (const providerMap of grouped.values()) {
    for (const [provider, modelEntries] of providerMap.entries()) {
      modelEntries.sort((a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model));
      providerMap.set(provider, modelEntries);
    }
  }

  return { grouped, colorMap, maxTokens };
}

function showTooltip(tooltip, modalCard, event, entry) {
  if (!tooltip || !modalCard || !event || !entry) return;
  tooltip.innerHTML = `
    <div class="usage-tooltip-line"><strong>${entry.model}</strong></div>
    <div class="usage-tooltip-line">Provider: ${entry.provider}</div>
    <div class="usage-tooltip-line">Tokens: ${formatNumber(entry.tokens)}</div>
    <div class="usage-tooltip-line">Date: ${entry.date}</div>
  `;
  const rect = modalCard.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  let left = event.clientX - rect.left + 12;
  let top = event.clientY - rect.top + 12;

  if (left + tooltipRect.width > rect.width) {
    left = rect.width - tooltipRect.width - 12;
  }
  if (top + tooltipRect.height > rect.height) {
    top = rect.height - tooltipRect.height - 12;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.remove('hidden');
}

function hideTooltip(tooltip) {
  if (!tooltip) return;
  tooltip.classList.add('hidden');
}

function updateProviderOptions(selectEl, providers, current) {
  if (!selectEl) return;
  const unique = Array.from(new Set([...(providers || [])].filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const options = ['all', ...unique];
  const previousValue = current || selectEl.value || 'all';
  selectEl.innerHTML = options
    .map((value) => {
      if (value === 'all') {
        return '<option value="all">All providers</option>';
      }
      const safeValue = value.replace(/"/g, '&quot;');
      return `<option value="${safeValue}">${safeValue}</option>`;
    })
    .join('');
  if (options.includes(previousValue)) {
    selectEl.value = previousValue;
  } else {
    selectEl.value = 'all';
  }
}

function formatSummaryItem(item) {
  if (!item || !item.name) {
    return '—';
  }
  return `${item.name} ${formatNumber(item.tokens)} tokens`;
}

function updateSummary(summarySection, summary) {
  if (!summarySection) return;
  const totalEl = summarySection.querySelector('#usage-total-tokens');
  const modelEl = summarySection.querySelector('#usage-top-model');
  const providerEl = summarySection.querySelector('#usage-top-provider');
  const averageEl = summarySection.querySelector('#usage-average-daily');

  const total = Number(summary?.totalTokens) || 0;
  const average = Number(summary?.averageDailyTokens) || 0;

  if (totalEl) totalEl.textContent = formatNumber(total);
  if (modelEl) modelEl.textContent = formatSummaryItem(summary?.mostUsedModel);
  if (providerEl) providerEl.textContent = formatSummaryItem(summary?.mostUsedProvider);
  if (averageEl) averageEl.textContent = `${formatNumber(average, average >= 100 ? 0 : 1)} tokens`;
}

function renderLegend(legendContainer, colorMap) {
  if (!legendContainer) return;
  legendContainer.innerHTML = '';
  const entries = Array.from(colorMap.entries());
  if (entries.length === 0) {
    legendContainer.classList.add('hidden');
    return;
  }
  legendContainer.classList.remove('hidden');
  for (const [model, color] of entries.sort((a, b) => a[0].localeCompare(b[0]))) {
    const item = document.createElement('div');
    item.className = 'usage-legend-item';
    item.innerHTML = `<span class="usage-legend-color" style="background:${color}"></span>${model}`;
    legendContainer.appendChild(item);
  }
}

function renderChart({
  chartContainer,
  barsContainer,
  axisContainer,
  yAxisContainer,
  legendContainer,
  tooltip,
  modalCard,
}, entries, range) {
  if (!chartContainer || !barsContainer || !axisContainer || !yAxisContainer) {
    return;
  }
  const startDate = range?.start ? new Date(range.start) : null;
  const endDate = range?.end ? new Date(range.end) : null;
  const dateSeries = startDate && endDate ? generateDateRange(startDate, endDate) : [];

  const { grouped, colorMap, maxTokens } = normalizeEntries(entries);
  renderLegend(legendContainer, colorMap);

  if (dateSeries.length === 0) {
    barsContainer.innerHTML = '';
    axisContainer.innerHTML = '';
    yAxisContainer.innerHTML = '';
    chartContainer.classList.add('empty');
    hideTooltip(tooltip);
    return;
  }
  chartContainer.classList.remove('empty');

  barsContainer.innerHTML = '';
  axisContainer.innerHTML = '';
  yAxisContainer.innerHTML = '';

  const ticks = computeAxisTicks(maxTokens);
  const maxTick = ticks[ticks.length - 1] || 1;

  for (let i = ticks.length - 1; i >= 0; i -= 1) {
    const tickValue = ticks[i];
    const tickEl = document.createElement('div');
    tickEl.className = 'usage-y-tick';
    tickEl.textContent = formatNumber(tickValue);
    tickEl.dataset.value = tickValue;
    yAxisContainer.appendChild(tickEl);
  }

  const chartHeight = maxTick > 0 ? maxTick : 1;

  for (const dateKey of dateSeries) {
    const dayColumn = document.createElement('div');
    dayColumn.className = 'usage-day-column';
    const providerWrapper = document.createElement('div');
    providerWrapper.className = 'usage-provider-groups';

    const providerMap = grouped.get(dateKey);
    if (providerMap) {
      const providers = Array.from(providerMap.keys()).sort((a, b) => a.localeCompare(b));
      for (const provider of providers) {
        const wrapper = document.createElement('div');
        wrapper.className = 'usage-provider-wrapper';

        const providerGroup = document.createElement('div');
        providerGroup.className = 'usage-provider-group';

        for (const entry of providerMap.get(provider)) {
          const bar = document.createElement('div');
          bar.className = 'usage-bar';
          const heightPercent = chartHeight > 0 ? (entry.tokens / chartHeight) * 100 : 0;
          bar.style.height = `${Math.max(heightPercent, entry.tokens > 0 ? 2 : 0)}%`;
          bar.style.background = colorMap.get(entry.model) || getModelColor(entry.model);
          bar.dataset.model = entry.model;
          bar.dataset.provider = provider;
          bar.dataset.tokens = entry.tokens;
          bar.dataset.date = entry.date;

          bar.addEventListener('mouseenter', (event) => {
            showTooltip(tooltip, modalCard, event, entry);
          });
          bar.addEventListener('mousemove', (event) => {
            showTooltip(tooltip, modalCard, event, entry);
          });
          bar.addEventListener('mouseleave', () => {
            hideTooltip(tooltip);
          });

          providerGroup.appendChild(bar);
        }

        const providerLabel = document.createElement('span');
        providerLabel.className = 'usage-provider-label';
        providerLabel.textContent = provider;

        wrapper.appendChild(providerGroup);
        wrapper.appendChild(providerLabel);
        providerWrapper.appendChild(wrapper);
      }
    } else {
      dayColumn.classList.add('usage-day-column--empty');
    }

    const dayLabel = document.createElement('span');
    dayLabel.className = 'usage-day-label';
    const parsed = parseInputDate(dateKey);
    dayLabel.textContent = parsed ? String(parsed.getDate()) : dateKey;

    dayColumn.appendChild(providerWrapper);
    dayColumn.appendChild(dayLabel);
    barsContainer.appendChild(dayColumn);
  }
}

function setLoadingState({ loadingEl, summaryEl, chartEl }, isLoading) {
  if (loadingEl) {
    loadingEl.classList.toggle('hidden', !isLoading);
  }
  if (summaryEl) {
    summaryEl.classList.toggle('loading', isLoading);
  }
  if (chartEl) {
    chartEl.classList.toggle('loading', isLoading);
  }
}

function showFeedback(feedbackEl, message, type = 'info') {
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.dataset.type = type;
  feedbackEl.classList.remove('hidden');
}

function clearFeedback(feedbackEl) {
  if (!feedbackEl) return;
  feedbackEl.textContent = '';
  feedbackEl.dataset.type = '';
  feedbackEl.classList.add('hidden');
}

function computePreset(preset) {
  const now = new Date();
  const today = startOfDay(now);
  switch (preset) {
    case 'last-7-days': {
      const start = new Date(today.getTime() - 6 * DAY_MS);
      return { start, end: today };
    }
    case 'last-30-days': {
      const start = new Date(today.getTime() - 29 * DAY_MS);
      return { start, end: today };
    }
    case 'current-month':
    default: {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0));
      return { start, end };
    }
  }
}

function exportCsv(data) {
  if (!data || !Array.isArray(data.entries) || data.entries.length === 0) {
    return;
  }
  const rows = [];
  rows.push(['Summary']);
  rows.push(['Total Tokens', data.summary ? data.summary.totalTokens : 0]);
  rows.push(['Average Daily Tokens', data.summary ? data.summary.averageDailyTokens : 0]);
  rows.push(['Most Used Model', data.summary?.mostUsedModel?.name || '', data.summary?.mostUsedModel?.tokens || '']);
  rows.push(['Most Used Provider', data.summary?.mostUsedProvider?.name || '', data.summary?.mostUsedProvider?.tokens || '']);
  rows.push([]);
  rows.push(['Date', 'Provider', 'Model', 'Tokens']);
  for (const entry of data.entries) {
    rows.push([entry.date, entry.provider, entry.model, entry.tokens]);
  }
  const csvContent = rows
    .map((row) => row
      .map((cell) => {
        const value = cell === null || cell === undefined ? '' : String(cell);
        if (/[",\n]/.test(value)) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = formatInputDate(new Date()).replace(/-/g, '');
  link.href = url;
  link.download = `usage-statistics-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function initializeUsageStatistics({ openModal, closeModal, closeDropdown, log }) {
  const modal = document.getElementById('usage-stats-modal');
  const modalCard = modal?.querySelector('.modal-card');
  const openButton = document.getElementById('open-usage-stats');
  const closeButton = document.getElementById('close-usage-stats');
  const overlay = modal?.querySelector('.modal-overlay');
  const providerSelect = document.getElementById('usage-filter-provider');
  const rangeSelect = document.getElementById('usage-filter-range');
  const startInput = document.getElementById('usage-filter-start');
  const endInput = document.getElementById('usage-filter-end');
  const resetButton = document.getElementById('usage-filter-reset');
  const exportButton = document.getElementById('usage-export-csv');
  const feedbackEl = document.getElementById('usage-feedback');
  const loadingEl = document.getElementById('usage-loading');
  const summaryEl = document.getElementById('usage-summary');
  const chartContainer = document.getElementById('usage-chart-container');
  const barsContainer = document.getElementById('usage-bars');
  const axisContainer = document.getElementById('usage-x-axis');
  const yAxisContainer = document.getElementById('usage-y-axis');
  const legendContainer = document.getElementById('usage-legend');
  const tooltip = document.getElementById('usage-tooltip');

  if (!modal || !openButton || !closeButton || !rangeSelect || !startInput || !endInput) {
    return;
  }

  const state = {
    provider: 'all',
    rangePreset: 'last-30-days',
    startDate: '',
    endDate: '',
  };

  const fetchStats = async () => {
    if (!window.api?.usage?.fetchStats) {
      showFeedback(feedbackEl, 'Usage statistics are available in the desktop application.', 'error');
      if (typeof log === 'function') {
        log('USAGE_STATS', 2, 'fetchStats', 'usage.fetchStats bridge unavailable');
      }
      return;
    }

    setLoadingState({ loadingEl, summaryEl, chartEl: chartContainer }, true);
    if (exportButton) {
      exportButton.disabled = true;
    }
    clearFeedback(feedbackEl);

    const filters = {
      startDate: state.startDate,
      endDate: state.endDate,
    };
    if (state.provider && state.provider !== 'all') {
      filters.provider = state.provider;
    }

    try {
      const response = await window.api.usage.fetchStats(filters);
      lastResponse = response;
      updateProviderOptions(providerSelect, response.providers, state.provider);
      state.provider = providerSelect.value || 'all';
      updateSummary(summaryEl, response.summary || {});
      summaryEl?.classList.remove('hidden');
      renderChart({
        chartContainer,
        barsContainer,
        axisContainer,
        yAxisContainer,
        legendContainer,
        tooltip,
        modalCard,
      }, response.entries || [], response.range);
      chartContainer?.classList.remove('hidden');

      if (!response.entries || response.entries.length === 0) {
        showFeedback(feedbackEl, 'No usage data for the selected filters.', 'empty');
        if (exportButton) {
          exportButton.disabled = true;
        }
      } else {
        clearFeedback(feedbackEl);
        if (exportButton) {
          exportButton.disabled = false;
        }
      }
    } catch (error) {
      showFeedback(feedbackEl, 'Failed to load usage data. Please try again.', 'error');
      if (typeof log === 'function') {
        log('USAGE_STATS', 3, 'fetchStats', 'Failed to fetch usage statistics', { error: error.message });
      }
      if (exportButton) {
        exportButton.disabled = true;
      }
    } finally {
      setLoadingState({ loadingEl, summaryEl, chartEl: chartContainer }, false);
    }
  };

  const debouncedFetch = debounce(fetchStats, 200);

  function applyPreset(preset, { skipFetch = false } = {}) {
    state.rangePreset = preset;
    rangeSelect.value = preset;
    const { start, end } = computePreset(preset);
    startInput.disabled = preset !== 'custom';
    endInput.disabled = preset !== 'custom';
    const startDate = start || new Date();
    const endDate = end || new Date();
    state.startDate = formatInputDate(startOfDay(startDate));
    state.endDate = formatInputDate(startOfDay(endDate));
    startInput.value = state.startDate;
    endInput.value = state.endDate;
    if (!skipFetch) {
      debouncedFetch();
    }
  }

  function handleCustomDateChange() {
    state.rangePreset = 'custom';
    rangeSelect.value = 'custom';
    startInput.disabled = false;
    endInput.disabled = false;

    let startDate = parseInputDate(startInput.value) || parseInputDate(state.startDate) || new Date();
    let endDate = parseInputDate(endInput.value) || parseInputDate(state.endDate) || new Date();

    if (startDate > endDate) {
      endDate = startDate;
      endInput.value = formatInputDate(endDate);
    }

    state.startDate = formatInputDate(startDate);
    state.endDate = formatInputDate(endDate);
    startInput.value = state.startDate;
    endInput.value = state.endDate;
    debouncedFetch();
  }

  function resetFilters({ skipFetch = false } = {}) {
    state.provider = 'all';
    providerSelect.value = 'all';
    applyPreset('last-30-days', { skipFetch: true });
    if (!skipFetch) {
      debouncedFetch();
    }
  }

  openButton.addEventListener('click', () => {
    if (typeof closeDropdown === 'function') {
      closeDropdown('#settings-menu');
    }
    resetFilters({ skipFetch: true });
    if (typeof openModal === 'function') {
      openModal(modal);
    } else {
      modal.classList.remove('hidden');
    }
    debouncedFetch();
  });

  closeButton.addEventListener('click', () => {
    hideTooltip(tooltip);
    if (typeof closeModal === 'function') {
      closeModal(modal);
    } else {
      modal.classList.add('hidden');
    }
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      hideTooltip(tooltip);
      if (typeof closeModal === 'function') {
        closeModal(modal);
      } else {
        modal.classList.add('hidden');
      }
    });
  }

  providerSelect.addEventListener('change', () => {
    state.provider = providerSelect.value || 'all';
    debouncedFetch();
  });

  rangeSelect.addEventListener('change', () => {
    const value = rangeSelect.value || 'current-month';
    applyPreset(value);
  });

  startInput.addEventListener('change', handleCustomDateChange);
  endInput.addEventListener('change', handleCustomDateChange);

  resetButton?.addEventListener('click', () => {
    resetFilters();
  });

  exportButton?.addEventListener('click', () => {
    if (lastResponse && lastResponse.entries && lastResponse.entries.length > 0) {
      exportCsv(lastResponse);
    }
  });
}
