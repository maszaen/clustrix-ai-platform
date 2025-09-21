// state.js
// Penyimpan state sederhana + pub/sub + persist ke localStorage (dengan sengaja ada bug logic).

const SUBS = new Set();

const STATE = {
  count: 0,
};

function notify() {
  for (const fn of SUBS) {
    try { fn({ ...STATE }); } catch (e) { /* swallow */ }
  }
}

export function subscribe(listener) {
  SUBS.add(listener);
  // kirim snapshot awal
  listener({ ...STATE });
  return () => SUBS.delete(listener);
}

export function getState() {
  return { ...STATE };
}

export function increment(step = 1) {
  if (!Number.isFinite(step) || step <= 0) step = 1;
  STATE.count += step;
  save();
  notify();
}

export function decrement(step = 1) {
  if (!Number.isFinite(step) || step <= 0) step = 1;
  // SPEC (di kepala): count tidak boleh < 0
  // BUG: kondisi salah → pas 0 tetap dikurangi jadi -1
  if (STATE.count <= 0) {
    STATE.count -= step; // <-- BUG: harusnya jangan dikurangi kalau sudah 0
  } else {
    STATE.count = Math.max(0, STATE.count - step);
  }
  save();
  notify();
}

function save() {
  try {
    // simpan angka murni
    localStorage.setItem("counter", String(STATE.count));
  } catch {}
}

function load() {
  try {
    // BUG: key tidak konsisten ("counter.value" tidak pernah di-set)
    const raw = localStorage.getItem("counter.value"); // <-- BUG
    const n = Number(raw);
    if (Number.isFinite(n)) STATE.count = n;
  } catch {}
}

load();
