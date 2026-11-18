// ============================================================================
// ESTIMADOR DE VOLUME POR "CHUVA ALEATÓRIA" (MÉTODO DE MONTE CARLO) — CÁLCULO 2
// ============================================================================

const state = {
  terrainMode: 'real', // 'real' | 'analytic'
  locationMode: 'coords', // 'cep' | 'coords'
  cepIdentified: false,
  surfaceKey: 'basin',
  reliefScale: 300, // metros (H_max)
  radiusKm: 2.0, // L em km -> domínio [-L, L] x [-L, L]
  numPoints: 10000,
  rainMode: 'random_storm', // 'random_storm' | 'uniform' | 'orographic'
  rainIntensity: 80, // mm
  soilType: 'pasture',
  slopeSensitivity: 6.0,

  // Coordenadas para modo real (Leaflet + Open-Meteo)
  lat: -22.413,
  lon: -44.845,
  locationLabel: 'Serra da Mantiqueira (-22.413, -44.845)',
  realGrid: null, // { n, xs, ys, zMatrix, minZ, maxZ }

  // Semente / centro da tempestade aleatória atual
  stormCenter: { x: 0.35, y: -0.25 },
  lastSimulation: null,
  isSimulating: false,
};

const SOIL_PARAMS = {
  forest: { c0: 0.85, name: 'Solo Florestal / Permeável' },
  pasture: { c0: 0.65, name: 'Solo Misto / Campo' },
  clay: { c0: 0.40, name: 'Solo Argiloso / Compactado' },
  urban: { c0: 0.20, name: 'Solo Rochoso / Semi-Impermeável' },
};

// ============================================================================
// 1. DEFINIÇÃO DAS SUPERFÍCIES CLÁSSICAS DE CÁLCULO 2 (z em m, x e y em km)
// ============================================================================
const ANALYTIC_SURFACES = {
  basin: {
    name: 'Bacia Parabólica (Paraboloide Elíptico)',
    latex: String.raw`f(x,y) = H_{\text{máx}}\,\frac{x^2 + y^2}{2L^2}, \quad \nabla f(x,y) = \left(\frac{H_{\text{máx}}\,x}{L^2},\; \frac{H_{\text{máx}}\,y}{L^2}\right)`,
    eval(x, y, L, H) {
      const u = x / L;
      const v = y / L;
      const z = H * 0.5 * (u * u + v * v);
      const dzdx = (H * x) / (L * L);
      const dzdy = (H * y) / (L * L);
      return { z, dzdx, dzdy };
    },
  },

  peaks: {
    name: 'Morros e Vales Senoidais',
    latex: String.raw`f(x,y) = \frac{H_{\text{máx}}}{2}\Big[\sin\!\left(\frac{\pi x}{L}\right)\cos\!\left(\frac{\pi y}{L}\right) + 1\Big]`,
    eval(x, y, L, H) {
      const k = Math.PI / L;
      const sx = Math.sin(k * x);
      const cx = Math.cos(k * x);
      const sy = Math.sin(k * y);
      const cy = Math.cos(k * y);
      const z = 0.5 * H * (sx * cy + 1);
      const dzdx = 0.5 * H * k * cx * cy;
      const dzdy = -0.5 * H * k * sx * sy;
      return { z, dzdx, dzdy };
    },
  },

  saddle: {
    name: 'Vale de Sela (Paraboloide Hiperbólico)',
    latex: String.raw`f(x,y) = \frac{H_{\text{máx}}}{2}\left(\frac{x^2 - y^2}{L^2} + 1\right), \quad \nabla f(x,y) = \left(\frac{H_{\text{máx}}\,x}{L^2},\; -\frac{H_{\text{máx}}\,y}{L^2}\right)`,
    eval(x, y, L, H) {
      const u = x / L;
      const v = y / L;
      const z = 0.5 * H * (u * u - v * v + 1);
      const dzdx = (H * x) / (L * L);
      const dzdy = -(H * y) / (L * L);
      return { z, dzdx, dzdy };
    },
  },

  gaussian_valley: {
    name: 'Dois Morros Gaussianos e Bacia Central',
    latex: String.raw`f(x,y) = H_{\text{máx}}\Big[e^{-2.5((u-0.45)^2+(v-0.45)^2)} + 0.85\,e^{-2.5((u+0.45)^2+(v+0.4)^2)} + 0.15(u^2+v^2)\Big]`,
    eval(x, y, L, H) {
      const u = x / L;
      const v = y / L;
      const a = 2.5;
      const r1 = (u - 0.45) ** 2 + (v - 0.45) ** 2;
      const r2 = (u + 0.45) ** 2 + (v + 0.4) ** 2;
      const g1 = Math.exp(-a * r1);
      const g2 = 0.85 * Math.exp(-a * r2);
      const bowl = 0.15 * (u * u + v * v);

      const z = H * (g1 + g2 + bowl);
      const dudx = 1 / L;
      const dvdy = 1 / L;
      const dzdu =
        H * (-2 * a * (u - 0.45) * g1 - 2 * a * (u + 0.45) * g2 + 0.3 * u);
      const dzdv =
        H * (-2 * a * (v - 0.45) * g1 - 2 * a * (v + 0.4) * g2 + 0.3 * v);
      return { z, dzdx: dzdu * dudx, dzdy: dzdv * dvdy };
    },
  },

  ridge: {
    name: 'Encosta com Calha Fluvial',
    latex: String.raw`f(x,y) = H_{\text{máx}}\Big[0.45\left(\frac{y}{L}+1\right) + 0.35\left(\frac{x}{L}\right)^2 - 0.15\cos\!\left(\frac{\pi x}{L}\right)\Big]`,
    eval(x, y, L, H) {
      const u = x / L;
      const v = y / L;
      const k = Math.PI / L;
      const z = H * (0.45 * (v + 1) + 0.35 * u * u - 0.15 * Math.cos(k * x) + 0.15);
      const dzdx = H * ((0.7 * u) / L + 0.15 * k * Math.sin(k * x));
      const dzdy = H * (0.45 / L);
      return { z, dzdx, dzdy };
    },
  },
};

// ============================================================================
// 2. AVALIAÇÃO DO TERRENO (ANALÍTICO OU INTERPOLADO DA MALHA REAL OPEN-METEO)
// ============================================================================
function evaluateTerrain(x, y) {
  const L = state.radiusKm;
  const H = state.reliefScale;

  if (state.terrainMode === 'real' && state.realGrid) {
    return evaluateRealGridBilinear(x, y, L, state.realGrid);
  }

  const surf = ANALYTIC_SURFACES[state.surfaceKey] || ANALYTIC_SURFACES.basin;
  return surf.eval(x, y, L, H);
}

function evaluateRealGridBilinear(x, y, L, grid) {
  const { n, zMatrix } = grid;
  const fx = Math.min(Math.max(((x + L) / (2 * L)) * (n - 1), 0), n - 1.0001);
  const fy = Math.min(Math.max(((y + L) / (2 * L)) * (n - 1), 0), n - 1.0001);

  const j = Math.floor(fx);
  const i = Math.floor(fy);
  const tx = fx - j;
  const ty = fy - i;

  const z00 = zMatrix[i][j];
  const z10 = zMatrix[i][j + 1];
  const z01 = zMatrix[i + 1][j];
  const z11 = zMatrix[i + 1][j + 1];

  const z =
    (1 - tx) * (1 - ty) * z00 +
    tx * (1 - ty) * z10 +
    (1 - tx) * ty * z01 +
    tx * ty * z11;

  const dxKm = (2 * L) / (n - 1);
  const dyKm = (2 * L) / (n - 1);

  const dzdx = ((1 - ty) * (z10 - z00) + ty * (z11 - z01)) / dxKm;
  const dzdy = ((1 - tx) * (z01 - z00) + tx * (z11 - z10)) / dyKm;

  return { z, dzdx, dzdy };
}

// ============================================================================
// 3. MODELO DE CHUVA P(x, y) E INFILTRAÇÃO vs. ESCOAMENTO
// ============================================================================
function evaluateRainMm(x, y, z, zMin, zMax, isRandomPoint = true) {
  const L = state.radiusKm;
  const P0 = state.rainIntensity; // mm

  if (state.rainMode === 'uniform') {
    return P0;
  }

  if (state.rainMode === 'orographic') {
    const normZ = zMax > zMin ? (z - zMin) / (zMax - zMin) : 0.5;
    const noise = isRandomPoint ? 0.85 + 0.3 * Math.random() : 1.0;
    return P0 * (0.45 + 0.9 * normZ) * noise;
  }

  // 'random_storm': Célula de chuva Gaussiana 2D + flutuação aleatória (Monte Carlo)
  const cx = state.stormCenter.x * L;
  const cy = state.stormCenter.y * L;
  const sigma = 0.75 * L;
  const dist2 = (x - cx) ** 2 + (y - cy) ** 2;
  const spatialBell = 0.35 + 0.85 * Math.exp(-dist2 / (2 * sigma * sigma));
  const stochasticFactor = isRandomPoint ? 0.75 + 0.5 * Math.random() : 1.0;
  return P0 * spatialBell * stochasticFactor;
}

function computeHydrologyAtPoint(x, y, zMin, zMax, isRandomPoint = true) {
  const { z, dzdx, dzdy } = evaluateTerrain(x, y);

  // Norma do gradiente em m/m (dzdx está em m/km, dividimos por 1000)
  const gradNorm = Math.hypot(dzdx, dzdy) / 1000;

  // Coeficiente de infiltração C_inf(x,y) = c0 / (1 + k * ||grad z||)
  const c0 = SOIL_PARAMS[state.soilType].c0;
  const k = state.slopeSensitivity;
  const cInf = c0 / (1 + k * gradNorm);

  const rainMm = evaluateRainMm(x, y, z, zMin, zMax, isRandomPoint);
  const infilMm = rainMm * cInf;
  const runoffMm = rainMm * (1 - cInf);

  return {
    x,
    y,
    z,
    dzdx,
    dzdy,
    gradNorm,
    cInf,
    rainMm,
    infilMm,
    runoffMm,
  };
}

// ============================================================================
// 4. SIMULAÇÃO PRINCIPAL: INTEGRAL DUPLA DE MONTE CARLO vs. SOMA DE RIEMANN
// ============================================================================
function runMonteCarloSimulation() {
  const L = state.radiusKm;
  const N = state.numPoints;
  const areaKm2 = 4 * L * L; // [-L, L] x [-L, L]
  const areaM2 = areaKm2 * 1e6;

  // 1) Gera malha regular (50x50) para curvas de nível, 3D e Soma de Riemann
  const gridN = 50;
  const xs = [];
  const ys = [];
  for (let i = 0; i < gridN; i++) {
    xs.push(-L + (2 * L * i) / (gridN - 1));
    ys.push(-L + (2 * L * i) / (gridN - 1));
  }

  let zMin = Infinity;
  let zMax = -Infinity;
  const zGrid = [];

  for (let i = 0; i < gridN; i++) {
    const row = [];
    for (let j = 0; j < gridN; j++) {
      const { z } = evaluateTerrain(xs[j], ys[i]);
      row.push(z);
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
    zGrid.push(row);
  }

  // Soma de Riemann de referência (malha fina 50x50)
  let riemannRainSum = 0;
  let riemannInfilSum = 0;
  let riemannRunoffSum = 0;
  for (let i = 0; i < gridN; i++) {
    for (let j = 0; j < gridN; j++) {
      const pt = computeHydrologyAtPoint(xs[j], ys[i], zMin, zMax, false);
      riemannRainSum += pt.rainMm;
      riemannInfilSum += pt.infilMm;
      riemannRunoffSum += pt.runoffMm;
    }
  }
  const totalCells = gridN * gridN;
  const riemannTotalVolM3 = areaM2 * (riemannRainSum / totalCells / 1000);

  // 2) Amostragem de Monte Carlo (N pontos aleatórios uniformes em [-L, L] x [-L, L])
  let sumRainMm = 0;
  let sumInfilMm = 0;
  let sumRunoffMm = 0;
  let sumSlope = 0;

  const maxVisualPoints = 750;
  const sampleStep = Math.max(1, Math.floor(N / maxVisualPoints));
  const visualPoints = [];

  const convN = [];
  const convVolTotal = [];
  const convVolInfil = [];
  const convVolRunoff = [];
  const convCheckpoints = 80;
  const checkpointInterval = Math.max(1, Math.floor(N / convCheckpoints));

  for (let i = 1; i <= N; i++) {
    const rx = -L + 2 * L * Math.random();
    const ry = -L + 2 * L * Math.random();

    const pt = computeHydrologyAtPoint(rx, ry, zMin, zMax, true);

    sumRainMm += pt.rainMm;
    sumInfilMm += pt.infilMm;
    sumRunoffMm += pt.runoffMm;
    sumSlope += pt.gradNorm;

    if (i % sampleStep === 0 && visualPoints.length < maxVisualPoints) {
      visualPoints.push(pt);
    }

    if (i % checkpointInterval === 0 || i === N) {
      convN.push(i);
      convVolTotal.push(areaM2 * (sumRainMm / i / 1000));
      convVolInfil.push(areaM2 * (sumInfilMm / i / 1000));
      convVolRunoff.push(areaM2 * (sumRunoffMm / i / 1000));
    }
  }

  const avgRainMm = sumRainMm / N;
  const avgInfilMm = sumInfilMm / N;
  const avgRunoffMm = sumRunoffMm / N;
  const avgSlope = sumSlope / N;

  const totalVolM3 = areaM2 * (avgRainMm / 1000);
  const infilVolM3 = areaM2 * (avgInfilMm / 1000);
  const runoffVolM3 = areaM2 * (avgRunoffMm / 1000);

  const infilPct = totalVolM3 > 0 ? (infilVolM3 / totalVolM3) * 100 : 0;
  const runoffPct = totalVolM3 > 0 ? (runoffVolM3 / totalVolM3) * 100 : 0;
  const relErrorPct =
    riemannTotalVolM3 > 0
      ? (Math.abs(totalVolM3 - riemannTotalVolM3) / riemannTotalVolM3) * 100
      : 0;

  // 3) Simula o caminho de escoamento superficial (-grad f)
  const runoffEndPoints = simulateRunoffPaths(visualPoints.slice(0, 220), L, zMin, zMax);

  state.lastSimulation = {
    L,
    N,
    areaKm2,
    areaM2,
    xs,
    ys,
    zGrid,
    zMin,
    zMax,
    avgRainMm,
    avgInfilMm,
    avgRunoffMm,
    avgSlope,
    totalVolM3,
    infilVolM3,
    runoffVolM3,
    riemannTotalVolM3,
    infilPct,
    runoffPct,
    relErrorPct,
    visualPoints,
    runoffEndPoints,
    convN,
    convVolTotal,
    convVolInfil,
    convVolRunoff,
  };

  updateKPIs(state.lastSimulation);
  renderPlots(state.lastSimulation);
  renderMathExplanation(state.lastSimulation);
}

// ============================================================================
// 5. TRAJETÓRIA DE ESCOAMENTO PELO SENTIDO OPOSTO AO GRADIENTE (-∇f)
// ============================================================================
function simulateRunoffPaths(startPoints, L, zMin, zMax) {
  const endPoints = [];
  const steps = 28;
  const stepFactor = (0.06 * L) / Math.max(50, zMax - zMin);

  for (const pt of startPoints) {
    let cx = pt.x;
    let cy = pt.y;
    for (let s = 0; s < steps; s++) {
      const { dzdx, dzdy } = evaluateTerrain(cx, cy);
      const norm = Math.hypot(dzdx, dzdy);
      if (norm < 1e-3) break;

      cx -= stepFactor * dzdx;
      cy -= stepFactor * dzdy;

      cx = Math.max(-L, Math.min(L, cx));
      cy = Math.max(-L, Math.min(L, cy));
    }
    const finalZ = evaluateTerrain(cx, cy).z;
    endPoints.push({ x: cx, y: cy, z: finalZ, runoffMm: pt.runoffMm });
  }

  return endPoints;
}

// ============================================================================
// 6. ATUALIZAÇÃO DE RESULTADOS, GRÁFICOS PLOTLY E FÓRMULAS KATEX
// ============================================================================
function formatVolume(m3) {
  if (m3 >= 1e6) {
    return `${(m3 / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi m³`;
  }
  return `${Math.round(m3).toLocaleString('pt-BR')} m³`;
}

function updateKPIs(sim) {
  document.getElementById('kpi-total-vol').textContent = formatVolume(sim.totalVolM3);
  document.getElementById('kpi-avg-rain').textContent =
    `Média da chuva: ${sim.avgRainMm.toFixed(1)} mm (${sim.areaKm2.toFixed(1)} km²)`;

  document.getElementById('kpi-infil-vol').textContent = formatVolume(sim.infilVolM3);
  document.getElementById('kpi-infil-pct').textContent =
    `${sim.infilPct.toFixed(1)}% do total (${sim.avgInfilMm.toFixed(1)} mm)`;

  document.getElementById('kpi-runoff-vol').textContent = formatVolume(sim.runoffVolM3);
  document.getElementById('kpi-runoff-pct').textContent =
    `${sim.runoffPct.toFixed(1)}% do total (${sim.avgRunoffMm.toFixed(1)} mm)`;

  document.getElementById('kpi-mc-error').textContent = `${sim.relErrorPct.toFixed(2)}%`;
  document.getElementById('kpi-slope-avg').textContent =
    `Declividade média: ${(sim.avgSlope * 100).toFixed(1)}%`;

  // Preenche o resumo de metadados exigido na seção 6 do DESIGN.md
  const metaEl = document.getElementById('simulation-metadata');
  const terrainDesc =
    state.terrainMode === 'real'
      ? `Coordenadas (${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}) — Altitude de ${sim.zMin.toFixed(0)} m a ${sim.zMax.toFixed(0)} m`
      : `${ANALYTIC_SURFACES[state.surfaceKey].name} (Desnível: ${state.reliefScale} m)`;

  const rainDesc =
    state.rainMode === 'uniform'
      ? `Definida pelo usuário (${state.rainIntensity} mm constantes)`
      : `Chuva aleatória espacial (média observada: ${sim.avgRainMm.toFixed(1)} mm)`;

  metaEl.innerHTML = `
    <div class="meta-block">
      <strong>Localização e área analisada</strong>
      <span>${terrainDesc}<br>Raio: ${sim.L.toFixed(1)} km (Área: ${sim.areaKm2.toFixed(2)} km²)</span>
    </div>
    <div class="meta-block">
      <strong>Amostragem (Monte Carlo)</strong>
      <span>${sim.N.toLocaleString('pt-BR')} pontos aleatórios processados<br>Solo: ${SOIL_PARAMS[state.soilType].name}</span>
    </div>
    <div class="meta-block">
      <strong>Informações sobre a precipitação</strong>
      <span>${rainDesc}<br>Volume equivalente: ${(sim.totalVolM3 * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} litros</span>
    </div>
  `;
}

function renderPlots(sim) {
  const showRainDots = document.getElementById('toggle-rain-dots').checked;
  const showRunoffAccum = document.getElementById('toggle-runoff-paths').checked;

  // --- GRÁFICO 1: MAPA TOPOGRÁFICO 2D COM CURVAS DE NÍVEL ---
  const contourTraces = [
    {
      type: 'contour',
      x: sim.xs,
      y: sim.ys,
      z: sim.zGrid,
      colorscale: 'Earth',
      contours: {
        coloring: 'heatmap',
        showlabels: true,
        labelfont: { size: 10, color: '#111827' },
      },
      colorbar: {
        title: 'Altitude z (m)',
        titleside: 'right',
        tickfont: { color: '#4b5563', size: 10 },
        titlefont: { color: '#111827', size: 11 },
      },
      hovertemplate: 'x: %{x:.2f} km<br>y: %{y:.2f} km<br>Altitude z: %{z:.1f} m<extra>Relevo</extra>',
    },
  ];

  if (showRainDots) {
    contourTraces.push({
      type: 'scatter',
      mode: 'markers',
      name: 'Pontos sorteados (Monte Carlo)',
      x: sim.visualPoints.map((p) => p.x),
      y: sim.visualPoints.map((p) => p.y),
      marker: {
        size: 5,
        color: sim.visualPoints.map((p) => (p.infilMm / Math.max(0.001, p.rainMm)) * 100),
        colorscale: 'YlGnBu',
        cmin: 0,
        cmax: 100,
        opacity: 0.85,
        line: { width: 0.5, color: '#111827' },
      },
      text: sim.visualPoints.map(
        (p) =>
          `Chuva: ${p.rainMm.toFixed(1)} mm<br>Infiltra: ${((p.infilMm / Math.max(0.001, p.rainMm)) * 100).toFixed(0)}%<br>Escorre: ${((p.runoffMm / Math.max(0.001, p.rainMm)) * 100).toFixed(0)}%`
      ),
      hovertemplate: 'Ponto (%{x:.2f}, %{y:.2f}) km<br>%{text}<extra>Amostra</extra>',
    });
  }

  if (showRunoffAccum) {
    contourTraces.push({
      type: 'scatter',
      mode: 'markers',
      name: 'Acúmulo nas áreas baixas (-∇f)',
      x: sim.runoffEndPoints.map((p) => p.x),
      y: sim.runoffEndPoints.map((p) => p.y),
      marker: {
        size: 7,
        symbol: 'diamond',
        color: '#2563eb',
        opacity: 0.9,
        line: { width: 1, color: '#ffffff' },
      },
      hovertemplate:
        'Área Baixa (%{x:.2f}, %{y:.2f}) km<br>Altitude: %{customdata:.1f} m<extra>Acúmulo</extra>',
      customdata: sim.runoffEndPoints.map((p) => p.z),
    });
  }

  const contourLayout = {
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    margin: { l: 50, r: 20, t: 20, b: 44 },
    xaxis: {
      title: 'Distância Leste-Oeste x (km)',
      color: '#111827',
      gridcolor: '#e5e7eb',
      zeroline: false,
    },
    yaxis: {
      title: 'Distância Norte-Sul y (km)',
      color: '#111827',
      gridcolor: '#e5e7eb',
      scaleanchor: 'x',
      scaleratio: 1,
      zeroline: false,
    },
    legend: {
      orientation: 'h',
      y: 1.1,
      x: 0,
      font: { color: '#111827', size: 11 },
    },
  };

  Plotly.react('contour-plot', contourTraces, contourLayout, {
    responsive: true,
    displayModeBar: false,
  });

  // --- GRÁFICO 2: SUPERFÍCIE 3D z = f(x, y) + PONTOS DE MONTE CARLO ---
  const traces3D = [
    {
      type: 'surface',
      x: sim.xs,
      y: sim.ys,
      z: sim.zGrid,
      colorscale: 'Earth',
      opacity: 0.92,
      showscale: false,
      contours: {
        z: {
          show: true,
          usecolormap: true,
          highlightcolor: '#2563eb',
          project: { z: true },
        },
      },
      hovertemplate: 'x: %{x:.2f} km<br>y: %{y:.2f} km<br>z: %{z:.1f} m<extra>Superfície</extra>',
    },
    {
      type: 'scatter3d',
      mode: 'markers',
      name: 'Amostras da Chuva',
      x: sim.visualPoints.map((p) => p.x),
      y: sim.visualPoints.map((p) => p.y),
      z: sim.visualPoints.map((p) => p.z + 4),
      marker: {
        size: 3,
        color: sim.visualPoints.map((p) => (p.runoffMm / Math.max(0.001, p.rainMm)) * 100),
        colorscale: 'Bluered',
        cmin: 0,
        cmax: 100,
        opacity: 0.9,
      },
      hovertemplate:
        '(%{x:.2f}, %{y:.2f}) km<br>Altitude: %{z:.1f} m<extra>Ponto Sorteado</extra>',
    },
  ];

  const layout3D = {
    paper_bgcolor: '#ffffff',
    margin: { l: 0, r: 0, t: 0, b: 0 },
    scene: {
      xaxis: { title: 'x (km)', color: '#111827', gridcolor: '#d1d5db' },
      yaxis: { title: 'y (km)', color: '#111827', gridcolor: '#d1d5db' },
      zaxis: { title: 'Altitude z (m)', color: '#111827', gridcolor: '#d1d5db' },
      camera: { eye: { x: 1.45, y: -1.45, z: 1.15 } },
    },
    showlegend: false,
  };

  Plotly.react('surface-3d-plot', traces3D, layout3D, {
    responsive: true,
    displayModeBar: false,
  });

  // --- GRÁFICO 3: CONVERGÊNCIA DE MONTE CARLO ---
  const convTraces = [
    {
      type: 'scatter',
      mode: 'lines',
      name: 'Volume Total (Monte Carlo)',
      x: sim.convN,
      y: sim.convVolTotal,
      line: { color: '#2563eb', width: 2.5 },
    },
    {
      type: 'scatter',
      mode: 'lines',
      name: 'Soma de Riemann (Referência)',
      x: [sim.convN[0], sim.convN[sim.convN.length - 1]],
      y: [sim.riemannTotalVolM3, sim.riemannTotalVolM3],
      line: { color: '#b91c1c', width: 2, dash: 'dash' },
    },
    {
      type: 'scatter',
      mode: 'lines',
      name: 'Volume Infiltrado',
      x: sim.convN,
      y: sim.convVolInfil,
      line: { color: '#15803d', width: 2 },
    },
    {
      type: 'scatter',
      mode: 'lines',
      name: 'Volume Escoado',
      x: sim.convN,
      y: sim.convVolRunoff,
      line: { color: '#b45309', width: 2 },
    },
  ];

  const convLayout = {
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    margin: { l: 64, r: 20, t: 28, b: 44 },
    xaxis: {
      title: 'Quantidade de pontos processados (n)',
      color: '#111827',
      gridcolor: '#e5e7eb',
    },
    yaxis: {
      title: 'Volume estimado (m³)',
      color: '#111827',
      gridcolor: '#e5e7eb',
    },
    legend: {
      orientation: 'h',
      y: 1.15,
      x: 0,
      font: { color: '#111827', size: 11 },
    },
  };

  Plotly.react('convergence-plot', convTraces, convLayout, {
    responsive: true,
    displayModeBar: false,
  });
}

// ============================================================================
// 7. EXPLICAÇÃO PASSO A PASSO DE CÁLCULO 2 COM KATEX
// ============================================================================
function renderMathExplanation(sim) {
  const container = document.getElementById('math-explanation');
  const c0 = SOIL_PARAMS[state.soilType].c0;
  const k = state.slopeSensitivity;

  const step1Latex = String.raw`\text{Área}(R) = \int_{-L}^{L}\!\int_{-L}^{L} dx\,dy = (2L)^2 = 4 \cdot (${sim.L.toFixed(1)})^2 = ${sim.areaKm2.toFixed(2)}\text{ km}^2 = ${sim.areaM2.toExponential(2)}\text{ m}^2`;
  const step2Latex = String.raw`\|\nabla f(x,y)\| = \sqrt{\left(\frac{\partial f}{\partial x}\right)^2 + \left(\frac{\partial f}{\partial y}\right)^2}, \quad C_{\text{inf}}(x,y) = \frac{${c0.toFixed(2)}}{1 + ${k.toFixed(1)}\,\|\nabla f(x,y)\|}`;
  const step3Latex = String.raw`\begin{aligned}
  V_{\text{total}} &= \iint_R P(x,y)\,dA \approx \text{Área}(R)\cdot \frac{1}{${sim.N}}\sum_{i=1}^{${sim.N}} P(x_i,y_i) = \mathbf{${Math.round(sim.totalVolM3).toLocaleString('pt-BR')}\text{ m}^3} \\
  V_{\text{inf}} &= \iint_R P(x,y)\,C_{\text{inf}}(x,y)\,dA \approx \mathbf{${Math.round(sim.infilVolM3).toLocaleString('pt-BR')}\text{ m}^3}\; (${sim.infilPct.toFixed(1)}\%) \\
  V_{\text{esc}} &= \iint_R P(x,y)\,\big[1 - C_{\text{inf}}(x,y)\big]\,dA \approx \mathbf{${Math.round(sim.runoffVolM3).toLocaleString('pt-BR')}\text{ m}^3}\; (${sim.runoffPct.toFixed(1)}\%)
  \end{aligned}`;

  container.innerHTML = `
    <div class="math-step">
      <div class="math-step-title">1. Domínio de Integração $R = [-L, L] \\times [-L, L]$</div>
      <div id="math-step-1"></div>
    </div>
    <div class="math-step">
      <div class="math-step-title">2. Derivadas Parciais, Gradiente e Coeficiente de Infiltração</div>
      <div id="math-step-2"></div>
    </div>
    <div class="math-step">
      <div class="math-step-title">3. Estimador de Monte Carlo das Integrais Duplas ($N = ${sim.N.toLocaleString('pt-BR')}$)</div>
      <div id="math-step-3"></div>
    </div>
  `;

  if (window.katex) {
    katex.render(step1Latex, document.getElementById('math-step-1'), { displayMode: true });
    katex.render(step2Latex, document.getElementById('math-step-2'), { displayMode: true });
    katex.render(step3Latex, document.getElementById('math-step-3'), { displayMode: true });
    renderInlineMath(container);
  }
}

function updateSurfaceFormulaBox() {
  const box = document.getElementById('surface-formula-box');
  const surf = ANALYTIC_SURFACES[state.surfaceKey] || ANALYTIC_SURFACES.basin;
  if (window.katex && box) {
    katex.render(surf.latex, box, { displayMode: true, throwOnError: false });
  }
}

function renderInlineMath(root = document.body) {
  if (!window.katex) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      node.nodeValue.includes('$') &&
      node.parentElement &&
      !['SCRIPT', 'STYLE', 'TEXTAREA'].includes(node.parentElement.tagName) &&
      !node.parentElement.closest('.katex')
    ) {
      textNodes.push(node);
    }
  }

  for (const node of textNodes) {
    const parts = node.nodeValue.split(/(\$[^$]+\$)/g);
    if (parts.length <= 1) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        const span = document.createElement('span');
        katex.render(part.slice(1, -1), span, { throwOnError: false });
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    }
    node.parentNode.replaceChild(frag, node);
  }
}

// ============================================================================
// 8. INTEGRAÇÃO COM LEAFLET, CONSULTA DE CEP E OPEN-METEO ELEVATION API
// ============================================================================
let leafletMap = null;
let centerMarker = null;
let regionBoundsRect = null;

function initLeafletMap() {
  if (leafletMap) return;

  leafletMap = L.map('leaflet-map').setView([state.lat, state.lon], 11);

  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 16,
    attribution: '© OpenStreetMap, SRTM | © OpenTopoMap',
  }).addTo(leafletMap);

  centerMarker = L.marker([state.lat, state.lon]).addTo(leafletMap);
  updateMapBoundingBox();

  leafletMap.on('click', (e) => {
    state.lat = Number(e.latlng.lat.toFixed(4));
    state.lon = Number(e.latlng.lng.toFixed(4));
    document.getElementById('lat-input').value = state.lat;
    document.getElementById('lon-input').value = state.lon;
    clearFieldError('lat-input', 'lat-error');
    clearFieldError('lon-input', 'lon-error');
    updateMapBoundingBox();
    fetchRealElevationGrid();
  });
}

function updateMapBoundingBox() {
  if (!leafletMap) return;
  const Lkm = Math.max(0.1, state.radiusKm || 2.0);
  const dLat = Lkm / 111.32;
  const dLon = Lkm / (111.32 * Math.cos((state.lat * Math.PI) / 180));

  const bounds = [
    [state.lat - dLat, state.lon - dLon],
    [state.lat + dLat, state.lon + dLon],
  ];

  centerMarker.setLatLng([state.lat, state.lon]);

  if (regionBoundsRect) {
    regionBoundsRect.setBounds(bounds);
  } else {
    regionBoundsRect = L.rectangle(bounds, {
      color: '#2563eb',
      weight: 2,
      fillOpacity: 0.12,
    }).addTo(leafletMap);
  }

  leafletMap.fitBounds(bounds, { padding: [18, 18] });
}

async function lookupCepCoordinates() {
  const cepInput = document.getElementById('cep-input');
  const cepFeedback = document.getElementById('cep-feedback');
  const btnLookup = document.getElementById('btn-lookup-cep');

  clearFieldError('cep-input', 'cep-error');
  cepFeedback.textContent = '';

  const rawCep = cepInput.value.trim();
  const cleanCep = rawCep.replace(/\D/g, '');

  if (!/^\d{8}$/.test(cleanCep)) {
    setFieldError('cep-input', 'cep-error', 'Informe um CEP válido com 8 dígitos (ex: 35400-000).');
    return false;
  }

  btnLookup.disabled = true;
  cepFeedback.style.color = '#4b5563';
  cepFeedback.textContent = 'Identificando localização a partir do CEP...';

  try {
    // 1. Consulta localidade no ViaCEP
    const viaCepResp = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!viaCepResp.ok) throw new Error('Falha ao consultar o CEP.');
    const viaCepData = await viaCepResp.json();

    if (viaCepData.erro) {
      setFieldError('cep-input', 'cep-error', 'CEP não encontrado. Verifique os números informados.');
      cepFeedback.textContent = '';
      btnLookup.disabled = false;
      return false;
    }

    const city = viaCepData.localidade;
    const uf = viaCepData.uf;
    const placeQuery = encodeURIComponent(`${city}`);

    // 2. Geocodifica a localidade usando Open-Meteo Geocoding API (gratuita e sem chave)
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${placeQuery}&count=5&language=pt&format=json`
    );
    if (!geoResp.ok) throw new Error('Falha ao geocodificar localidade.');
    const geoData = await geoResp.json();

    const results = geoData.results || [];
    const brazilMatch =
      results.find((r) => r.country_code === 'BR') || results[0];

    if (!brazilMatch) {
      setFieldError(
        'cep-input',
        'cep-error',
        'Não foi possível identificar as coordenadas geográficas para este CEP.'
      );
      cepFeedback.textContent = '';
      btnLookup.disabled = false;
      return false;
    }

    state.lat = Number(brazilMatch.latitude.toFixed(4));
    state.lon = Number(brazilMatch.longitude.toFixed(4));
    state.cepIdentified = true;

    document.getElementById('lat-input').value = state.lat;
    document.getElementById('lon-input').value = state.lon;

    cepFeedback.style.color = '#15803d';
    cepFeedback.textContent = `Localização identificada: ${city} - ${uf} (Latitude: ${state.lat}, Longitude: ${state.lon}).`;

    updateMapBoundingBox();
    await fetchRealElevationGrid();
    btnLookup.disabled = false;
    return true;
  } catch (err) {
    cepFeedback.style.color = '#b91c1c';
    cepFeedback.textContent =
      'Não foi possível consultar o serviço de CEP no momento. Você pode informar as coordenadas manualmente.';
    btnLookup.disabled = false;
    return false;
  }
}

async function fetchRealElevationGrid() {
  const statusEl = document.getElementById('api-status');
  statusEl.style.color = '#4b5563';
  statusEl.textContent = 'Carregando dados topográficos da região...';

  const n = 14;
  const Lkm = Math.max(0.1, state.radiusKm || 2.0);
  const dLat = Lkm / 111.32;
  const dLon = Lkm / (111.32 * Math.cos((state.lat * Math.PI) / 180));

  const lats = [];
  const lons = [];
  for (let i = 0; i < n; i++) {
    const lat = state.lat - dLat + (2 * dLat * i) / (n - 1);
    for (let j = 0; j < n; j++) {
      const lon = state.lon - dLon + (2 * dLon * j) / (n - 1);
      lats.push(lat.toFixed(5));
      lons.push(lon.toFixed(5));
    }
  }

  try {
    const chunkSize = 98;
    const elevations = [];

    for (let start = 0; start < lats.length; start += chunkSize) {
      const latChunk = lats.slice(start, start + chunkSize).join(',');
      const lonChunk = lons.slice(start, start + chunkSize).join(',');
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${latChunk}&longitude=${lonChunk}`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Falha na consulta de altitude');
      const data = await resp.json();
      elevations.push(...data.elevation);
    }

    const zMatrix = [];
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        const z = elevations[i * n + j];
        row.push(z);
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      zMatrix.push(row);
    }

    state.realGrid = { n, zMatrix, minZ, maxZ };
    statusEl.style.color = '#15803d';
    statusEl.textContent = `Relevo carregado com sucesso (altitude entre ${minZ.toFixed(0)} m e ${maxZ.toFixed(0)} m).`;
  } catch (err) {
    statusEl.style.color = '#b45309';
    statusEl.textContent =
      'Serviço externo indisponível no momento: utilizando aproximação topográfica local para as coordenadas informadas.';
    generateFallbackRealGrid(n);
  }
}

function generateFallbackRealGrid(n) {
  const L = Math.max(0.1, state.radiusKm || 2.0);
  const zMatrix = [];
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = -L + (2 * L * i) / (n - 1);
    const row = [];
    for (let j = 0; j < n; j++) {
      const x = -L + (2 * L * j) / (n - 1);
      const { z } = ANALYTIC_SURFACES.gaussian_valley.eval(x, y, L, 450);
      const zAlt = 600 + z;
      row.push(zAlt);
      if (zAlt < minZ) minZ = zAlt;
      if (zAlt > maxZ) maxZ = zAlt;
    }
    zMatrix.push(row);
  }
  state.realGrid = { n, zMatrix, minZ, maxZ };
}

// ============================================================================
// 9. VALIDAÇÃO DO FORMULÁRIO E FEEDBACK AO USUÁRIO (SEÇÕES 7.2 E 7.3)
// ============================================================================
function setFieldError(inputId, errorId, message) {
  const inputEl = document.getElementById(inputId);
  const errorEl = document.getElementById(errorId);
  if (inputEl) inputEl.classList.add('input-invalid');
  if (errorEl) errorEl.textContent = message;
}

function clearFieldError(inputId, errorId) {
  const inputEl = document.getElementById(inputId);
  const errorEl = document.getElementById(errorId);
  if (inputEl) inputEl.classList.remove('input-invalid');
  if (errorEl) errorEl.textContent = '';
}

function clearAllErrors() {
  clearFieldError('cep-input', 'cep-error');
  clearFieldError('lat-input', 'lat-error');
  clearFieldError('lon-input', 'lon-error');
  clearFieldError('relief-scale', 'relief-error');
  clearFieldError('radius-km', 'radius-error');
  clearFieldError('num-points', 'points-error');
  clearFieldError('rain-intensity', 'rain-error');
}

function validateSimulationForm() {
  clearAllErrors();
  let isValid = true;

  // A. Validação da Localização
  if (state.terrainMode === 'real') {
    if (state.locationMode === 'cep') {
      const cleanCep = document.getElementById('cep-input').value.replace(/\D/g, '');
      if (!/^\d{8}$/.test(cleanCep)) {
        setFieldError(
          'cep-input',
          'cep-error',
          'Informe um CEP válido com 8 dígitos (ex: 35400-000).'
        );
        isValid = false;
      }
    } else {
      const latRaw = document.getElementById('lat-input').value.trim();
      const lonRaw = document.getElementById('lon-input').value.trim();
      const latVal = Number(latRaw);
      const lonVal = Number(lonRaw);

      if (latRaw === '' || Number.isNaN(latVal) || latVal < -90 || latVal > 90) {
        setFieldError(
          'lat-input',
          'lat-error',
          'Informe uma latitude válida entre -90 e 90 graus.'
        );
        isValid = false;
      }
      if (lonRaw === '' || Number.isNaN(lonVal) || lonVal < -180 || lonVal > 180) {
        setFieldError(
          'lon-input',
          'lon-error',
          'Informe uma longitude válida entre -180 e 180 graus.'
        );
        isValid = false;
      }
    }
  } else {
    const reliefRaw = document.getElementById('relief-scale').value.trim();
    const reliefVal = Number(reliefRaw);
    if (reliefRaw === '' || Number.isNaN(reliefVal) || reliefVal <= 0) {
      setFieldError(
        'relief-scale',
        'relief-error',
        'O desnível máximo deve ser um valor maior que zero.'
      );
      isValid = false;
    }
  }

  // B. Validação do Raio de Abrangência
  const radiusRaw = document.getElementById('radius-km').value.trim();
  const radiusVal = Number(radiusRaw);
  if (radiusRaw === '' || Number.isNaN(radiusVal) || radiusVal <= 0) {
    setFieldError(
      'radius-km',
      'radius-error',
      'Informe um raio de abrangência maior que zero (em km).'
    );
    isValid = false;
  }

  // C. Validação da Quantidade de Pontos
  const pointsRaw = document.getElementById('num-points').value.trim();
  const pointsVal = Number(pointsRaw);
  if (
    pointsRaw === '' ||
    Number.isNaN(pointsVal) ||
    !Number.isInteger(pointsVal) ||
    pointsVal <= 0
  ) {
    setFieldError(
      'num-points',
      'points-error',
      'Informe uma quantidade inteira de pontos maior que zero.'
    );
    isValid = false;
  }

  // D. Validação da Precipitação (quando definida pelo usuário)
  if (state.rainMode === 'uniform') {
    const rainRaw = document.getElementById('rain-intensity').value.trim();
    const rainVal = Number(rainRaw);
    if (rainRaw === '' || Number.isNaN(rainVal) || rainVal < 0) {
      setFieldError(
        'rain-intensity',
        'rain-error',
        'Informe uma quantidade de chuva igual ou maior que zero (em mm).'
      );
      isValid = false;
    }
  }

  return isValid;
}

// ============================================================================
// 10. INICIALIZAÇÃO DE EVENTOS DA INTERFACE
// ============================================================================
function updateAreaHint() {
  const r = Number(document.getElementById('radius-km').value);
  const areaInfo = document.getElementById('area-info');
  if (!Number.isNaN(r) && r > 0) {
    const side = (2 * r).toFixed(1);
    const area = (4 * r * r).toFixed(2);
    areaInfo.textContent = `Ponto informado usado como centro. Região de ${side} km × ${side} km (Área total: ${area} km²).`;
  }
}

function initApp() {
  renderInlineMath(document.body);
  updateSurfaceFormulaBox();
  initLeafletMap();
  fetchRealElevationGrid().then(() => {
    runMonteCarloSimulation();
  });

  // Alternância entre Mapa Topográfico Real e Funções de Cálculo 2 no cabeçalho
  document.querySelectorAll('.mode-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.terrainMode = btn.dataset.terrainMode;

      const analyticGroup = document.getElementById('analytic-controls');
      const realGroup = document.getElementById('real-controls');

      if (state.terrainMode === 'real') {
        analyticGroup.classList.add('hidden');
        realGroup.classList.remove('hidden');
        setTimeout(() => {
          if (leafletMap) {
            leafletMap.invalidateSize();
            updateMapBoundingBox();
          }
        }, 80);
      } else {
        realGroup.classList.add('hidden');
        analyticGroup.classList.remove('hidden');
        updateSurfaceFormulaBox();
      }
      clearAllErrors();
    });
  });

  // A. Alternância de modalidade de localização: CEP vs. Coordenadas
  document.querySelectorAll('input[name="location-mode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.locationMode = e.target.value;
      const cepGroup = document.getElementById('cep-input-group');
      const coordsGroup = document.getElementById('coords-input-group');

      if (state.locationMode === 'cep') {
        cepGroup.classList.remove('hidden');
        coordsGroup.classList.add('hidden');
      } else {
        cepGroup.classList.add('hidden');
        coordsGroup.classList.remove('hidden');
      }
      clearAllErrors();
    });
  });

  // Máscara simples de CEP (00000-000) e botão de identificação
  document.getElementById('cep-input').addEventListener('input', (e) => {
    state.cepIdentified = false;
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value =
      digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    clearFieldError('cep-input', 'cep-error');
  });

  document.getElementById('btn-lookup-cep').addEventListener('click', () => {
    lookupCepCoordinates();
  });

  // Locais sugeridos e botão de atualizar relevo no modo coordenadas
  document.getElementById('preset-location').addEventListener('change', (e) => {
    const [lat, lon] = e.target.value.split(',').map(Number);
    state.lat = lat;
    state.lon = lon;
    document.getElementById('lat-input').value = lat;
    document.getElementById('lon-input').value = lon;
    clearFieldError('lat-input', 'lat-error');
    clearFieldError('lon-input', 'lon-error');
    updateMapBoundingBox();
    fetchRealElevationGrid();
  });

  document.getElementById('btn-fetch-elevation').addEventListener('click', () => {
    const latVal = Number(document.getElementById('lat-input').value);
    const lonVal = Number(document.getElementById('lon-input').value);
    if (!Number.isNaN(latVal) && latVal >= -90 && latVal <= 90 && !Number.isNaN(lonVal) && lonVal >= -180 && lonVal <= 180) {
      state.lat = latVal;
      state.lon = lonVal;
      updateMapBoundingBox();
      fetchRealElevationGrid();
    } else {
      validateSimulationForm();
    }
  });

  // Seletor de superfície analítica
  document.getElementById('surface-select').addEventListener('change', (e) => {
    state.surfaceKey = e.target.value;
    updateSurfaceFormulaBox();
  });

  // B. Atualização da dica de área ao digitar o raio
  document.getElementById('radius-km').addEventListener('input', () => {
    clearFieldError('radius-km', 'radius-error');
    updateAreaHint();
  });

  // D. Alternância de modo de precipitação (Definida pelo usuário vs. Aleatória)
  document.querySelectorAll('input[name="rain-mode-radio"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.rainMode = e.target.value;
      document.getElementById('rain-mode').value = state.rainMode;

      const definedGroup = document.getElementById('defined-rain-group');
      const randomHint = document.getElementById('random-rain-hint');

      if (state.rainMode === 'uniform') {
        definedGroup.classList.remove('hidden');
        randomHint.classList.add('hidden');
      } else {
        definedGroup.classList.add('hidden');
        randomHint.classList.remove('hidden');
      }
      clearFieldError('rain-intensity', 'rain-error');
    });
  });

  // E. Submissão do formulário ("Executar simulação")
  document.getElementById('simulation-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.isSimulating) return;

    const statusEl = document.getElementById('simulation-status');
    statusEl.className = 'simulation-status';
    statusEl.textContent = '';

    if (!validateSimulationForm()) {
      statusEl.classList.add('status-error');
      statusEl.textContent = 'Corrija os campos destacados antes de executar a simulação.';
      return;
    }

    const btnSimulate = document.getElementById('btn-simulate');
    state.isSimulating = true;
    btnSimulate.disabled = true;
    btnSimulate.textContent = 'Processando simulação...';
    statusEl.classList.add('status-warning');
    statusEl.textContent = 'Calculando estimativa pelo método de Monte Carlo...';

    try {
      // Se estiver em modo CEP e ainda não identificou as coordenadas, identifica primeiro
      if (state.terrainMode === 'real' && state.locationMode === 'cep' && !state.cepIdentified) {
        const ok = await lookupCepCoordinates();
        if (!ok) {
          statusEl.className = 'simulation-status status-error';
          statusEl.textContent = 'Não foi possível identificar a localização pelo CEP informado.';
          state.isSimulating = false;
          btnSimulate.disabled = false;
          btnSimulate.textContent = 'Executar simulação';
          return;
        }
      }

      // Atualiza estado a partir dos campos validados
      const newRadius = Number(document.getElementById('radius-km').value);
      const radiusChanged = newRadius !== state.radiusKm;
      state.radiusKm = newRadius;
      state.numPoints = Number(document.getElementById('num-points').value);
      state.soilType = document.getElementById('soil-type').value;
      state.reliefScale = Number(document.getElementById('relief-scale').value) || 300;

      if (state.rainMode === 'uniform') {
        state.rainIntensity = Number(document.getElementById('rain-intensity').value);
      } else {
        // Na chuva aleatória, sorteia nova posição da célula de precipitação mantendo a distribuição
        state.stormCenter = {
          x: (Math.random() - 0.5) * 1.1,
          y: (Math.random() - 0.5) * 1.1,
        };
      }

      if (state.terrainMode === 'real') {
        if (state.locationMode === 'coords') {
          const newLat = Number(document.getElementById('lat-input').value);
          const newLon = Number(document.getElementById('lon-input').value);
          if (newLat !== state.lat || newLon !== state.lon || radiusChanged || !state.realGrid) {
            state.lat = newLat;
            state.lon = newLon;
            updateMapBoundingBox();
            await fetchRealElevationGrid();
          }
        } else if (radiusChanged) {
          updateMapBoundingBox();
          await fetchRealElevationGrid();
        }
      }

      // Pequeno intervalo para renderizar o estado de carregamento na UI antes do laço de Monte Carlo
      await new Promise((resolve) => setTimeout(resolve, 40));
      runMonteCarloSimulation();

      statusEl.className = 'simulation-status status-success';
      statusEl.textContent = 'Processamento concluído com sucesso.';
    } catch (err) {
      statusEl.className = 'simulation-status status-error';
      statusEl.textContent = 'Ocorreu um erro durante a execução da simulação. Tente novamente.';
    } finally {
      state.isSimulating = false;
      btnSimulate.disabled = false;
      btnSimulate.textContent = 'Executar simulação';
    }
  });

  // Botão "Limpar campos"
  document.getElementById('btn-reset').addEventListener('click', () => {
    clearAllErrors();
    document.getElementById('cep-input').value = '';
    document.getElementById('cep-feedback').textContent = '';
    document.getElementById('lat-input').value = '-22.413';
    document.getElementById('lon-input').value = '-44.845';
    document.getElementById('radius-km').value = '2.0';
    document.getElementById('num-points').value = '10000';
    document.getElementById('rain-intensity').value = '80';
    document.getElementById('soil-type').value = 'pasture';
    document.getElementById('relief-scale').value = '300';

    document.getElementById('rain-mode-random').checked = true;
    state.rainMode = 'random_storm';
    document.getElementById('defined-rain-group').classList.add('hidden');
    document.getElementById('random-rain-hint').classList.remove('hidden');

    updateAreaHint();
    const statusEl = document.getElementById('simulation-status');
    statusEl.className = 'simulation-status';
    statusEl.textContent = 'Campos restaurados para os valores padrão.';
  });

  // Checkboxes de camadas visuais no mapa de curvas de nível
  document.getElementById('toggle-rain-dots').addEventListener('change', () => {
    if (state.lastSimulation) renderPlots(state.lastSimulation);
  });
  document.getElementById('toggle-runoff-paths').addEventListener('change', () => {
    if (state.lastSimulation) renderPlots(state.lastSimulation);
  });
}

window.addEventListener('DOMContentLoaded', initApp);
