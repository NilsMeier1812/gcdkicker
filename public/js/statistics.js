const chartData = JSON.parse(document.getElementById('chart-data').textContent);
const rawLabels = chartData.labels;
const rawDates = chartData.dates;
const rawDatasets = chartData.datasets;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Große Farbpalette
const extendedColors = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6',
  '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3',
  '#808000', '#ffd8b1', '#000075', '#808080', '#ffffff', '#000000', '#1f77b4', '#ff7f0e',
  '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5', '#c49c94', '#f7b6d2', '#c7c7c7',
  '#dbdb8d', '#9edae5', '#6b6ecf', '#b5cf6b', '#e7ba52', '#d6616b', '#ce6dbd', '#de9ed6'
];

// Status Variablen (stark vereinfacht, da Filter entfernt)

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Tab Navigation ---
    const views = {
      'btn-elo': 'elo-view',
      'btn-table': 'table-view',
      'btn-chart': 'chart-view'
    };

    for (const [btnId, viewId] of Object.entries(views)) {
        const btn = document.getElementById(btnId);
        if(btn) {
            btn.addEventListener('click', function() {
                Object.keys(views).forEach(b => document.getElementById(b).classList.remove('active'));
                Object.values(views).forEach(v => document.getElementById(v).classList.remove('active'));
                this.classList.add('active');
                document.getElementById(viewId).classList.add('active');

                if (btnId === 'btn-chart') {
                     renderChart(); // Rendert/Updatet Chart
                }
            });
        }
    }

    // --- 2. Table Sorting (Legacy) ---
    const table = document.getElementById('stats-table');
    if(table) {
        const headers = table.querySelectorAll('th.sortable');
        const tbody = table.querySelector('tbody');
        headers.forEach((header, index) => {
            header.addEventListener('click', () => {
                const currentState = header.dataset.sortState;
                let nextState = (currentState === 'desc') ? 'asc' : 'desc';
                headers.forEach(h => { h.dataset.sortState = 'unsorted'; h.classList.remove('sorted-asc', 'sorted-desc'); });
                header.dataset.sortState = nextState;
                header.classList.add(nextState === 'asc' ? 'sorted-asc' : 'sorted-desc');
                const direction = nextState === 'asc' ? 1 : -1;
                const sortType = header.dataset.sort;
                Array.from(tbody.querySelectorAll('tr')).sort((a, b) => {
                    const aVal = a.children[index].textContent.trim();
                    const bVal = b.children[index].textContent.trim();
                    if (sortType === 'number') return (parseFloat(aVal.replace('%','')) - parseFloat(bVal.replace('%',''))) * direction;
                    return aVal.localeCompare(bVal) * direction;
                }).forEach(row => tbody.appendChild(row));
            });
        });
        const defaultSort = Array.from(headers).find(h => h.textContent.includes('S'));
        if(defaultSort) defaultSort.click();
    }

    // --- 3. ApexCharts Logic ---
    function renderChart() {
        const chartContainer = document.querySelector("#chart-container");
        chartContainer.innerHTML = ""; // Alten Chart zerstören

        // 1. Daten vorbereiten (immer alle Spielgruppen im Category Mode)
        const activeColors = [];
        const series = [];

        rawDatasets.forEach((ds, idx) => {
            // Alle Spieler in die initialen Series aufnehmen
            activeColors.push(extendedColors[idx % extendedColors.length]);

            // Da wir immer den Category Mode nutzen: Einfaches Daten-Array der Werte
            series.push({
                name: ds.label,
                data: ds.data // Das ist das komplette Array der Elo-Werte pro Spielgruppe
            });
        });

        // 2. Chart Options
        const options = {
            series: series,
            colors: activeColors,
            chart: {
                type: 'line',
                height: 500,
                background: 'transparent',
                animations: { enabled: false },
                fontFamily: 'inherit',
                toolbar: { show: true, autoSelected: 'zoom' }
            },
            theme: { mode: 'dark' },
            stroke: { curve: 'straight', width: 2 },
            markers: { size: 0, hover: { size: 6 } },
            yaxis: { title: { text: 'Elo' } },
            grid: { borderColor: '#444' },

            // Legende ist jetzt wieder sichtbar
            legend: {
                position: 'top',
                horizontalAlign: 'left',
                onItemClick: { toggleDataSeries: true },
                onItemHover: { highlightDataSeries: true }
            },

            // X-Axis Konfiguration: Category (Spiele)
            xaxis: {
                type: 'category',
                categories: rawLabels, // Datum-Strings als Labels ("27.11.")
                title: { text: 'Spielgruppe' }, // Neuer X-Achsen Titel
                tooltip: { enabled: false },
                tickAmount: 20
            },

            // Tooltip Customization (Sortierung nach Elo)
            tooltip: {
                theme: 'dark',
                shared: true,
                intersect: false,
                custom: function({series, seriesIndex, dataPointIndex, w}) {
                    // Daten sammeln
                    let data = [];
                    w.globals.series.forEach((s, i) => {
                        const val = s[dataPointIndex];
                        if (val !== null && typeof val !== 'undefined') {
                            data.push({
                                name: w.globals.seriesNames[i],
                                value: val,
                                color: w.globals.colors[i]
                            });
                        }
                    });

                    // SORTIEREN (Höchster Elo oben)
                    data.sort((a, b) => b.value - a.value);

                    // Header (Datum der Spielgruppe)
                    let headerTitle = w.globals.labels[dataPointIndex];

                    let html = `<div class="apexcharts-tooltip-title">${escapeHtml(headerTitle || "Punkt")}</div>`;
                    html += '<div style="max-height: 200px; overflow-y: auto;">';
                    data.forEach(item => {
                        html += `
                        <div class="tooltip-item">
                            <span class="tooltip-marker" style="background-color: ${item.color};"></span>
                            <span class="tooltip-name">${escapeHtml(item.name)}:</span>
                            <span class="tooltip-value">${item.value}</span>
                        </div>`;
                    });
                    html += '</div>';
                    return html;
                }
            }
        };

        window.myApexChart = new ApexCharts(chartContainer, options);
        window.myApexChart.render();
    }

    // Initial rendern, falls der Tab aktiv ist
    if(document.getElementById('chart-view').classList.contains('active')) {
         renderChart();
    }
});

