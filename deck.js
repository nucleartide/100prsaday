(() => {
  const W = 1280;
  const H = 720;
  const STAGES = ["Backlog", "Implementation", "Tech Review", "Verification", "Done"];
  const isPresenter = new URLSearchParams(location.search).has("presenter");

  const mainStage = document.getElementById("main-stage");
  const deck = document.getElementById("deck");
  const slides = Array.from(deck.querySelectorAll(":scope > .slide"));
  const progressBar = document.querySelector(".progress > div");
  const counter = document.querySelector(".counter");
  const help = document.querySelector(".help");

  let idx = 0;
  let step = 0;
  let peer = isPresenter ? window.opener : null;
  let jumpBuffer = "";

  document.querySelectorAll(".tracker[data-stage]").forEach((el) => {
    const active = Number(el.dataset.stage);
    el.innerHTML = STAGES.map((s, i) => `<span class="${i === active ? "on" : ""}">${s}</span>`).join("");
  });

  const fragments = (i) => Array.from(slides[i].querySelectorAll(".fragment"));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function fit(stage) {
    const vp = stage.querySelector(".viewport");
    const r = stage.getBoundingClientRect();
    vp.style.setProperty("--s", Math.min(r.width / W, r.height / H));
  }
  const resizer = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target)));

  function render() {
    slides.forEach((s, i) => s.classList.toggle("active", i === idx));
    fragments(idx).forEach((f, i) => f.classList.toggle("visible", i < step));
    progressBar.style.width = `${((idx + 1) / slides.length) * 100}%`;
    counter.textContent = `${idx + 1} / ${slides.length}`;
    history.replaceState(null, "", `${location.search}#/${idx + 1}${step ? `/${step}` : ""}`);
    if (isPresenter) renderPresenter();
  }

  function go(i, s = 0, fromPeer = false) {
    idx = clamp(i, 0, slides.length - 1);
    step = clamp(s, 0, fragments(idx).length);
    render();
    if (!fromPeer) sync();
  }

  function next() {
    if (step < fragments(idx).length) go(idx, step + 1);
    else if (idx < slides.length - 1) go(idx + 1, 0);
  }

  function prev() {
    if (step > 0) go(idx, step - 1);
    else if (idx > 0) go(idx - 1, fragments(idx - 1).length);
  }

  function sync() {
    if (peer && !peer.closed) peer.postMessage({ deck: "sync", idx, step }, "*");
  }

  function openPresenter() {
    peer = window.open(`${location.pathname}?presenter${location.hash}`, "deck-presenter", "width=1280,height=800");
  }

  window.addEventListener("message", (e) => {
    const data = e.data || {};
    if (data.deck === "sync") go(data.idx, data.step, true);
    if (data.deck === "hello") {
      peer = e.source;
      sync();
    }
  });

  function parseHash() {
    const m = location.hash.match(/^#\/(\d+)(?:\/(\d+))?/);
    if (m) go(Number(m[1]) - 1, Number(m[2] || 0), true);
    else go(0, 0, true);
  }

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (/^\d$/.test(k)) {
      jumpBuffer += k;
      return;
    }
    if (k === "Enter" && jumpBuffer) {
      go(Number(jumpBuffer) - 1);
      jumpBuffer = "";
      return;
    }
    jumpBuffer = "";
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "j", "l"].includes(k)) next();
    else if (["ArrowLeft", "ArrowUp", "PageUp", "k", "h"].includes(k)) prev();
    else if (k === "Home") go(0);
    else if (k === "End") go(slides.length - 1);
    else if (k === "f") {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } else if (k === "p" && !isPresenter) openPresenter();
    else if (k === "?") help.classList.toggle("open");
    else if (k === "Escape") help.classList.remove("open");
    else return;
    e.preventDefault();
  });

  mainStage.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    const r = mainStage.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) prev();
    else next();
  });

  // ---------- Presenter view ----------

  let nextViewport, notesEl, countEl, timerEl, startedAt;

  function setupPresenter() {
    document.body.classList.add("presenter");
    document.title = `Presenter · ${document.title}`;
    const panel = document.createElement("aside");
    panel.className = "p-panel";
    panel.innerHTML = `
      <div class="p-label">Up next</div>
      <div class="stage" id="next-stage"><div class="viewport"></div></div>
      <div class="p-meta"><span class="p-timer" title="Click to reset">00:00</span><span class="p-count"></span></div>
      <div class="p-label">Speaker notes</div>
      <div class="p-notes"></div>`;
    document.body.appendChild(panel);
    const nextStage = panel.querySelector("#next-stage");
    nextViewport = nextStage.querySelector(".viewport");
    notesEl = panel.querySelector(".p-notes");
    countEl = panel.querySelector(".p-count");
    timerEl = panel.querySelector(".p-timer");
    resizer.observe(nextStage);

    startedAt = Date.now();
    timerEl.addEventListener("click", () => (startedAt = Date.now()));
    setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      timerEl.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }, 500);

    if (peer) peer.postMessage({ deck: "hello" }, "*");
  }

  function renderPresenter() {
    const upcoming = step < fragments(idx).length ? slides[idx] : slides[idx + 1];
    nextViewport.innerHTML = "";
    if (upcoming) {
      const clone = upcoming.cloneNode(true);
      clone.classList.add("active");
      const frags = Array.from(clone.querySelectorAll(".fragment"));
      const shown = upcoming === slides[idx] ? step + 1 : 0;
      frags.forEach((f, i) => f.classList.toggle("visible", i < shown));
      nextViewport.appendChild(clone);
    } else {
      nextViewport.innerHTML = `<div class="p-end">End of deck</div>`;
    }
    const notes = slides[idx].querySelector(".notes");
    notesEl.innerHTML = notes ? notes.innerHTML : `<p class="muted">No notes for this slide.</p>`;
    const fragCount = fragments(idx).length;
    countEl.textContent = `${idx + 1} / ${slides.length}${fragCount ? ` · step ${step}/${fragCount}` : ""}`;
  }

  if (isPresenter) setupPresenter();
  resizer.observe(mainStage);
  window.addEventListener("hashchange", parseHash);
  parseHash();
})();
