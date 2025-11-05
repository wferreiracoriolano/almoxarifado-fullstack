// =========================
// app.js - Almoxarifado v7.8 (com backend /api/state)
// =========================

// Agora só usamos localStorage para a SESSÃO.
// Users / items / reqs ficam no servidor (SQLite) via /api/state.
const KEYS = { session: "almox_s_v78" };

const get = (k, f) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? f;
  } catch {
    return f;
  }
};
const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// Estado em memória
let state = {
  session: get(KEYS.session, null),
  users: [],
  items: [],
  reqs: [],
};

let stateLoaded = false;

// Carrega tudo do servidor ao iniciar
async function loadStateFromServer() {
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      const data = await res.json();
      state.users = data.users || [];
      state.items = data.items || [];
      state.reqs = data.reqs || [];
    } else {
      console.error("Falha ao carregar estado:", await res.text());
    }
  } catch (err) {
    console.error("Erro ao carregar estado do servidor:", err);
  }
  stateLoaded = true;
  render(); // atualiza a tela com o que veio do servidor
}

// Garante que o estado foi carregado (ex.: antes do login)
async function ensureStateLoaded() {
  if (!stateLoaded) {
    await loadStateFromServer();
  }
}

// Envia o estado atual (users/items/reqs) para o servidor
async function syncStateToServer() {
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        users: state.users,
        items: state.items,
        reqs: state.reqs,
      }),
    });
  } catch (err) {
    console.error("Erro ao salvar estado no servidor:", err);
  }
}

// Atualiza o estado em memória + render + sincronização
function setState(p) {
  state = { ...state, ...p };

  // Sessão ainda fica no localStorage (pra lembrar login)
  if (p.session !== undefined) {
    if (state.session) set(KEYS.session, state.session);
    else localStorage.removeItem(KEYS.session);
  }

  render();

  // Se mexeu em users / items / reqs, manda para o backend
  if (p.users || p.items || p.reqs) {
    syncStateToServer();
  }
}

// Helpers gerais
function roleClass(r) {
  return {
    ADMIN: "bg-purple-600",
    ALMOX: "bg-blue-600",
    SOLICITANTE: "bg-green-600",
  }[r] || "bg-slate-900";
}

function reqSummary(r) {
  let d = 0,
    p = 0;
  r.lines.forEach((l, i) => {
    const rec = r.received?.[i]?.receivedQty || 0;
    if (rec >= l.qty) d++;
    else p++;
  });
  const status =
    p === 0 ? "CONCLUÍDO" : d > 0 ? "PARCIAL" : "PENDENTE";
  return { status, delivered: d, pending: p, total: r.lines.length };
}

function fmtDate(dStr) {
  if (!dStr) return "—";
  const [y, m, d] = dStr.substring(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// =========================
// Login
// =========================

$("#btn-login").onclick = async () => {
  const u = $("#login-user").value.trim(),
    p = $("#login-pass").value.trim();

  // garante que já carregou os usuários do servidor
  await ensureStateLoaded();

  const me = state.users.find(
    (x) => x.username === u && x.password === p
  );
  if (!me) {
    $("#login-err").classList.remove("hidden");
    return;
  }
  $("#login-err").classList.add("hidden");
  setState({ session: me });
};

// Agora o "wipe" só limpa a sessão local (não apaga o banco do servidor)
$("#btn-wipe").onclick = () => {
  localStorage.removeItem(KEYS.session);
  location.reload();
};

$("#btn-logout").onclick = () => setState({ session: null });

// =========================
// Tabs
// =========================

function showTab(id) {
  $$(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.t === id)
  );
  [
    "tab-itens",
    "tab-cad",
    "tab-sol",
    "tab-almox",
    "tab-res",
    "tab-users",
  ].forEach((t) => $("#" + t).classList.add("hidden"));
  $("#" + id).classList.remove("hidden");
}
$$(".tab").forEach((b) =>
  b.addEventListener("click", () => showTab(b.dataset.t))
);

function setRoleVisibility() {
  const isAdmin = state.session.role === "ADMIN";
  const isAlmox = isAdmin || state.session.role === "ALMOX";
  // Mostra/esconde apenas botões, não o conteúdo
  $$('[data-t="tab-cad"]')[0].classList.toggle("hidden", !isAlmox);
  $$('[data-t="tab-users"]')[0].classList.toggle("hidden", !isAdmin);
  // Garante que sempre existe uma aba ativa visível
  if (
    !$$(".tab.active").length ||
    $$(".tab.active")[0].classList.contains("hidden")
  )
    showTab("tab-itens");
}

function render() {
  if (!state.session) {
    $("#view-login").classList.remove("hidden");
    $("#view-app").classList.add("hidden");
    return;
  }
  $("#view-login").classList.add("hidden");
  $("#view-app").classList.remove("hidden");

  $("#badge-user").textContent = state.session.name;
  const rb = $("#badge-role");
  rb.textContent = state.session.role;
  rb.className =
    "badge text-white " + roleClass(state.session.role);

  setRoleVisibility();
  if (!$$(".tab.active").length) showTab("tab-itens");
  renderItens();
  refreshSel();
  renderDraft();
  renderMine();
  renderAlmox();
  buildCal();
  renderResumo();
  renderUsers();
}

// =========================
// ITENS
// =========================

$("#itens-q").oninput = renderItens;

function renderItens() {
  const q = ($("#itens-q").value || "").toLowerCase();
  let its = state.items;
  if (q)
    its = its.filter(
      (i) =>
        (i.name || "").toLowerCase().includes(q) ||
        (i.code || "").toLowerCase().includes(q) ||
        (i.unit || "").toLowerCase().includes(q)
    );
  const grid = $("#itens-list");
  grid.innerHTML = "";
  $("#itens-empty").classList.toggle("hidden", its.length > 0);
  its.forEach((it) => {
    const low = (it.qty || 0) < (it.min || 0);
    const el = document.createElement("div");
    el.className = "card " + (low ? "low" : "");
    el.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <div class="font-semibold">${it.name}</div>
        <span class="badge bg-slate-100 text-slate-800">${it.unit || "—"}</span>
      </div>
      <div class="text-xs text-slate-500 mb-1">
        Cód: <span class="font-mono">${it.code || "—"}</span>
      </div>
      ${
        it.imageData
          ? `<img src="${it.imageData}" class="w-full h-40 object-cover rounded-lg mb-2">`
          : ""
      }
      <div class="text-sm text-slate-600">
        Estoque: <b>${it.qty || 0}</b> • Mín: <b>${it.min || 0}</b>
      </div>
      <div class="grid grid-cols-3 gap-2 mt-2">
        <input class="inp in" type="number" min="0" value="1">
        <input class="inp out" type="number" min="0" value="1">
        ${
          state.session.role === "ADMIN"
            ? `<input class="inp min" type="number" min="0" value="${it.min || 0}" title="Mínimo (ADMIN)">`
            : ""
        }
      </div>
      <div class="flex items-center gap-2 mt-2">
        <button type="button" class="btn2 add">Entrada</button>
        <button type="button" class="btn2 rem">Baixa</button>
        ${
          state.session.role === "ADMIN"
            ? `<button type="button" class="btn2 save">Salvar mín.</button>`
            : ""
        }
      </div>`;
    const inN = el.querySelector(".in"),
      outN = el.querySelector(".out"),
      minN = el.querySelector(".min");

    el.querySelector(".add").onclick = () => {
      const n = Math.max(0, Number(inN.value || 0));
      setState({
        items: state.items.map((x) =>
          x.id === it.id ? { ...x, qty: (x.qty || 0) + n } : x
        ),
      });
    };

    el.querySelector(".rem").onclick = () => {
      const n = Math.max(0, Number(outN.value || 0));
      const after = Math.max(0, (it.qty || 0) - n);
      setState({
        items: state.items.map((x) =>
          x.id === it.id ? { ...x, qty: after } : x
        ),
      });
      const minV = minN ? Number(minN.value || 0) : it.min || 0;
      if (after < minV)
        alert(
          `⚠️ Estoque de "${it.name}" ficou abaixo do mínimo (${after} < ${minV}).`
        );
    };

    if (state.session.role === "ADMIN" && el.querySelector(".save"))
      el.querySelector(".save").onclick = () => {
        const m = Math.max(0, Number(minN.value || 0));
        setState({
          items: state.items.map((x) =>
            x.id === it.id ? { ...x, min: m } : x
          ),
        });
      };

    grid.appendChild(el);
  });
}

// =========================
// CADASTRO DE ITENS
// =========================

$("#cad-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const file = fd.get("image");
  const img = await new Promise((res, rej) => {
    if (!file || !file.size) return res(null);
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const it = {
    id: crypto.randomUUID(),
    name: fd.get("name") || "",
    code: fd.get("code") || "",
    unit: fd.get("unit") || "",
    qty: 0,
    min: 0,
    imageData: img,
  };
  setState({ items: [it, ...state.items] });
  e.target.reset();
  showTab("tab-itens");
});

// =========================
// SOLICITAÇÕES
// =========================

let draft = [];

function refreshSel() {
  const sel = $("#s-item");
  sel.innerHTML = "";
  state.items.forEach((i) => {
    const o = document.createElement("option");
    o.value = i.id;
    o.textContent = i.name;
    sel.appendChild(o);
  });
  fillSel();
}

function fillSel() {
  const id = $("#s-item").value;
  const it = state.items.find((x) => x.id === id);
  $("#s-code").value = it ? it.code : "";
  $("#s-unit").value = it ? it.unit : "";
  $("#s-stock").value = it ? it.qty || 0 : 0;
  $("#s-photo").innerHTML =
    it && it.imageData
      ? `<img src="${it.imageData}" class="h-20 rounded">`
      : "Sem foto";
}

document.addEventListener("change", (e) => {
  if (e.target.id === "s-item") fillSel();
});

["s-qt", "s-vu"].forEach(
  (id) =>
    ($("#" + id).oninput = () => {
      const qt = Number($("#s-qt").value || 0),
        vu = Number($("#s-vu").value || 0);
      $("#s-total").value = (qt * vu).toFixed(2);
    })
);

$("#s-add").onclick = () => {
  const id = $("#s-item").value;
  if (!id) return;
  const it = state.items.find((x) => x.id === id);
  const l = {
    id: crypto.randomUUID(),
    itemId: id,
    name: it ? it.name : "",
    code: it ? it.code : "",
    unit: it ? it.unit : "",
    photo: it ? it.imageData : null,
    qty: Number($("#s-qt").value || 0),
    unitPrice: Number($("#s-vu").value || 0),
  };
  l.total = l.qty * l.unitPrice;
  draft = [...draft, l];
  renderDraft();
};

function renderDraft() {
  const list = $("#s-list");
  list.innerHTML = "";
  if (!draft.length) {
    $("#s-empty").classList.remove("hidden");
    return;
  }
  $("#s-empty").classList.add("hidden");
  draft.forEach((l) => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          ${
            l.photo
              ? `<img src="${l.photo}" class="w-10 h-10 rounded">`
              : ""
          }
          <div>
            <div class="font-semibold">${l.name}</div>
            <div class="text-xs text-slate-500">
              Cód:${l.code || "—"} • Und:${l.unit || "—"}
            </div>
          </div>
        </div>
        <div class="text-right text-sm">
          Qtd:<b>${l.qty}</b> • VU:<b>R$ ${l.unitPrice.toFixed(
            2
          )}</b><br>
          Total:<b>R$ ${l.total.toFixed(2)}</b>
        </div>
      </div>
      <div class="flex justify-end mt-2">
        <button class="btn2 rm" type="button">Remover</button>
      </div>`;
    el.querySelector(".rm").onclick = () => {
      draft = draft.filter((x) => x.id !== l.id);
      renderDraft();
    };
    list.appendChild(el);
  });
}

$("#s-save").onclick = () => {
  if (!draft.length) return alert("Adicione materiais.");
  const head = {
    pedido: $("#s-pedido").value.trim(),
    linha: $("#s-linha").value.trim(),
    fornecedor: $("#s-forn").value.trim(),
    marca: $("#s-marca").value.trim(),
    createdBy: state.session.name,
    createdAt: new Date().toISOString(),
  };
  const received = draft.map(() => ({
    receivedQty: 0,
    received: false,
    notes: "",
  }));
  const req = {
    id: crypto.randomUUID(),
    header: head,
    lines: draft,
    deliveryDate: null,
    received,
    status: "PENDENTE",
  };
  setState({ reqs: [req, ...state.reqs] });
  draft = [];
  renderDraft();
  $("#s-pedido").value =
    $("#s-linha").value =
    $("#s-forn").value =
    $("#s-marca").value =
      "";
  renderMine();
  renderAlmox();
  buildCal();
  renderResumo();
  alert("Solicitação salva!");
};

// =========================
// PDF helpers (layout 6.2)
// =========================

function pdfHeader(doc, title) {
  const w = doc.internal.pageSize.getWidth();
  let y = 40;
  doc.setFontSize(16);
  doc.text(title, 40, y);
  y += 14;
  doc.setFontSize(9);
  const left = `Data: ${new Date().toLocaleString("pt-BR")}`;
  const right = `Solicitante: ${state.session?.name || "-"}`;
  doc.text(left, 40, y);
  doc.text(right, w - 40 - doc.getTextWidth(right), y);
  return y + 16;
}
function pdfFooter(doc) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const pc = doc.getNumberOfPages();
  for (let i = 1; i <= pc; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Página ${i} de ${pc}`, w - 80, h - 20);
  }
}
function pdfTable(doc, y, rows, cols) {
  cols =
    cols ||
    [
      { k: "idx", t: "#", w: 24 },
      { k: "name", t: "Item", w: 210 },
      { k: "code", t: "Cód", w: 70 },
      { k: "unit", t: "Un", w: 26 },
      { k: "qty", t: "Qtde", w: 40, r: true },
      {
        k: "unitPrice",
        t: "V.U.",
        w: 60,
        r: true,
        fmt: (v) => `R$ ${Number(v || 0).toFixed(2)}`,
      },
      {
        k: "total",
        t: "Total",
        w: 70,
        r: true,
        fmt: (v) => `R$ ${Number(v || 0).toFixed(2)}`,
      },
      { k: "received", t: "Receb", w: 42, r: true },
      { k: "left", t: "Falta", w: 42, r: true },
      { k: "notes", t: "Obs", w: 120 },
    ];
  const x0 = 40;
  let x = x0;
  doc.setFontSize(9);
  cols.forEach((c) => {
    doc.text(c.t, x + 2, y);
    x += c.w;
  });
  y += 6;
  doc.setDrawColor(200);
  doc.line(
    x0,
    y,
    x0 + cols.reduce((a, c) => a + c.w, 0),
    y
  );
  y += 8;
  rows.forEach((r) => {
    x = x0;
    cols.forEach((c) => {
      const raw = r[c.k];
      const val = c.fmt ? c.fmt(raw) : raw == null ? "" : String(raw);
      if (c.r) {
        const tw = doc.getTextWidth(val);
        doc.text(val, x + c.w - 2 - tw, y);
      } else {
        doc.text(val, x + 2, y);
      }
      x += c.w;
    });
    y += 14;
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 40;
    }
  });
  return y;
}

// PDFs
$("#s-pdf").onclick = () => {
  if (!draft.length) return alert("Adicione materiais.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = pdfHeader(doc, "Pedido (Rascunho)");
  const rows = draft.map((l, i) => ({
    idx: i + 1,
    name: l.name,
    code: l.code || "",
    unit: l.unit || "",
    qty: l.qty,
    unitPrice: l.unitPrice,
    total: l.total,
    received: 0,
    left: l.qty,
    notes: "",
  }));
  y = pdfTable(doc, y, rows);
  pdfFooter(doc);
  doc.save("rascunho.pdf");
};

function downloadReqPDF(r) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = pdfHeader(doc, "Pedido de Material");
  doc.setFontSize(10);

  const entregaTxt = r.deliveryDate ? fmtDate(r.deliveryDate) : "(definir)";
  const meta = `Pedido: ${r.header.pedido || "-"}    Fornecedor: ${
    r.header.fornecedor || "-"
  }    Marca: ${r.header.marca || "-"}    Entrega: ${entregaTxt}`;

  doc.text(meta, 40, y);
  y += 14;

  const rows = r.lines.map((l, i) => {
    const rec =
      (r.received && r.received[i]
        ? r.received[i].receivedQty
        : 0) || 0;
    return {
      idx: i + 1,
      name: l.name,
      code: l.code || "",
      unit: l.unit || "",
      qty: l.qty,
      unitPrice: l.unitPrice || 0,
      total: (l.qty || 0) * (l.unitPrice || 0),
      received: rec,
      left: Math.max(0, (l.qty || 0) - rec),
      notes:
        (r.received && r.received[i]
          ? r.received[i].notes || ""
          : ""),
    };
  });

  y = pdfTable(doc, y, rows);
  const tot = rows.reduce((a, b) => a + Number(b.total || 0), 0);
  doc.setFontSize(11);
  doc.text(`Total geral: R$ ${tot.toFixed(2)}`, 40, y + 10);
  pdfFooter(doc);
  doc.save(`solicitacao-${r.header.pedido || r.id}.pdf`);
}

$("#s-pdf-all").onclick = () => {
  const mine = state.reqs.filter(
    (r) => r.header.createdBy === state.session.name
  );
  if (!mine.length) return alert("Sem solicitações.");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = pdfHeader(doc, "Minhas Solicitações");
  mine.forEach((r) => {
    doc.setFontSize(11);
    doc.text(
      `• Pedido: ${r.header.pedido || "-"}  • Fornecedor: ${
        r.header.fornecedor || "-"
      }  • Marca: ${r.header.marca || "-"}`,
      40,
      y
    );
    y += 12;
    const rows = r.lines.map((l, i) => {
      const rec =
        (r.received && r.received[i]
          ? r.received[i].receivedQty
          : 0) || 0;
      return {
        idx: i + 1,
        name: l.name,
        code: l.code || "",
        unit: l.unit || "",
        qty: l.qty,
        unitPrice: l.unitPrice || 0,
        total: (l.qty || 0) * (l.unitPrice || 0),
        received: rec,
        left: Math.max(0, (l.qty || 0) - rec),
        notes: "",
      };
    });
    y = pdfTable(doc, y, rows);
    y += 6;
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 40;
    }
  });
  pdfFooter(doc);
  doc.save("minhas-solicitacoes.pdf");
};

$("#s-q").oninput = renderMine;
function renderMine() {
  const list = $("#s-me");
  list.innerHTML = "";
  const q = ($("#s-q").value || "").toLowerCase();

  const mine = state.reqs
    .filter((r) => r.header.createdBy === state.session.name)
    .filter((r) =>
      [
        r.header.pedido || "",
        r.header.fornecedor || "",
        r.header.marca || "",
        r.header.linha || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );

  $("#s-me-empty").classList.toggle("hidden", mine.length > 0);

  mine.forEach((r) => {
    const sum = reqSummary(r);
    const tot = r.lines.reduce(
      (a, b) => a + (b.qty * b.unitPrice || 0),
      0
    );
    const pill =
      sum.status === "PENDENTE"
        ? "pill-red"
        : sum.status === "PARCIAL"
        ? "pill-amber"
        : "pill-green";

    const entregaTxt = r.deliveryDate ? fmtDate(r.deliveryDate) : "(definir)";

    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold">
            Pedido: ${r.header.pedido || "—"} <span class="pill ${pill}">${sum.status}</span>
          </div>
          <div class="text-sm text-slate-500">
            Forn: ${r.header.fornecedor || "—"} • Marca: ${
      r.header.marca || "—"
    } • Linha: ${r.header.linha || "—"}
          </div>
          <div class="text-xs text-slate-500 mt-1">
            Entregues: ${sum.delivered}/${sum.total} • Pendentes: ${
      sum.pending
    }
          </div>
        </div>
        <div class="text-right text-sm">
          Total: <b>R$ ${tot.toFixed(2)}</b><br>
          Entrega: ${entregaTxt}<br>
          <button class="btn2 pdf mt-2" type="button">Baixar PDF</button>
        </div>
      </div>`;

    el.querySelector(".pdf").onclick = () => downloadReqPDF(r);
    list.appendChild(el);
  });
}

// =========================
// ALMOX + calendário
// =========================

let calRef = new Date();

function buildCal() {
  const y = calRef.getFullYear(),
    m = calRef.getMonth();
  const first = new Date(y, m, 1).getDay();
  const total = new Date(y, m + 1, 0).getDate();

  $("#c-title").textContent = calRef.toLocaleString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const body = $("#c-body");
  body.innerHTML = "";
  let d = 1;

  const map = {};
  state.reqs.forEach((r) => {
    if (!r.deliveryDate) return;
    const sumStatus = reqSummary(r).status;
    const key = r.deliveryDate.substring(0, 10);
    const val =
      sumStatus === "PENDENTE"
        ? "PENDENTE"
        : sumStatus === "PARCIAL"
        ? "PARCIAL"
        : "CONCLUÍDO";

    // Mantém a mais "grave": PENDENTE > PARCIAL > CONCLUÍDO
    if (
      !map[key] ||
      map[key] === "CONCLUÍDO" ||
      (map[key] === "PARCIAL" && val === "PENDENTE")
    ) {
      map[key] = val;
    }
  });

  for (let r = 0; r < 6; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < 7; c++) {
      const td = document.createElement("td");
      td.className = "border";
      if ((r === 0 && c < first) || d > total) {
        tr.appendChild(td);
        continue;
      }

      td.textContent = d;
      const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(
        d
      ).padStart(2, "0")}`;
      const st = map[key];
      if (st) {
        const color =
          st === "PENDENTE"
            ? "bg-red-600"
            : st === "PARCIAL"
            ? "bg-amber-600"
            : "bg-green-600";
        const dot = document.createElement("span");
        dot.className =
          "inline-block w-2 h-2 rounded-full ml-1 " + color;
        td.appendChild(dot);
        td.style.cursor = "pointer";
        td.onclick = () => showDay(key);
      }

      tr.appendChild(td);
      d++;
    }
    body.appendChild(tr);
  }
}

function showDay(key) {
  const box = $("#c-day");
  box.innerHTML = `<div class="font-semibold mb-1">Programação em ${fmtDate(
    key
  )}</div>`;
  const rows = state.reqs.filter(
    (r) =>
      r.deliveryDate &&
      r.deliveryDate.substring(0, 10) === key
  );
  if (!rows.length) {
    box.innerHTML += '<div class="muted">Nada programado.</div>';
    return;
  }
  rows.forEach((r) => {
    const sum = reqSummary(r);
    const pill =
      sum.status === "PENDENTE"
        ? "pill-red"
        : sum.status === "PARCIAL"
        ? "pill-amber"
        : "pill-green";
    const div = document.createElement("div");
    div.className = "card text-sm mb-2";
    div.innerHTML = `
      <div class="font-medium">
        Pedido ${r.header.pedido || "—"} • ${
      r.header.fornecedor || "—"
    } <span class="pill ${pill}">${sum.status}</span>
      </div>`;
    box.appendChild(div);
  });
}

function renderAlmox() {
  const list = $("#a-list");
  list.innerHTML = "";
  const rows = state.reqs.filter(
    (r) => reqSummary(r).status !== "CONCLUÍDO"
  );
  $("#a-empty").classList.toggle("hidden", rows.length > 0);

  rows.forEach((r) => {
    const sum = reqSummary(r);
    const pill =
      sum.status === "PENDENTE" ? "pill-red" : "pill-amber";

    const entregaTxt = fmtDate(r.deliveryDate);

    const card = document.createElement("div");
    card.className = "card text-sm";
    card.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <div>
          <div class="font-semibold">
            Pedido: ${r.header.pedido || "—"} • ${
      r.header.fornecedor || "—"
    } <span class="pill ${pill}">${sum.status}</span>
          </div>
          <div class="text-slate-500">
            Itens:${sum.total} • Entregues:${sum.delivered} • Pendentes:${
      sum.pending
    }
          </div>
        </div>
        <div>
          Entrega: <b>${entregaTxt}</b>
        </div>
      </div>
      <div class="grid md:grid-cols-2 gap-2 mb-2">
        <input type="date" class="inp a-date">
        <select class="inp a-status">
          <option>PENDENTE</option>
          <option>PARCIAL</option>
          <option>CONCLUÍDO</option>
        </select>
      </div>
      <div class="space-y-2">
        ${r.lines
          .map((l, i) => {
            const rec = r.received?.[i]?.receivedQty || 0;
            const pend = Math.max(0, l.qty - rec);
            if (pend <= 0) return "";
            return `
              <div class="border rounded-lg p-2">
                <div class="font-medium">${l.name}</div>
                <div class="text-slate-500">
                  Sol:${l.qty} • Rec:${rec} • Falta:${pend}
                </div>
                <div class="grid grid-cols-3 gap-2 mt-1">
                  <input class="inp a-qty" type="number" min="0" max="${pend}" value="0">
                  <label class="text-xs flex items-center gap-2">
                    <input type="checkbox" class="a-done"> Marcar como entregue
                  </label>
                </div>
                <textarea class="inp a-notes text-xs" placeholder="Observações"></textarea>
              </div>`;
          })
          .join("")}
      </div>
      <div class="flex justify-end mt-2">
        <button class="btn a-save" type="button">Salvar atualização</button>
      </div>`;

    const d = card.querySelector(".a-date");
    if (r.deliveryDate)
      d.value = r.deliveryDate.substring(0, 10);
    const s = card.querySelector(".a-status");
    s.value = r.status || sum.status;

    card.querySelector(".a-save").onclick = () => {
      const dateVal = d.value || null;
      const statusSel = s.value;
      const qtys = card.querySelectorAll(".a-qty");
      const dones = card.querySelectorAll(".a-done");
      const notes = card.querySelectorAll(".a-notes");

      let anyPending = false,
        anyDelivered = false,
        idx = 0;

      r.lines.forEach((l, i) => {
        const rec = r.received?.[i]?.receivedQty || 0;
        const pend = Math.max(0, l.qty - rec);
        if (pend <= 0) return;

        const q = Math.max(0, Number(qtys[idx].value || 0));
        const mark = dones[idx].checked;
        const add = mark ? pend : q;
        const newRec = rec + add;

        if (newRec >= l.qty) anyDelivered = true;
        else anyPending = true;

        state.reqs = state.reqs.map((xx) => {
          if (xx.id !== r.id) return xx;
          const rc = [...(xx.received || [])];
          rc[i] = {
            receivedQty: newRec,
            received: newRec >= l.qty,
            notes: notes[idx].value || "",
          };
          return { ...xx, received: rc };
        });

        state.items = state.items.map((it) =>
          it.id === l.itemId
            ? { ...it, qty: (it.qty || 0) + q }
            : it
        );

        idx++;
      });

      let finalStatus;
      if (!anyPending) {
        finalStatus = "CONCLUÍDO";
      } else if (anyDelivered) {
        finalStatus = "PARCIAL";
      } else {
        finalStatus = "PENDENTE";
      }
      if (statusSel === "CONCLUÍDO" && anyPending)
        finalStatus = "PARCIAL";

      setState({
        items: state.items,
        reqs: state.reqs.map((x) =>
          x.id === r.id
            ? { ...x, deliveryDate: dateVal, status: finalStatus }
            : x
        ),
      });

      buildCal();
      renderAlmox();
      renderResumo();
      renderItens();
      renderMine();
      alert("Atualizado.");
    };

    list.appendChild(card);
  });
}

// =========================
// RESUMO + busca
// =========================

$("#r-q").oninput = renderResumo;

function renderResumo() {
  const q = ($("#r-q").value || "").toLowerCase();
  const pend = $("#r-pend");
  pend.innerHTML = "";
  const done = $("#r-done");
  done.innerHTML = "";
  const filterRows = (rows) =>
    rows.filter((r) =>
      [
        r.header.pedido || "",
        r.header.fornecedor || "",
        r.header.marca || "",
        r.header.linha || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  const pendRows = filterRows(
    state.reqs.filter(
      (r) => reqSummary(r).status !== "CONCLUÍDO"
    )
  );
  const doneRows = filterRows(
    state.reqs.filter(
      (r) => reqSummary(r).status === "CONCLUÍDO"
    )
  );
  $("#r-pend-empty").classList.toggle(
    "hidden",
    pendRows.length > 0
  );
  $("#r-done-empty").classList.toggle(
    "hidden",
    doneRows.length > 0
  );

  pendRows.forEach((r) => {
    const sum = reqSummary(r);
    const pill =
      sum.status === "PENDENTE" ? "pill-red" : "pill-amber";
    const entregaTxt = fmtDate(r.deliveryDate);

    const el = document.createElement("div");
    el.className = "card text-sm";
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <b>${r.header.pedido || "—"}</b> • ${
      r.header.fornecedor || "—"
    } <span class="pill ${pill}">${sum.status}</span>
        </div>
        <div>Entrega: ${entregaTxt}</div>
      </div>`;
    const lines = document.createElement("div");
    lines.className = "mt-1 text-xs text-slate-600";
    r.lines.forEach((l, i) => {
      const rec = r.received?.[i]?.receivedQty || 0;
      const falta = Math.max(0, l.qty - rec);
      lines.innerHTML += `<div>• ${
        l.name
      }: solicitado ${l.qty} • recebido ${rec} • falta ${falta}</div>`;
    });
    el.appendChild(lines);
    pend.appendChild(el);
  });

  doneRows.forEach((r) => {
    const entregaTxt = fmtDate(r.deliveryDate);
    const el = document.createElement("div");
    el.className = "card text-sm";
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <b>${r.header.pedido || "—"}</b> • ${
      r.header.fornecedor || "—"
    } <span class="pill pill-green">CONCLUÍDO</span>
        </div>
        <div>Entrega: ${entregaTxt}</div>
      </div>`;
    const lines = document.createElement("div");
    lines.className = "mt-1 text-xs text-slate-600";
    r.lines.forEach((l, i) => {
      const rec = r.received?.[i]?.receivedQty || 0;
      const falta = Math.max(0, l.qty - rec);
      lines.innerHTML += `<div>• ${
        l.name
      }: solicitado ${l.qty} • recebido ${rec} • falta ${falta}</div>`;
    });
    el.appendChild(lines);
    if (state.session.role === "ADMIN") {
      const btn = document.createElement("button");
      btn.className = "btn2 mt-2";
      btn.textContent = "Reverter para não entregue";
      btn.type = "button";
      btn.onclick = () => {
        setState({
          reqs: state.reqs.map((x) =>
            x.id === r.id
              ? {
                  ...x,
                  received: x.lines.map(() => ({
                    receivedQty: 0,
                    received: false,
                    notes: "",
                  })),
                  status: "PENDENTE",
                }
              : x
          ),
        });
        buildCal();
        renderResumo();
        renderAlmox();
        renderMine();
      };
      el.appendChild(btn);
    }
    done.appendChild(el);
  });

  const box = $("#r-tot");
  box.innerHTML = "";
  const agg = {};
  state.reqs.forEach((r) =>
    r.lines.forEach((l, i) => {
      const rec = r.received?.[i]?.receivedQty || 0;
      const falta = Math.max(0, l.qty - rec);
      if (!agg[l.itemId])
        agg[l.itemId] = {
          name: l.name,
          unit: l.unit,
          rec: 0,
          falta: 0,
        };
      agg[l.itemId].rec += rec;
      agg[l.itemId].falta += falta;
    })
  );
  Object.values(agg).forEach((v) => {
    const row = document.createElement("div");
    row.textContent = `${v.name} (${v.unit || "—"}) • Entregue: ${
      v.rec
    } • Pendente: ${v.falta}`;
    box.appendChild(row);
  });
}

$("#r-pdf").onclick = () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = pdfHeader(doc, "Resumo Geral");
  const sections = [
    {
      title: "Pendentes/Parciais",
      rows: state.reqs.filter(
        (r) => reqSummary(r).status !== "CONCLUÍDO"
      ),
    },
    {
      title: "Concluídas",
      rows: state.reqs.filter(
        (r) => reqSummary(r).status === "CONCLUÍDO"
      ),
    },
  ];
  sections.forEach((sec) => {
    doc.setFontSize(12);
    doc.text(sec.title, 40, y);
    y += 14;
    sec.rows.forEach((r) => {
      const rows = r.lines.map((l, i) => {
        const rec =
          (r.received && r.received[i]
            ? r.received[i].receivedQty
            : 0) || 0;
        return {
          idx: i + 1,
          name: l.name,
          code: l.code || "",
          unit: l.unit || "",
          qty: l.qty,
          unitPrice: l.unitPrice || 0,
          total: (l.qty || 0) * (l.unitPrice || 0),
          received: rec,
          left: Math.max(0, (l.qty || 0) - rec),
          notes: "",
        };
      });
      y = pdfTable(doc, y, rows);
      y += 6;
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = 40;
      }
    });
    y += 6;
  });
  pdfFooter(doc);
  doc.save("resumo-geral.pdf");
};

// =========================
// Usuários
// =========================

$("#u-create").onclick = () => {
  if (state.session.role !== "ADMIN")
    return alert("Apenas ADMIN.");
  const name = $("#u-name").value.trim(),
    username = $("#u-username").value.trim(),
    password = $("#u-password").value,
    role = $("#u-role").value;
  if (!name || !username || !password)
    return alert("Preencha tudo.");
  if (state.users.some((u) => u.username === username))
    return alert("Login já existe.");
  setState({
    users: [
      {
        id: crypto.randomUUID(),
        name,
        username,
        password,
        role,
      },
      ...state.users,
    ],
  });
  $("#u-name").value =
    $("#u-username").value =
    $("#u-password").value =
      "";
  $("#u-role").value = "SOLICITANTE";
  renderUsers();
};

function renderUsers() {
  const list = $("#u-list");
  list.innerHTML = "";
  $("#u-empty").classList.toggle("hidden", state.users.length > 0);
  const isAdmin = state.session.role === "ADMIN";
  state.users.forEach((u) => {
    const el = document.createElement("div");
    el.className = "card text-sm";
    if (isAdmin) {
      el.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <b>${u.name}</b>
            <span class="badge text-white ${roleClass(
              u.role
            )}">${u.role}</span>
            <span class="text-slate-500">
              login: <b class="font-mono">${u.username}</b>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <select class="inp u-role" style="width:170px">
              <option value="ADMIN"${
                u.role === "ADMIN" ? " selected" : ""
              }>ADMIN</option>
              <option value="ALMOX"${
                u.role === "ALMOX" ? " selected" : ""
              }>ALMOX</option>
              <option value="SOLICITANTE"${
                u.role === "SOLICITANTE" ? " selected" : ""
              }>SOLICITANTE</option>
            </select>
            <button type="button" class="btn2 u-save">Salvar</button>
            <button type="button" class="btn2 u-del">Excluir</button>
          </div>
        </div>`;
      el.querySelector(".u-save").onclick = () => {
        const newRole = el.querySelector(".u-role").value;
        const admins = state.users.filter(
          (x) => x.role === "ADMIN"
        );
        if (
          u.role === "ADMIN" &&
          admins.length === 1 &&
          newRole !== "ADMIN"
        ) {
          alert("Não é possível remover o último ADMIN.");
          el.querySelector(".u-role").value = "ADMIN";
          return;
        }
        setState({
          users: state.users.map((x) =>
            x.id === u.id ? { ...x, role: newRole } : x
          ),
        });
        if (state.session.id === u.id)
          setState({
            session: { ...state.session, role: newRole },
          });
        alert("Função atualizada!");
      };
      el.querySelector(".u-del").onclick = () => {
        if (state.session.id === u.id)
          return alert("Você não pode excluir a si mesmo.");
        const admins = state.users.filter(
          (x) => x.role === "ADMIN"
        );
        if (u.role === "ADMIN" && admins.length === 1) {
          alert("Não é possível excluir o último ADMIN.");
          return;
        }
        if (confirm(`Excluir o usuário "${u.name}"?`)) {
          setState({
            users: state.users.filter((x) => x.id !== u.id),
          });
          alert("Usuário excluído.");
        }
      };
    } else {
      el.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <b>${u.name}</b>
            <span class="badge text-white ${roleClass(
              u.role
            )}">${u.role}</span>
          </div>
          <div class="text-slate-500">
            login: <b class="font-mono">${u.username}</b>
          </div>
        </div>`;
    }
    list.appendChild(el);
  });
}

// =========================
// Start
// =========================

render();             // mostra tela (login ou app, dependendo da sessão)
loadStateFromServer(); // carrega users/items/reqs do servidor ao iniciar
