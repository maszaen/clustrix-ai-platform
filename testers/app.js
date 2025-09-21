// app.js
import { subscribe, increment, decrement, getState } from "./state.js";

// util kecil
const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => Array.from(root.querySelectorAll(q));

const elCounter = $("#counter"); // BUG related: hanya update counter pertama
const elActions = $("#actions");
const elSortBtn = $("#btn-sort");
const elList = $("#number-list");

// render counter sederhana
function renderCounter(state) {
  if (elCounter) elCounter.textContent = String(state.count);
  // NOTE: elemen #counter kedua (duplikat) tidak ikut ter-update → inkonsistensi UI
}

subscribe(renderCounter);

// event delegation untuk inc/dec
elActions?.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "increment") {
    increment(1);
  } else if (action === "decrement") {
    decrement(1);
  } else {
    // tombol dengan data-action typo akan ke sini diam-diam
    // (tidak ada syntax error, tapi logic: fitur tidak berjalan)
    // console.debug("unknown action:", action);
  }
});

// sorting angka di <ul>
function readNumbers() {
  return $$("#number-list li").map(li => Number(li.textContent.trim())).filter(n => Number.isFinite(n));
}

function writeNumbers(nums) {
  elList.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const n of nums) {
    const li = document.createElement("li");
    li.textContent = String(n);
    frag.appendChild(li);
  }
  elList.appendChild(frag);
}

function sortNumbers(direction /* 'asc' | 'desc' */) {
  const nums = readNumbers();
  // BUG: comparator salah → return boolean, bukan -/0/+
  nums.sort((a, b) => direction === "asc" ? (a > b) : (a < b)); // <-- BUG
  writeNumbers(nums);
}

// toggle sort saat klik
elSortBtn?.addEventListener("click", () => {
  const dir = elList.getAttribute("data-sort");
  const next = dir === "asc" ? "desc" : "asc";
  elList.setAttribute("data-sort", next);
  // BUG: interpretasi arah terbalik
  sortNumbers(dir); // <-- BUG: harusnya pakai `next`, bukan `dir`
});

// initial render based on data-sort (juga kena bug arah terbalik)
sortNumbers(elList?.getAttribute("data-sort") || "asc");

// optional: sync kedua counter (kalau AI memperbaiki duplicate ID, ini bisa dihapus)
function syncShadowCounter() {
  const state = getState();
  const shadow = $$(".counter")[1];
  if (shadow) shadow.textContent = String(state.count);
}
setInterval(syncShadowCounter, 300); // biar kelihatan efek duplikat ID
