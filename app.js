const KpiConfig = {
  waitTimeAlertMinutes: 15,
  thresholdIdleExclusive: 0.2,
  thresholdFullExclusive: 0.05
};

const storageKey = "parking_mvp_data_v1";
let donutChart;
let waitChart;
let violationChart;
let scratchChart;
let currentViolationEvents = [];

const demoViolationImages = [
  "https://images.unsplash.com/photo-1485463598028-44d6c47bf23f?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80"
];

const demoLocations = [
  "A區 2棟 北側消防通道",
  "B區 地下車庫入口",
  "C區 1棟 單元門前",
  "D區 訪客車位旁"
];

function getInitialData() {
  return {
    site: {
      site_id: "site_old_001",
      site_name: "示範老舊小區",
      total_spaces: 180
    },
    latest_snapshot: {
      timestamp: new Date().toISOString(),
      available_spaces: 36,
      queue_count: 4,
      recent_release_per_30m: 12,
      status: "idle",
      estimated_wait_minutes: 20,
      reporter: "系統初始化",
      note: ""
    },
    history: []
  };
}

function loadData() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    const seed = getInitialData();
    seed.history.push(seed.latest_snapshot);
    saveData(seed);
    return seed;
  }
  return JSON.parse(raw);
}

function saveData(data) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function calcStatus(availableSpaces, totalSpaces) {
  const ratio = totalSpaces === 0 ? 0 : availableSpaces / totalSpaces;
  if (ratio > KpiConfig.thresholdIdleExclusive) return "idle";
  if (ratio >= KpiConfig.thresholdFullExclusive) return "tight";
  return "full";
}

function calcWaitMinutes(queueCount, recentReleasePer30m) {
  if (queueCount <= 0) return 0;
  if (recentReleasePer30m <= 0) return 999;
  const minutes = (queueCount / recentReleasePer30m) * 30;
  return Math.round(minutes);
}

function buildAlerts(previous, current) {
  const alerts = [];
  if (previous && previous.status === "tight" && current.status === "full") {
    alerts.push("狀態由緊張轉為無車位，請啟動高峰管控。");
  }
  if (previous && previous.status === "idle" && current.status === "full") {
    alerts.push("狀態由空閒直接轉為無車位，請立即增派人員。");
  }
  if (current.estimated_wait_minutes >= KpiConfig.waitTimeAlertMinutes) {
    alerts.push(`等待時間已達 ${current.estimated_wait_minutes} 分鐘，建議啟用分流。`);
  }
  return alerts;
}

function statusLabel(status) {
  if (status === "idle") return "空閒";
  if (status === "tight") return "緊張";
  return "無車位";
}

function statusClass(status) {
  return `status-pill status-${status}`;
}

function renderDashboard(data) {
  const snapshot = data.latest_snapshot;
  const statusText = document.getElementById("statusText");
  const waitMinutes = document.getElementById("waitMinutes");
  const availableSpaces = document.getElementById("availableSpaces");
  const totalSpaces = document.getElementById("totalSpaces");
  const queueCount = document.getElementById("queueCount");
  const alertsList = document.getElementById("alertsList");

  statusText.textContent = statusLabel(snapshot.status);
  statusText.className = statusClass(snapshot.status);
  waitMinutes.textContent = String(snapshot.estimated_wait_minutes);
  availableSpaces.textContent = String(snapshot.available_spaces);
  totalSpaces.textContent = String(data.site.total_spaces);
  queueCount.textContent = String(snapshot.queue_count);

  alertsList.innerHTML = "";
  const prev = data.history.length > 1 ? data.history[data.history.length - 2] : null;
  const alerts = buildAlerts(prev, snapshot);
  if (alerts.length === 0) {
    const li = document.createElement("li");
    li.textContent = "目前無異常。";
    alertsList.appendChild(li);
  } else {
    alerts.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      alertsList.appendChild(li);
    });
  }

  renderDonut(data.history);
  renderWaitTrend(data.history);
  renderViolationAndScratch(data.history);
}

function renderHistory(data) {
  const tbody = document.getElementById("historyTableBody");
  tbody.innerHTML = "";
  const items = [...data.history].reverse();
  items.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${new Date(row.timestamp).toLocaleString("zh-Hant-TW")}</td>
      <td><span class="${statusClass(row.status)}">${statusLabel(row.status)}</span></td>
      <td>${row.available_spaces}</td>
      <td>${row.queue_count}</td>
      <td>${row.estimated_wait_minutes}</td>
    `;
    tbody.appendChild(tr);
  });
}

function bindTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panels = document.querySelectorAll(".tab-panel");
  function activateTab(tabId) {
    buttons.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    const matched = Array.from(buttons).find((b) => b.dataset.tab === tabId);
    if (matched) matched.classList.add("active");
    document.getElementById(tabId).classList.add("active");
  }
  buttons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });
}

function bindForm(data) {
  const form = document.getElementById("reportForm");
  const message = document.getElementById("formMessage");
  const availableInput = document.getElementById("availableInput");
  const queueInput = document.getElementById("queueInput");
  const releaseInput = document.getElementById("releaseInput");
  const reporterInput = document.getElementById("reporterInput");
  const noteInput = document.getElementById("noteInput");

  availableInput.value = String(data.latest_snapshot.available_spaces);
  queueInput.value = String(data.latest_snapshot.queue_count);
  releaseInput.value = String(data.latest_snapshot.recent_release_per_30m);
  reporterInput.value = "";
  noteInput.value = "";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const available = Number(availableInput.value);
    const queue = Number(queueInput.value);
    const releasePer30m = Number(releaseInput.value);
    const reporter = reporterInput.value.trim();
    const note = noteInput.value.trim();

    if (available > data.site.total_spaces) {
      message.textContent = "可用車位不能超過總車位數。";
      return;
    }
    if (!reporter) {
      message.textContent = "請填寫上報人。";
      return;
    }

    const status = calcStatus(available, data.site.total_spaces);
    const estimatedWaitMinutes = calcWaitMinutes(queue, releasePer30m);
    const snapshot = {
      timestamp: new Date().toISOString(),
      available_spaces: available,
      queue_count: queue,
      recent_release_per_30m: releasePer30m,
      status,
      estimated_wait_minutes: estimatedWaitMinutes,
      reporter,
      note
    };

    data.latest_snapshot = snapshot;
    data.history.push(snapshot);
    saveData(data);
    renderDashboard(data);
    renderHistory(data);
    message.textContent = "上報成功，資料已更新。";
  });
}

function renderDonut(history) {
  const donut = document.getElementById("statusDonut");
  const legend = document.getElementById("donutLegend");
  if (window.echarts && !donutChart) {
    donutChart = window.echarts.init(donut);
  }
  const total = history.length || 1;
  const idle = history.filter((x) => x.status === "idle").length;
  const tight = history.filter((x) => x.status === "tight").length;
  const full = history.filter((x) => x.status === "full").length;
  const violation = history.filter((x) => x.queue_count >= 8).length;
  const scratch = history.filter((x) => x.status === "full" && x.queue_count >= 12).length;
  const vals = [
    { name: "空閒", v: idle, c: "#c370f6" },
    { name: "緊張", v: tight, c: "#bfe907" },
    { name: "無位", v: full, c: "#fac503" },
    { name: "違停風險", v: violation, c: "#f96464" },
    { name: "剮蹭風險", v: scratch, c: "#08f2fa" }
  ];

  if (donutChart) {
    donutChart.setOption({
      animationDuration: 600,
      tooltip: { trigger: "item" },
      series: [{
        type: "pie",
        radius: ["58%", "78%"],
        startAngle: 90,
        label: { show: false },
        data: vals.map((x) => ({ name: x.name, value: Math.max(x.v, 0.001), itemStyle: { color: x.c } }))
      }]
    });
  }

  legend.innerHTML = "";
  vals.forEach((item) => {
    const pct = Math.round((item.v / total) * 100);
    const div = document.createElement("div");
    div.className = "legend-item";
    div.innerHTML = `<span class="legend-dot" style="background:${item.c}"></span>${item.name} ${pct}%`;
    legend.appendChild(div);
  });
}

function renderWaitTrend(history) {
  const points = history.slice(-10).map((x) => x.estimated_wait_minutes);
  const el = document.getElementById("waitTrendChart");
  if (window.echarts && !waitChart) {
    waitChart = window.echarts.init(el);
  }
  const now = document.getElementById("waitNow");
  const avg = document.getElementById("waitAvg");
  if (points.length === 0) return;
  if (waitChart) {
    waitChart.setOption({
      animationDuration: 500,
      grid: { left: 30, right: 16, top: 18, bottom: 24 },
      xAxis: {
        type: "category",
        data: points.map((_, i) => `T${i + 1}`),
        boundaryGap: false,
        axisLabel: { color: "#6b7280", fontSize: 11 }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#6b7280", fontSize: 11 },
        splitLine: { lineStyle: { color: "#e5e7eb" } }
      },
      tooltip: { trigger: "axis" },
      series: [{
        type: "line",
        smooth: true,
        data: points,
        symbolSize: 6,
        lineStyle: { color: "#4f46e5", width: 3 },
        areaStyle: { color: "rgba(79,70,229,0.15)" },
        itemStyle: { color: "#4f46e5" }
      }]
    });
  }
  now.textContent = String(points[points.length - 1]);
  avg.textContent = String(Math.round(points.reduce((a, b) => a + b, 0) / points.length));
}

function renderRiskMiniChart(targetEl, chartRefName, value, color) {
  if (!window.echarts) return null;
  let chart = chartRefName === "violation" ? violationChart : scratchChart;
  if (!chart) {
    chart = window.echarts.init(targetEl);
    if (chartRefName === "violation") violationChart = chart;
    if (chartRefName === "scratch") scratchChart = chart;
  }
  chart.setOption({
    animationDuration: 500,
    grid: { left: 24, right: 16, top: 16, bottom: 24 },
    xAxis: {
      type: "category",
      data: ["風險值"],
      axisLabel: { color: "#6b7280", fontSize: 11 }
    },
    yAxis: {
      type: "value",
      max: 10,
      axisLabel: { color: "#6b7280", fontSize: 11 },
      splitLine: { lineStyle: { color: "#e5e7eb" } }
    },
    tooltip: { trigger: "axis" },
    series: [{
      type: "bar",
      data: [value],
      barWidth: "45%",
      itemStyle: { color, borderRadius: [8, 8, 0, 0] }
    }]
  });
  return chart;
}

function renderViolationAndScratch(history) {
  const violationList = document.getElementById("violationList");
  const scratchList = document.getElementById("scratchList");
  const violationEl = document.getElementById("violationChart");
  const scratchEl = document.getElementById("scratchChart");
  const violationCount = document.getElementById("violationCount");
  const scratchCount = document.getElementById("scratchCount");

  const recent = history.slice(-8).reverse();
  const violations = recent.filter((x) => x.queue_count >= 8);
  const scratches = recent.filter((x) => x.status === "full" && x.queue_count >= 10);
  currentViolationEvents = violations.map((x, idx) => ({
    id: `violation-${idx}-${x.timestamp}`,
    timestamp: x.timestamp,
    queueCount: x.queue_count,
    location: demoLocations[idx % demoLocations.length],
    imageUrl: demoViolationImages[idx % demoViolationImages.length],
    status: x.queue_count >= 12 ? "高風險待處理" : "待巡檢"
  }));

  violationCount.textContent = String(violations.length);
  scratchCount.textContent = String(scratches.length);
  renderRiskMiniChart(violationEl, "violation", Math.min(10, violations.length), "#f59e0b");
  renderRiskMiniChart(scratchEl, "scratch", Math.min(10, scratches.length), "#ef4444");

  violationList.innerHTML = "";
  violationList.classList.add("clickable");
  if (violations.length === 0) {
    const li = document.createElement("li");
    li.textContent = "目前無違停高風險事件";
    violationList.appendChild(li);
  } else {
    currentViolationEvents.forEach((eventData) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <button class="violation-item-btn" type="button" data-event-id="${eventData.id}">
          ${new Date(eventData.timestamp).toLocaleTimeString("zh-Hant-TW")} 排隊 ${eventData.queueCount} 輛，點擊查看詳情
          <span class="violation-item-meta">${eventData.location}</span>
        </button>
      `;
      violationList.appendChild(li);
    });
  }

  scratchList.innerHTML = "";
  if (scratches.length === 0) {
    const li = document.createElement("li");
    li.textContent = "目前無剮蹭高風險事件";
    scratchList.appendChild(li);
  } else {
    scratches.forEach((x) => {
      const li = document.createElement("li");
      li.textContent = `${new Date(x.timestamp).toLocaleTimeString("zh-Hant-TW")} 無位且排隊 ${x.queue_count} 輛`;
      scratchList.appendChild(li);
    });
  }
}

function openViolationDetail(eventId) {
  const modal = document.getElementById("violationModal");
  const image = document.getElementById("violationDetailImage");
  const location = document.getElementById("violationDetailLocation");
  const time = document.getElementById("violationDetailTime");
  const status = document.getElementById("violationDetailStatus");
  const eventData = currentViolationEvents.find((x) => x.id === eventId);
  if (!eventData) return;
  image.src = eventData.imageUrl;
  location.textContent = eventData.location;
  time.textContent = new Date(eventData.timestamp).toLocaleString("zh-Hant-TW");
  status.textContent = eventData.status;
  modal.classList.remove("hidden");
}

function closeViolationDetail() {
  const modal = document.getElementById("violationModal");
  modal.classList.add("hidden");
}

function bindViolationDetailEvents() {
  const violationList = document.getElementById("violationList");
  const closeBtn = document.getElementById("closeViolationModal");
  const modal = document.getElementById("violationModal");
  violationList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-event-id]");
    if (!target) return;
    openViolationDetail(target.dataset.eventId);
  });
  closeBtn.addEventListener("click", closeViolationDetail);
  modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal='true']")) {
      closeViolationDetail();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeViolationDetail();
  });
}

function bootstrap() {
  const data = loadData();
  bindTabs();
  bindForm(data);
  bindViolationDetailEvents();
  renderDashboard(data);
  renderHistory(data);
  window.addEventListener("resize", () => {
    if (donutChart) donutChart.resize();
    if (waitChart) waitChart.resize();
    if (violationChart) violationChart.resize();
    if (scratchChart) scratchChart.resize();
  });
}

bootstrap();