/**
 * Benchmark Statistics Module
 * Handles token speed benchmarking UI and visualization
 */

let log = console.log;
let openModal = null;
let closeModal = null;
let closeDropdown = null;

/**
 * Hash string to hue value for consistent colors
 */
function hashStringToHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
}

/**
 * Get color for a model (consistent across renders)
 */
function getModelColor(model) {
  const hue = hashStringToHue(model);
  const color = `hsl(${hue}, 65%, 55%)`;
  return color;
}

/**
 * Format speed value with appropriate precision
 */
function formatSpeed(speed) {
  if (speed === 0 || !Number.isFinite(speed)) {
    return '0';
  }
  if (speed < 1) {
    return speed.toFixed(2);
  }
  if (speed < 10) {
    return speed.toFixed(1);
  }
  return Math.round(speed).toString();
}

/**
 * Format number with thousand separators
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Render summary cards
 */
function renderSummary(summary) {
  const avgSpeedEl = document.getElementById('benchmark-avg-speed');
  const fastestModelEl = document.getElementById('benchmark-fastest-model');
  const fastestSpeedEl = document.getElementById('benchmark-fastest-speed');
  const slowestModelEl = document.getElementById('benchmark-slowest-model');
  const slowestSpeedEl = document.getElementById('benchmark-slowest-speed');
  const totalMessagesEl = document.getElementById('benchmark-total-messages');

  avgSpeedEl.textContent = formatSpeed(summary.averageSpeed);

  fastestModelEl.textContent = summary.fastestModel.name || 'N/A';
  if (summary.fastestModel.speed > 0) {
    fastestSpeedEl.textContent = `${formatSpeed(summary.fastestModel.speed)} tokens/sec`;
  } else {
    fastestSpeedEl.textContent = '';
  }

  slowestModelEl.textContent = summary.slowestModel.name || 'N/A';
  if (summary.slowestModel.speed > 0) {
    slowestSpeedEl.textContent = `${formatSpeed(summary.slowestModel.speed)} tokens/sec`;
  } else {
    slowestSpeedEl.textContent = '';
  }

  totalMessagesEl.textContent = formatNumber(summary.totalMessages);
}

/**
 * Render legend
 */
function renderLegend(models) {
  const legendEl = document.getElementById('benchmark-legend');
  legendEl.innerHTML = '';

  const sortedModels = [...models].sort((a, b) => a.localeCompare(b));

  for (const model of sortedModels) {
    const color = getModelColor(model);
    const item = document.createElement('div');
    item.className = 'benchmark-legend-item';
    item.innerHTML = `
      <div class="benchmark-legend-color" style="background: ${color};"></div>
      <span class="benchmark-legend-label">${model}</span>
    `;
    legendEl.appendChild(item);
  }
}

/**
 * Render chart using canvas
 */
function renderChart(elements, entries, range, modelFilter = 'all') {
  const { chartContainer, canvas, yAxisContainer, xAxisContainer, legendContainer } = elements;

  // Group entries by date
  const dateMap = new Map();
  for (const entry of entries) {
    if (modelFilter !== 'all' && entry.model !== modelFilter) {
      continue;
    }
    if (!dateMap.has(entry.date)) {
      dateMap.set(entry.date, []);
    }
    dateMap.get(entry.date).push(entry);
  }

  // Get all dates in range
  const dates = Array.from(dateMap.keys()).sort();
  if (dates.length === 0) {
    // Show no data message without destroying chart structure
    const noDataEl = document.getElementById('benchmark-no-data');
    if (noDataEl) {
      noDataEl.innerHTML = '<div>No benchmark data available for the selected filters.</div>';
      noDataEl.classList.remove('hidden');
    }
    chartContainer.classList.add('hidden');
    return;
  }

  // Hide no data message and show chart
  const noDataEl = document.getElementById('benchmark-no-data');
  if (noDataEl) {
    noDataEl.classList.add('hidden');
  }
  chartContainer.classList.remove('hidden');

  // Calculate max speed for Y-axis
  let maxSpeed = 0;
  for (const dateEntries of dateMap.values()) {
    for (const entry of dateEntries) {
      maxSpeed = Math.max(maxSpeed, entry.max);
    }
  }

  // Round up max speed to nice number
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxSpeed)));
  const rounded = Math.ceil(maxSpeed / magnitude) * magnitude;
  maxSpeed = Math.max(rounded, 10); // Minimum 10 tokens/sec

  // Render Y-axis
  yAxisContainer.innerHTML = '';
  const tickCount = 5;
  for (let i = tickCount; i >= 0; i--) {
    const value = (maxSpeed / tickCount) * i;
    const tick = document.createElement('div');
    tick.className = 'benchmark-y-tick';
    tick.textContent = formatSpeed(value);
    yAxisContainer.appendChild(tick);
  }

  // Setup canvas
  const dpr = window.devicePixelRatio || 1;
  const chartWidth = Math.max(dates.length * 60, 800);
  const chartHeight = 240;

  canvas.style.width = `${chartWidth}px`;
  canvas.style.height = `${chartHeight}px`;
  canvas.width = chartWidth * dpr;
  canvas.height = chartHeight * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Clear canvas
  ctx.clearRect(0, 0, chartWidth, chartHeight);

  // Get all models for coloring
  const allModels = new Set();
  for (const entry of entries) {
    if (modelFilter === 'all' || entry.model === modelFilter) {
      allModels.add(entry.model);
    }
  }

  // Draw lines for each model
  for (const model of allModels) {
    const color = getModelColor(model);
    const modelData = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const dateEntries = dateMap.get(date) || [];
      const modelEntry = dateEntries.find(e => e.model === model);

      if (modelEntry) {
        const x = i * 60 + 30;
        const y = chartHeight - (modelEntry.avg / maxSpeed) * chartHeight;
        modelData.push({ x, y, entry: modelEntry });
      }
    }

    // Draw line
    if (modelData.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.moveTo(modelData[0].x, modelData[0].y);
      for (let i = 1; i < modelData.length; i++) {
        ctx.lineTo(modelData[i].x, modelData[i].y);
      }
      ctx.stroke();
    }

    // Draw points
    for (const point of modelData) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Render X-axis
  xAxisContainer.innerHTML = '';
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const label = document.createElement('div');
    label.className = 'benchmark-x-label';
    label.style.left = `${i * 60 + 30}px`;
    label.textContent = formatDateLabel(date);
    xAxisContainer.appendChild(label);
  }

  // Render legend
  renderLegend(allModels);

  // Add hover interaction
  let tooltip = document.getElementById('benchmark-tooltip');
  let modalCard = document.querySelector('.benchmark-modal-card');

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find nearest point
    let nearest = null;
    let minDist = Infinity;

    for (const model of allModels) {
      const modelData = [];
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const dateEntries = dateMap.get(date) || [];
        const modelEntry = dateEntries.find(e => e.model === model);
        if (modelEntry) {
          const px = i * 60 + 30;
          const py = chartHeight - (modelEntry.avg / maxSpeed) * chartHeight;
          const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2));
          if (dist < minDist && dist < 15) {
            minDist = dist;
            nearest = { entry: modelEntry, x: px, y: py };
          }
        }
      }
    }

    if (nearest) {
      const entry = nearest.entry;
      tooltip.innerHTML = `
        <div style="margin-bottom: 6px; font-weight: 600;">${entry.model}</div>
        <div style="font-size: 11px; color: var(--fg-muted); margin-bottom: 4px;">${entry.date}</div>
        <div style="display: flex; flex-direction: column; gap: 2px; font-size: 11px;">
          <div><strong>Avg:</strong> ${formatSpeed(entry.avg)} tokens/sec</div>
          <div><strong>Min:</strong> ${formatSpeed(entry.min)} tokens/sec</div>
          <div><strong>Max:</strong> ${formatSpeed(entry.max)} tokens/sec</div>
          <div><strong>Median:</strong> ${formatSpeed(entry.median)} tokens/sec</div>
          <div><strong>Messages:</strong> ${entry.count}</div>
        </div>
      `;

      const modalRect = modalCard.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const tooltipX = canvasRect.left - modalRect.left + nearest.x + 10;
      const tooltipY = canvasRect.top - modalRect.top + nearest.y - 10;

      tooltip.style.left = `${tooltipX}px`;
      tooltip.style.top = `${tooltipY}px`;
      tooltip.classList.remove('hidden');
    } else {
      tooltip.classList.add('hidden');
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.classList.add('hidden');
  });
}

/**
 * Format date label for X-axis
 */
function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}`;
}

/**
 * Update provider filter options
 */
function updateProviderOptions(providers, currentProvider) {
  const select = document.getElementById('benchmark-filter-provider');
  const currentValue = currentProvider || select.value;

  select.innerHTML = '<option value="all">All providers</option>';
  for (const provider of providers) {
    const option = document.createElement('option');
    option.value = provider;
    option.textContent = provider;
    select.appendChild(option);
  }

  if (providers.includes(currentValue)) {
    select.value = currentValue;
  } else {
    select.value = 'all';
  }
}

/**
 * Update model filter options
 */
function updateModelOptions(models, modelToProvider, currentProvider, currentModel) {
  const select = document.getElementById('benchmark-filter-model');
  const group = select.parentElement;

  if (currentProvider === 'all') {
    group.style.display = 'none';
    select.value = 'all';
    return;
  }

  group.style.display = 'flex';
  const filteredModels = models.filter(m => modelToProvider[m] === currentProvider);

  select.innerHTML = '<option value="all">All models</option>';
  for (const model of filteredModels) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    select.appendChild(option);
  }

  if (filteredModels.includes(currentModel)) {
    select.value = currentModel;
  } else {
    select.value = 'all';
  }
}

/**
 * Compute date range from preset
 */
function computeDateRange(preset) {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let startDate;

  switch (preset) {
    case 'last-7-days':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6);
      break;
    case 'last-30-days':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 29);
      break;
    case 'current-month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      return null;
  }

  startDate.setHours(0, 0, 0, 0);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Fetch and render benchmark data
 */
async function fetchAndRender(state) {
  try {
    const summaryEl = document.getElementById('benchmark-summary');
    const chartContainer = document.getElementById('benchmark-chart-container');

    summaryEl.classList.add('hidden');
    chartContainer.classList.add('hidden');

    let filters = {};
    if (state.provider !== 'all') {
      filters.provider = state.provider;
    }
    if (state.model !== 'all') {
      filters.model = state.model;
    }

    if (state.rangePreset === 'custom') {
      if (state.startDate) filters.startDate = state.startDate;
      if (state.endDate) filters.endDate = state.endDate;
    } else {
      const range = computeDateRange(state.rangePreset);
      if (range) {
        filters.startDate = range.startDate;
        filters.endDate = range.endDate;
      }
    }

    const data = await window.api.benchmark.fetchStats(filters);

    // Debug logging
    log('Benchmark data received:', {
      providers: data.providers,
      models: data.models,
      entriesCount: data.entries?.length,
      totalMessages: data.summary?.totalMessages,
      skippedCount: data.skippedCount
    });

    // Show message if no data available
    if (data.summary.totalMessages === 0) {
      const noDataEl = document.getElementById('benchmark-no-data');
      if (noDataEl) {
        noDataEl.innerHTML = `
          <div style="font-size: 18px; margin-bottom: 12px;">No benchmark data available</div>
          <div style="font-size: 14px;">
            ${data.skippedCount > 0
              ? `Found ${data.skippedCount} messages without token speed data. Send new AI messages to collect benchmark data.`
              : 'Send some AI messages to start collecting token speed data.'}
          </div>
        `;
        noDataEl.classList.remove('hidden');
      }
      chartContainer.classList.add('hidden');
      return;
    }

    // Hide no data message
    const noDataEl = document.getElementById('benchmark-no-data');
    if (noDataEl) {
      noDataEl.classList.add('hidden');
    }

    // Update filter dropdowns
    updateProviderOptions(data.providers, state.provider);
    updateModelOptions(data.models, data.modelToProvider, state.provider, state.model);

    // Render summary
    renderSummary(data.summary);
    summaryEl.classList.remove('hidden');

    // Render chart
    const canvas = document.getElementById('benchmark-chart-canvas');
    const yAxisContainer = document.getElementById('benchmark-y-axis');
    const xAxisContainer = document.getElementById('benchmark-x-axis');
    const legendContainer = document.getElementById('benchmark-legend');

    renderChart(
      { chartContainer, canvas, yAxisContainer, xAxisContainer, legendContainer },
      data.entries,
      data.range,
      state.model
    );

    chartContainer.classList.remove('hidden');
  } catch (error) {
    log('Error fetching benchmark data:', error);
    const chartContainer = document.getElementById('benchmark-chart-container');
    const noDataEl = document.getElementById('benchmark-no-data');

    if (noDataEl) {
      noDataEl.innerHTML = `<div style="color: var(--error);">Failed to load benchmark data: ${error.message}</div>`;
      noDataEl.classList.remove('hidden');
    }
    if (chartContainer) {
      chartContainer.classList.add('hidden');
    }
  }
}

/**
 * Reset filters to default
 */
function resetFilters(state) {
  state.provider = 'all';
  state.model = 'all';
  state.rangePreset = 'last-30-days';
  state.startDate = '';
  state.endDate = '';

  document.getElementById('benchmark-filter-provider').value = 'all';
  document.getElementById('benchmark-filter-model').value = 'all';
  document.getElementById('benchmark-filter-range').value = 'last-30-days';
  document.getElementById('benchmark-filter-start').value = '';
  document.getElementById('benchmark-filter-end').value = '';
  document.getElementById('benchmark-custom-start-group').style.display = 'none';
  document.getElementById('benchmark-custom-end-group').style.display = 'none';

  return fetchAndRender(state);
}

/**
 * Initialize benchmark statistics UI
 */
export function initializeBenchmarkStatistics({ openModal: _openModal, closeModal: _closeModal, closeDropdown: _closeDropdown, log: _log }) {
  openModal = _openModal;
  closeModal = _closeModal;
  closeDropdown = _closeDropdown;
  log = _log || console.log;

  const modal = document.getElementById('benchmark-modal');
  const openBtn = document.getElementById('open-benchmark');
  const closeBtn = document.getElementById('close-benchmark');
  const overlay = modal.querySelector('.modal-overlay');

  const providerSelect = document.getElementById('benchmark-filter-provider');
  const modelSelect = document.getElementById('benchmark-filter-model');
  const rangeSelect = document.getElementById('benchmark-filter-range');
  const startInput = document.getElementById('benchmark-filter-start');
  const endInput = document.getElementById('benchmark-filter-end');
  const resetBtn = document.getElementById('benchmark-filter-reset');

  const state = {
    provider: 'all',
    model: 'all',
    rangePreset: 'last-30-days',
    startDate: '',
    endDate: '',
  };

  // Open modal
  openBtn.addEventListener('click', () => {
    openModal(modal);
    closeDropdown('#settings-menu');
    fetchAndRender(state);
  });

  // Close modal
  closeBtn.addEventListener('click', () => {
    closeModal(modal);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal(modal);
    }
  });

  // Provider filter
  providerSelect.addEventListener('change', () => {
    state.provider = providerSelect.value;
    state.model = 'all'; // Reset model filter
    fetchAndRender(state);
  });

  // Model filter
  modelSelect.addEventListener('change', () => {
    state.model = modelSelect.value;
    fetchAndRender(state);
  });

  // Range preset filter
  rangeSelect.addEventListener('change', () => {
    state.rangePreset = rangeSelect.value;
    if (state.rangePreset === 'custom') {
      document.getElementById('benchmark-custom-start-group').style.display = 'flex';
      document.getElementById('benchmark-custom-end-group').style.display = 'flex';
    } else {
      document.getElementById('benchmark-custom-start-group').style.display = 'none';
      document.getElementById('benchmark-custom-end-group').style.display = 'none';
      fetchAndRender(state);
    }
  });

  // Custom date inputs
  startInput.addEventListener('change', () => {
    state.startDate = startInput.value;
    if (state.rangePreset === 'custom') {
      fetchAndRender(state);
    }
  });

  endInput.addEventListener('change', () => {
    state.endDate = endInput.value;
    if (state.rangePreset === 'custom') {
      fetchAndRender(state);
    }
  });

  // Reset button
  resetBtn.addEventListener('click', () => {
    resetFilters(state);
  });
}
