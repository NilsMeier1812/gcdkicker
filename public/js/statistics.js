(() => {
  const chartData = JSON.parse(document.getElementById('chart-data').textContent);

  const COLORS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6',
    '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3',
    '#808000', '#ffd8b1', '#5a7bd6', '#a9a9a9', '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
    '#9467bd', '#8c564b', '#e377c2', '#bcbd22', '#17becf', '#aec7e8', '#ffbb78', '#98df8a',
  ];
  const MIN_GAMES_VISIBLE = 5;

  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // --- Tabs (merkt sich die Auswahl in der URL, z. B. #verlauf) --------------
  const tabs = { 'btn-elo': ['elo-view', 'ranking'], 'btn-table': ['table-view', 'details'], 'btn-chart': ['chart-view', 'verlauf'] };
  let chartRendered = false;

  function selectTab(btnId, updateHash) {
    for (const [id, [viewId]] of Object.entries(tabs)) {
      const active = id === btnId;
      document.getElementById(id).setAttribute('aria-selected', String(active));
      document.getElementById(viewId).hidden = !active;
    }
    if (updateHash) history.replaceState(null, '', `#${tabs[btnId][1]}`);
    if (btnId === 'btn-chart' && !chartRendered) renderChart();
  }
  for (const id of Object.keys(tabs)) {
    document.getElementById(id).addEventListener('click', () => selectTab(id, true));
  }
  const fromHash = Object.entries(tabs).find(([, [, hash]]) => `#${hash}` === location.hash);
  if (fromHash) selectTab(fromHash[0], false);

  // --- Sortierbare Detailtabelle ----------------------------------------------
  const table = document.getElementById('stats-table');
  const headers = Array.from(table.querySelectorAll('th.sortable'));
  const tbody = table.querySelector('tbody');

  function sortBy(header, direction) {
    const index = headers.indexOf(header);
    const isString = header.dataset.sort === 'string';
    headers.forEach((h) => h.removeAttribute('aria-sort'));
    header.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');
    const key = (row) => {
      const cell = row.children[index];
      return isString ? cell.textContent.trim() : parseFloat(cell.dataset.value);
    };
    Array.from(tbody.rows)
      .sort((a, b) => {
        const av = key(a), bv = key(b);
        const cmp = isString ? av.localeCompare(bv, 'de') : av - bv;
        // Bei Gleichstand nach Name
        return cmp * direction || a.children[0].textContent.localeCompare(b.children[0].textContent, 'de');
      })
      .forEach((row) => tbody.appendChild(row));
  }

  headers.forEach((header) => {
    header.querySelector('button').addEventListener('click', () => {
      const current = header.getAttribute('aria-sort');
      // Zahlen zuerst absteigend, Namen zuerst aufsteigend
      const first = header.dataset.sort === 'string' ? 1 : -1;
      const direction = current === (first === 1 ? 'ascending' : 'descending') ? -first : first;
      sortBy(header, direction);
    });
  });
  const defaultHeader = headers.find((h) => h.dataset.default);
  if (defaultHeader) sortBy(defaultHeader, -1);

  // --- Elo-Verlauf --------------------------------------------------------------
  function renderChart() {
    if (typeof ApexCharts === 'undefined') {
      // Bibliothek noch nicht geladen (defer) -> kurz warten
      return setTimeout(renderChart, 100);
    }
    chartRendered = true;
    const container = document.getElementById('chart-container');
    const mobile = window.matchMedia('(max-width: 767px)').matches;

    const series = chartData.datasets.map((ds) => ({ name: ds.label, data: ds.data }));
    const hidden = chartData.datasets.filter((ds) => ds.games < MIN_GAMES_VISIBLE).map((ds) => ds.label);

    const chart = new ApexCharts(container, {
      series,
      colors: chartData.datasets.map((_, i) => COLORS[i % COLORS.length]),
      chart: {
        type: 'line',
        height: mobile ? 440 : 500,
        background: 'transparent',
        animations: { enabled: false },
        fontFamily: 'inherit',
        foreColor: '#9aa6b2',
        toolbar: { show: !mobile, tools: { download: false }, autoSelected: 'zoom' },
        zoom: { enabled: true },
      },
      theme: { mode: 'dark' },
      stroke: { curve: 'straight', width: 2 },
      markers: { size: 0, hover: { size: 5 } },
      grid: { borderColor: '#2a3742', padding: { left: 4, right: 8 } },
      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        fontSize: mobile ? '12px' : '13px',
        itemMargin: { horizontal: 6, vertical: 3 },
        markers: { size: 6 },
        onItemClick: { toggleDataSeries: true },
        onItemHover: { highlightDataSeries: !mobile },
      },
      yaxis: {
        title: { text: mobile ? undefined : 'Elo' },
        labels: { formatter: (v) => Math.round(v) },
      },
      xaxis: {
        type: 'category',
        categories: chartData.labels,
        tickAmount: mobile ? 6 : 14,
        labels: { rotate: 0, hideOverlappingLabels: true },
        tooltip: { enabled: false },
        axisTicks: { show: false },
        axisBorder: { color: '#2a3742' },
      },
      tooltip: {
        theme: 'dark',
        shared: true,
        intersect: false,
        custom: ({ dataPointIndex, w }) => {
          const items = [];
          w.globals.series.forEach((s, i) => {
            if (w.globals.collapsedSeriesIndices.includes(i)) return;
            const val = s[dataPointIndex];
            if (val !== null && val !== undefined) items.push({ name: w.globals.seriesNames[i], value: val, color: w.globals.colors[i] });
          });
          items.sort((a, b) => b.value - a.value);
          const title = w.globals.categoryLabels[dataPointIndex] || w.globals.labels[dataPointIndex] || '';
          return `<div class="apexcharts-tooltip-title">${escapeHtml(title)}</div>` +
            '<div style="max-height: 220px; overflow-y: auto;">' +
            items.map((it) => `<div class="tooltip-item"><span class="tooltip-marker" style="background-color:${it.color}"></span><span class="tooltip-name">${escapeHtml(it.name)}</span><span class="tooltip-value">${it.value}</span></div>`).join('') +
            '</div>';
        },
      },
    });
    chart.render().then(() => hidden.forEach((name) => chart.hideSeries(name)));
  }
})();
