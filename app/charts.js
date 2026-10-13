// Gráfico de linha em SVG, sem bibliotecas. Uma série por gráfico (pequenos múltiplos), linha de meta tracejada,
// lacunas para dados não informados (null), crosshair + tooltip por ponteiro e teclado, e visão em tabela.
import { h, brl, nf, pct, data } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const FMT = { brl, pct: (v) => pct(v, 2), num: (v) => nf(v, 1), x: (v) => `${nf(v, 2)}x` };

export function graficoLinha({ titulo, pontos, formato = "num", meta = null, rotuloMeta = "Meta", marcadores = [] }) {
  const f = FMT[formato] || FMT.num;
  const raiz = h("figure", { class: "grafico" });
  const cab = h("figcaption", null, h("b", null, titulo));
  const area = h("div", { class: "grafico-area" });
  const tip = h("div", { class: "grafico-tip", hidden: true, role: "status" });
  area.append(tip);
  const validos = pontos.filter((p) => p.y !== null && p.y !== undefined);
  const ultimo = validos.slice(-1)[0];
  if (ultimo) cab.append(h("span", { class: "grafico-ultimo" }, f(ultimo.y)));
  const tab = h("details", { class: "grafico-tab" }, h("summary", null, "Ver como tabela"),
    h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Período"), h("th", { class: "num" }, titulo))), h("tbody", null, pontos.map((p) => h("tr", null, h("td", null, data(p.x)), h("td", { class: "num" }, p.y === null || p.y === undefined ? "não informado" : f(p.y))))))));
  raiz.append(cab, area, tab);
  if (!validos.length) { area.append(h("div", { class: "empty" }, "Sem dados informados para este indicador.")); return raiz; }

  const desenhar = () => {
    const W = Math.max(area.clientWidth || 320, 240), Ht = 190, m = { t: 12, r: 14, b: 26, l: 56 };
    area.querySelector("svg")?.remove();
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, role: "img", tabindex: "0", "aria-label": `${titulo}: ${pontos.length} períodos. Último valor ${f(ultimo.y)}.` });
    const ys = validos.map((p) => p.y).concat(isFinite(meta) && meta !== null ? [meta] : []);
    let lo = Math.min(...ys), hi = Math.max(...ys); if (lo === hi) { lo = lo * 0.9; hi = hi * 1.1 || 1; }
    const pad = (hi - lo) * 0.12; lo = Math.max(0, lo - pad); hi += pad;
    m.l = Math.max(44, Math.max(...[0, 1, 2, 3].map((i) => f(lo + ((hi - lo) * i) / 3).length)) * 6.3 + 14);
    const ts = pontos.map((p) => Date.parse(`${p.x}T12:00:00Z`)); const t0 = Math.min(...ts), t1 = Math.max(...ts);
    const X = (i) => m.l + (t1 === t0 ? (W - m.l - m.r) / 2 : ((ts[i] - t0) / (t1 - t0)) * (W - m.l - m.r));
    const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (Ht - m.t - m.b);
    for (let i = 0; i <= 3; i++) {
      const v = lo + ((hi - lo) * i) / 3, y = Y(v);
      svg.append(svgEl("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "g-grade" }));
      const t = svgEl("text", { x: m.l - 8, y: y + 4, class: "g-eixo", "text-anchor": "end" }); t.textContent = f(v); svg.append(t);
    }
    [0, pontos.length - 1].filter((v, i, a) => a.indexOf(v) === i).forEach((i) => { const t = svgEl("text", { x: X(i), y: Ht - 6, class: "g-eixo", "text-anchor": i === 0 && pontos.length > 1 ? "start" : "end" }); t.textContent = data(pontos[i].x).slice(0, 5); svg.append(t); });
    if (meta !== null && Number.isFinite(meta)) {
      svg.append(svgEl("line", { x1: m.l, x2: W - m.r, y1: Y(meta), y2: Y(meta), class: "g-meta" }));
      const t = svgEl("text", { x: W - m.r, y: Y(meta) - 5, class: "g-meta-t", "text-anchor": "end" }); t.textContent = `${rotuloMeta} ${f(meta)}`; svg.append(t);
    }
    for (const mk of marcadores) { const t = Date.parse(`${mk.x}T12:00:00Z`); if (t < t0 || t > t1) continue; const x = m.l + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * (W - m.l - m.r)); svg.append(svgEl("line", { x1: x, x2: x, y1: m.t, y2: Ht - m.b, class: "g-marca" })); const tt = svgEl("title"); tt.textContent = mk.rotulo; svg.lastChild.append(tt); }
    let d = ""; pontos.forEach((p, i) => { if (p.y === null || p.y === undefined) { d += ""; return; } const prevNull = i === 0 || pontos[i - 1].y === null || pontos[i - 1].y === undefined; d += `${prevNull ? "M" : "L"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`; });
    svg.append(svgEl("path", { d, class: "g-linha" }));
    pontos.forEach((p, i) => { if (p.y !== null && p.y !== undefined) svg.append(svgEl("circle", { cx: X(i), cy: Y(p.y), r: 3.5, class: "g-ponto" })); });
    const cruz = svgEl("line", { y1: m.t, y2: Ht - m.b, class: "g-cruz", visibility: "hidden" }); const foco = svgEl("circle", { r: 5.5, class: "g-foco", visibility: "hidden" }); svg.append(cruz, foco);
    let idx = pontos.length - 1;
    const mostrar = (i) => {
      idx = i; const p = pontos[i], x = X(i);
      cruz.setAttribute("x1", x); cruz.setAttribute("x2", x); cruz.setAttribute("visibility", "visible");
      if (p.y !== null && p.y !== undefined) { foco.setAttribute("cx", x); foco.setAttribute("cy", Y(p.y)); foco.setAttribute("visibility", "visible"); } else foco.setAttribute("visibility", "hidden");
      tip.hidden = false; tip.textContent = "";
      tip.append(h("div", { class: "tip-valor" }, p.y === null || p.y === undefined ? "não informado" : f(p.y)), h("div", { class: "tip-rot" }, `${titulo} · até ${data(p.x)}`));
      if (meta !== null && Number.isFinite(meta)) tip.append(h("div", { class: "tip-rot" }, `${rotuloMeta}: ${f(meta)}`));
      tip.style.left = `${Math.min(Math.max(x - 60, 0), W - 150)}px`; tip.style.top = "0px";
    };
    const achar = (ev) => { const r = svg.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W; let b = 0, bd = 1e9; pontos.forEach((_, i) => { const dd = Math.abs(X(i) - px); if (dd < bd) { bd = dd; b = i; } }); return b; };
    svg.addEventListener("pointermove", (e) => mostrar(achar(e)));
    svg.addEventListener("pointerleave", () => { cruz.setAttribute("visibility", "hidden"); foco.setAttribute("visibility", "hidden"); tip.hidden = true; });
    svg.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") { e.preventDefault(); mostrar(Math.max(0, idx - 1)); } if (e.key === "ArrowRight") { e.preventDefault(); mostrar(Math.min(pontos.length - 1, idx + 1)); } });
    svg.addEventListener("focus", () => mostrar(idx));
    area.append(svg);
  };
  requestAnimationFrame(desenhar);
  if (typeof ResizeObserver !== "undefined") { let w = 0; new ResizeObserver(() => { if (area.clientWidth !== w) { w = area.clientWidth; desenhar(); } }).observe(area); }
  return raiz;
}
