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

function updateModelOptions(selectEl, models, current) {
  if (!selectEl) return;
  const unique = Array.from(new Set([...(models || [])].filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const options = ['all', ...unique];
  const previousValue = current || selectEl.value || 'all';
  selectEl.innerHTML = options
    .map((value) => {
      if (value === 'all') {
        return '<option value="all">All models</option>';
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
  return item.name;
}

function formatTokens(tokens) {
  return formatNumber(tokens);
}

function updateSummary(summarySection, summary, selectedProvider = 'all', selectedModel = 'all') {
  if (!summarySection) return;
  const totalEl = summarySection.querySelector('#usage-total-tokens');
  const modelEl = summarySection.querySelector('#usage-top-model');
  const modelTokensEl = summarySection.querySelector('#usage-top-model-tokens');
  const providerEl = summarySection.querySelector('#usage-top-provider');
  const providerTokensEl = summarySection.querySelector('#usage-top-provider-tokens');
  const providerLabelEl = summarySection.querySelector('[data-label-provider]');
  const averageEl = summarySection.querySelector('#usage-average-daily');

  const total = Number(summary?.totalTokens) || 0;
  const average = Number(summary?.averageDailyTokens) || 0;

  if (totalEl) totalEl.textContent = formatNumber(total);
  if (averageEl) averageEl.textContent = formatNumber(Math.round(average));
  
  // Update model card label and value
  const summaryCards = summarySection.querySelectorAll('.usage-summary-card');
  for (const card of summaryCards) {
    const modelLabel = card.querySelector('.usage-summary-label');
    const modelValue = card.querySelector('#usage-top-model');
    if (modelLabel && modelValue) {
      if (selectedModel && selectedModel !== 'all') {
        modelLabel.textContent = 'Selected model';
        // Update value to show selected model name
        modelValue.textContent = selectedModel;
      } else {
        modelLabel.textContent = 'Most used model';
        modelValue.textContent = formatSummaryItem(summary?.mostUsedModel);
      }
      break;
    }
  }
  
  if (modelTokensEl) modelTokensEl.textContent = formatTokens(summary?.mostUsedModel?.tokens || 0);

  // Update provider card label and value
  const providerCard = document.getElementById('usage-provider-card');
  if (providerCard) {
    const providerLabelSpan = providerCard.querySelector('.usage-summary-label');
    if (providerLabelSpan) {
      if (selectedProvider && selectedProvider !== 'all') {
        providerLabelSpan.textContent = 'Selected provider';
        // Update value to show selected provider name
        if (providerEl) providerEl.textContent = selectedProvider;
      } else {
        providerLabelSpan.textContent = 'Most used provider';
        if (providerEl) providerEl.textContent = formatSummaryItem(summary?.mostUsedProvider);
      }
    }
  }

  if (providerTokensEl) providerTokensEl.textContent = formatTokens(summary?.mostUsedProvider?.tokens || 0);
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
}, entries, range, modelFilter = 'all') {
  if (!chartContainer || !barsContainer || !axisContainer || !yAxisContainer) {
    return;
  }
  const startDate = range?.start ? new Date(range.start) : null;
  const endDate = range?.end ? new Date(range.end) : null;
  const dateSeries = startDate && endDate ? generateDateRange(startDate, endDate) : [];

  // Filter entries by model if modelFilter is set
  let filteredEntries = entries;
  if (modelFilter && modelFilter !== 'all') {
    filteredEntries = entries.filter(entry => entry.model === modelFilter);
  }

  const { grouped, colorMap, maxTokens } = normalizeEntries(filteredEntries);
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
  
  // Add 20% padding to chart height for better visibility
  const adjustedChartHeight = chartHeight * 1.2;

  for (const dateKey of dateSeries) {
    const dayColumn = document.createElement('div');
    dayColumn.className = 'usage-day-column';
    const providerWrapper = document.createElement('div');
    providerWrapper.className = 'usage-provider-groups';

    const providerMap = grouped.get(dateKey);
    if (providerMap) {
      const providers = Array.from(providerMap.keys()).sort((a, b) => a.localeCompare(b));
      
      // Create separate provider groups (one group per provider)
      for (const provider of providers) {
        const entries = providerMap.get(provider);
        
        // Sort entries by tokens (ASCENDING - smallest first for proper cumulative stacking)
        // Smallest will be calculated first and appear on top with highest z-index
        entries.sort((a, b) => a.tokens - b.tokens);
        
        // Calculate cumulative total for stacked bars
        const totalTokens = entries.reduce((sum, e) => sum + e.tokens, 0);
        let cumulativeTokens = 0;
        
        const providerGroup = document.createElement('div');
        providerGroup.className = 'usage-provider-group';

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          cumulativeTokens += entry.tokens;
          
          const bar = document.createElement('div');
          bar.className = 'usage-bar';
          
          // Height based on cumulative tokens with 20% extra vertical range
          const heightPercent = adjustedChartHeight > 0 ? (cumulativeTokens / adjustedChartHeight) * 100 : 0;
          bar.style.height = `${Math.max(heightPercent, cumulativeTokens > 0 ? 2 : 0)}%`;
          
          bar.style.background = colorMap.get(entry.model) || getModelColor(entry.model);
          bar.style.zIndex = entries.length - i; // Smallest bar on top (highest z-index)
          
          bar.dataset.model = entry.model;
          bar.dataset.provider = entry.provider;
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

        // Append provider group directly to provider groups wrapper
        providerWrapper.appendChild(providerGroup);
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
    model: 'all',
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
    clearFeedback(feedbackEl);

    const filters = {
      startDate: state.startDate,
      endDate: state.endDate,
    };
    if (state.provider && state.provider !== 'all') {
      filters.provider = state.provider;
    }
    if (state.model && state.model !== 'all') {
      filters.model = state.model;
    }

    try {
      const response = await window.api.usage.fetchStats(filters);
      lastResponse = response;
      updateProviderOptions(providerSelect, response.providers, state.provider);
      state.provider = providerSelect.value || 'all';
      
      // Always show model filter and populate with all models
      const modelFilterWrapper = document.getElementById('usage-filter-model-wrapper');
      const modelSelect = document.getElementById('usage-filter-model');
      if (modelFilterWrapper && modelSelect) {
        modelFilterWrapper.style.display = 'flex';
        // Populate model options (all models or filtered by provider)
        updateModelOptions(modelSelect, response.models || [], state.model);
        state.model = modelSelect.value || 'all';
      }
      
      // Store model-to-provider mapping for auto-switching
      state.modelToProvider = response.modelToProvider || {};
      
      updateSummary(summaryEl, response.summary || {}, state.provider, state.model);
      summaryEl?.classList.remove('hidden');
      renderChart({
        chartContainer,
        barsContainer,
        axisContainer,
        yAxisContainer,
        legendContainer,
        tooltip,
        modalCard,
      }, response.entries || [], response.range, state.model);
      chartContainer?.classList.remove('hidden');

      if (!response.entries || response.entries.length === 0) {
        showFeedback(feedbackEl, 'No usage data for the selected filters.', 'empty');
      } else {
        clearFeedback(feedbackEl);
      }
    } catch (error) {
      showFeedback(feedbackEl, 'Failed to load usage data. Please try again.', 'error');
      if (typeof log === 'function') {
        log('USAGE_STATS', 3, 'fetchStats', 'Failed to fetch usage statistics', { error: error.message });
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
    state.model = 'all';
    providerSelect.value = 'all';
    const modelSelect = document.getElementById('usage-filter-model');
    if (modelSelect) {
      modelSelect.value = 'all';
    }
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
    // Reset model selection when provider changes
    state.model = 'all';
    debouncedFetch();
  });

  const modelSelect = document.getElementById('usage-filter-model');
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      const selectedModel = modelSelect.value || 'all';
      state.model = selectedModel;
      
      // If model is selected and provider is 'all', auto-switch to model's provider
      if (selectedModel !== 'all' && state.provider === 'all') {
        const modelProvider = state.modelToProvider?.[selectedModel];
        if (modelProvider) {
          state.provider = modelProvider;
          providerSelect.value = modelProvider;
        }
      }
      
      debouncedFetch();
    });
  }

  rangeSelect.addEventListener('change', () => {
    const value = rangeSelect.value || 'current-month';
    applyPreset(value);
  });

  startInput.addEventListener('change', handleCustomDateChange);
  endInput.addEventListener('change', handleCustomDateChange);

  resetButton?.addEventListener('click', () => {
    resetFilters();
  });
}
