import { BUILDS, FAQS, SKINS } from "./scripts/data.js?v=split-6";
import { collectBuildArchives, compareArchives, fetchReleasePayload } from "./scripts/releases.js?v=split-6";
import { escapeAttr, escapeHtml, formatBytes, formatMoscowDateTime, renderMarkdown } from "./scripts/utils.js?v=split-6";
import { startHead, startPlayer } from "./scripts/webgl.js?v=split-6";

const SKIN_NAME_COUNTS = SKINS.reduce((counts, skin) => {
    const base = numberedSkinBase(skin);
    counts.set(base, (counts.get(base) || 0) + 1);
    return counts;
}, new Map());

const state = {
    inventoryEnabled: true,
    selectedBuildId: null,
    sliderIndex: 0,
    skinIndex: SKINS.length ? Math.floor(Math.random() * SKINS.length) : 0,
    buildSlideDirection: 1,
    skinSlideDirection: 1
};

const els = {
    body: document.body,
    inventoryStage: document.querySelector("#inventoryStage"),
    inventoryToggle: document.querySelector("#inventoryToggle"),
    inventoryToggleText: document.querySelector("#inventoryToggleText"),
    inventoryOverlays: document.querySelectorAll("[data-inventory-slots]"),
    hotbar: document.querySelector("#hotbar"),
    skinNickname: document.querySelector("#skinNickname"),
    skinDots: document.querySelector("#skinDots"),
    sliderControls: document.querySelector("#sliderControls"),
    buildsRegion: document.querySelector("#buildsRegion"),
    faqList: document.querySelector("#faqList"),
    playerCanvas: document.querySelector("#playerCanvas")
};

const buildRefs = new Map();
let setActivePlayerSkin = null;

function init() {
  initAnimatedFavicon();
  renderHotbar();
  renderInventoryOverlays();
  renderSkinControls();
    renderBuilds();
    renderFaq();
    renderSliderControls();
    bindInventoryToggle();
    bindSkinControls();
    setInventoryEnabled(true);
    selectBuild(BUILDS[0]?.id, {scroll: false});
    initAnimatedDetails();
    loadReleases();
    startHeads();
  startInventoryPlayer();
}

async function initAnimatedFavicon() {
  const iconLink = document.querySelector('link[rel="icon"]') || document.createElement("link");
  const shortcutLink = document.querySelector('link[rel="shortcut icon"]');
  iconLink.rel = "icon";
  iconLink.type = "image/png";
  if (!iconLink.parentNode) {
    document.head.append(iconLink);
  }

  try {
    const response = await fetch("resources/img/favicon-frames/manifest.json?v=site-icon-2", { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`favicon manifest ${response.status}`);
    }

    const manifest = await response.json();
    const frames = Array.isArray(manifest.frames) ? manifest.frames : [];
    if (frames.length < 2) {
      return;
    }

    frames.forEach((frame) => {
      const image = new Image();
      image.src = frame.src;
    });

    let frameIndex = 0;
    const setFrame = () => {
      const frame = frames[frameIndex];
      const href = frame.src;
      iconLink.href = href;
      if (shortcutLink) {
        shortcutLink.href = href;
        shortcutLink.type = "image/png";
      }
      frameIndex = (frameIndex + 1) % frames.length;
      window.setTimeout(setFrame, Math.max(80, Number(frame.delay) || 120));
    };

    setFrame();
  } catch (error) {
    console.warn(error);
  }
}

function renderHotbar() {
    const slots = Array.from({length: 9}, (_slot, index) => {
        const build = BUILDS[index];
        if (!build) {
            return `<button class="hotbar-slot hotbar-slot--empty" type="button" aria-label="Пустой слот"></button>`;
        }

        return `
      <button class="hotbar-slot" type="button" data-build-id="${escapeAttr(build.id)}" data-item-name="${escapeAttr(build.name)}" aria-label="${escapeAttr(build.name)}">
        <img class="item-texture" src="${escapeAttr(build.icon)}" width="16" height="16" alt="" />
      </button>
    `;
    });

    els.hotbar.innerHTML = slots.join("");
    els.hotbar.querySelectorAll("[data-build-id]").forEach((button) => {
        button.addEventListener("click", () => selectBuild(button.dataset.buildId, {scroll: true}));
    });
}

function renderInventoryOverlays() {
    els.inventoryOverlays.forEach((overlay) => {
        const count = Number(overlay.dataset.inventorySlots) || 0;
        overlay.innerHTML = Array.from({length: count}, (_slot, index) => {
            return `<button class="inventory-slot" type="button" tabindex="-1" aria-label="Пустой слот ${index + 1}"></button>`;
        }).join("");
    });
}

function renderBuilds() {
    els.buildsRegion.innerHTML = BUILDS.map(renderBuild).join("");

    for (const build of BUILDS) {
        const root = document.querySelector(`#build-${build.id}`);
        buildRefs.set(build.id, {
            root,
            image: root.querySelector("[data-hero-image]"),
            version: root.querySelector("[data-version-info]"),
            mods: root.querySelector("[data-mods-list]"),
            latest: root.querySelector("[data-latest-download]"),
            oldVersions: root.querySelector("[data-old-versions]"),
            updates: root.querySelector("[data-updates-list]")
        });
        renderMods(build, buildRefs.get(build.id));
    }

    document.querySelectorAll("[data-peek-build]").forEach((button) => {
        button.addEventListener("click", () => {
            const refs = buildRefs.get(button.dataset.peekBuild);
            refs?.image?.classList.remove("is-blurred");
            button.closest(".hunger-gate")?.classList.add("is-hidden");
        });
    });

    document.querySelectorAll("[data-slide]").forEach((button) => {
        button.addEventListener("click", () => moveSlider(button.dataset.slide === "next" ? 1 : -1));
    });
}

function renderBuild(build) {
    const gate = build.gate
        ? `
      <div class="hunger-gate">
        <p>${escapeHtml(build.gate.text)}</p>
        <button class="command-button command-button--light" data-peek-build="${escapeAttr(build.id)}" type="button">${escapeHtml(build.gate.button)}</button>
      </div>
    `
        : "";

    return `
    <article class="build-section" id="build-${escapeAttr(build.id)}" data-build-id="${escapeAttr(build.id)}" hidden>
      <section class="hero" aria-labelledby="build-title-${escapeAttr(build.id)}">
        <div class="hero-frame">
          <div class="hero-media">
            <img class="hero-image ${build.gate ? "is-blurred" : ""}" data-hero-image src="${escapeAttr(build.image)}" alt="${escapeAttr(build.name)} Minecraft-сборка" />
            <div class="hero-shade"></div>
            ${gate}
            <div class="hero-title">
              <h1 id="build-title-${escapeAttr(build.id)}">${escapeHtml(build.title)}</h1>
              <p class="hero-subtitle">${escapeHtml(build.subtitle)}</p>
            </div>
          </div>
          <button class="slide-arrow slide-arrow--prev" data-slide="prev" type="button" aria-label="Предыдущая сборка">‹</button>
          <button class="slide-arrow slide-arrow--next" data-slide="next" type="button" aria-label="Следующая сборка">›</button>
        </div>
      </section>

      <section class="command-grid" aria-label="Информация о сборке ${escapeAttr(build.name)}">
        <details class="command-panel">
          <summary>/чё_за</summary>
          <div class="details-content">
            <div class="subcommands">
              <details class="mini-panel" open>
                <summary>/версия</summary>
                <div class="details-content">
                  <div class="version-lines" data-version-info>
                    <span>Minecraft: ожидает релиз</span>
                    <span>Сборка: ожидает релиз</span>
                  </div>
                </div>
              </details>

              <details class="mini-panel">
                <summary>/моды</summary>
                <div class="details-content">
                  <ul class="mod-list" data-mods-list></ul>
                </div>
              </details>
            </div>
          </div>
        </details>

        <details class="command-panel">
          <summary>/скачать</summary>
          <div class="details-content">
            <div class="download-card" data-latest-download>
              <div>
                <strong>Ищу новейший архив...</strong>
                <p>GitHub Releases проверяются автоматически.</p>
              </div>
            </div>

            <details class="mini-panel versions-panel">
              <summary>/старьё</summary>
              <div class="details-content">
                <div class="version-stack" data-old-versions></div>
              </div>
            </details>
          </div>
        </details>

        <details class="command-panel">
          <summary>/обновы</summary>
          <div class="details-content">
            <div class="updates-stack" data-updates-list></div>
          </div>
        </details>
      </section>
    </article>
  `;
}

function renderFaq() {
    if (!els.faqList) {
        return;
    }

    els.faqList.innerHTML = FAQS.map((item, index) => {
        return `
      <details class="faq-item" ${index === 0 ? "open" : ""}>
        <summary>${escapeHtml(item.question)}</summary>
        <div class="details-content">
          <div class="faq-answer markdown-body">${renderMarkdown(item.answer)}</div>
        </div>
      </details>
    `;
    }).join("");
}

function bindInventoryToggle() {
    els.inventoryToggle?.addEventListener("click", () => {
        setInventoryEnabled(!state.inventoryEnabled);
    });
}

function bindSkinControls() {
    document.querySelectorAll("[data-skin-slide]").forEach((button) => {
        button.addEventListener("click", () => {
            moveSkin(button.dataset.skinSlide === "next" ? 1 : -1);
        });
    });
}

function setInventoryEnabled(enabled) {
    state.inventoryEnabled = enabled;
    els.body.classList.toggle("inventory-enabled", enabled);
    els.body.classList.toggle("inventory-disabled", !enabled);
    els.inventoryStage?.classList.toggle("is-inventory-hidden", !enabled);
    els.sliderControls?.classList.add("is-slider-active");
    els.inventoryToggle?.setAttribute("aria-pressed", String(enabled));
    els.inventoryToggleText.textContent = enabled ? "/отключить_инвентарь" : "/включить_инвентарь";

    if (!state.selectedBuildId) {
        selectBuild(BUILDS[state.sliderIndex].id, {scroll: false});
        return;
    }

    updateBuildVisibility();
}

function selectBuild(buildId, options = {}) {
    const index = BUILDS.findIndex((build) => build.id === buildId);
    if (index < 0) {
        return;
    }

    const previousIndex = state.sliderIndex;
    state.buildSlideDirection = options.direction ?? slideDirection(previousIndex, index, BUILDS.length);
    state.selectedBuildId = buildId;
    state.sliderIndex = index;
    els.buildsRegion.classList.remove("is-waiting");
    updateBuildVisibility();
    renderSliderControls();
    updateHotbar();

    if (options.scroll) {
        requestAnimationFrame(() => {
            document.getElementById(`build-title-${buildId}`)?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        });
    }
}

function updateBuildVisibility() {
    const activeId = state.selectedBuildId || BUILDS[state.sliderIndex]?.id || null;
    els.buildsRegion.classList.toggle("is-waiting", !activeId);

    for (const build of BUILDS) {
        const root = buildRefs.get(build.id)?.root;
        const isActive = build.id === activeId;
        root.hidden = !isActive;
        root.classList.toggle("is-active", isActive);
        root.classList.remove("is-slide-in-next", "is-slide-in-prev");
        if (isActive) {
            root.offsetHeight;
            root.classList.add(state.buildSlideDirection >= 0 ? "is-slide-in-next" : "is-slide-in-prev");
        }
    }
}

function updateHotbar() {
    els.hotbar.querySelectorAll("[data-build-id]").forEach((button) => {
        button.classList.toggle("is-selected", button.dataset.buildId === state.selectedBuildId);
    });
}

function renderSkinControls() {
    const currentSkin = SKINS[state.skinIndex];
    if (els.skinNickname) {
        els.skinNickname.textContent = currentSkin ? skinNickname(currentSkin) : "Player";
    }

    if (!els.skinDots) {
        return;
    }

    els.skinDots.innerHTML = SKINS.map((skin, index) => {
        const active = index === state.skinIndex;
        return `
      <button class="skin-dot ${active ? "is-active" : ""}" type="button" data-skin-index="${index}" aria-label="${escapeAttr(skinNickname(skin))}" aria-current="${active ? "true" : "false"}"></button>
    `;
    }).join("");

    els.skinDots.querySelectorAll("[data-skin-index]").forEach((button) => {
        button.addEventListener("click", () => setSkinIndex(Number(button.dataset.skinIndex)));
    });
}

function moveSkin(step) {
    if (!SKINS.length) {
        return;
    }
    state.skinSlideDirection = Math.sign(step) || 1;
    setSkinIndex((state.skinIndex + step + SKINS.length) % SKINS.length);
}

function setSkinIndex(index) {
    if (!SKINS.length || !Number.isFinite(index)) {
        return;
    }

    const previousIndex = state.skinIndex;
    state.skinSlideDirection = slideDirection(previousIndex, index, SKINS.length);
    state.skinIndex = (index + SKINS.length) % SKINS.length;
    animateSkinSlide();
    renderSkinControls();
    setActivePlayerSkin?.(SKINS[state.skinIndex]);
}

function skinNickname(path) {
    const fileName = String(path)
        .split("/")
        .pop()
        .replace(/\.glb$/i, "");
    const base = numberedSkinBase(path);
    return SKIN_NAME_COUNTS.get(base) > 1 ? base : fileName;
}

function numberedSkinBase(path) {
    return String(path)
        .split("/")
        .pop()
        .replace(/\.glb$/i, "")
        .replace(/_\d+$/i, "");
}

function renderSliderControls() {
    els.sliderControls.innerHTML = BUILDS.map((build, index) => {
        const active = index === state.sliderIndex;
        return `
      <button class="slider-dot ${active ? "is-active" : ""}" type="button" data-slider-dot="${index}" aria-label="${escapeAttr(build.name)}" aria-current="${active ? "true" : "false"}"></button>
    `;
    }).join("");

    els.sliderControls.querySelectorAll("[data-slider-dot]").forEach((button) => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.sliderDot);
            selectBuild(BUILDS[index].id, {scroll: false});
        });
    });
}

function moveSlider(step) {
    const nextIndex = (state.sliderIndex + step + BUILDS.length) % BUILDS.length;
    selectBuild(BUILDS[nextIndex].id, {scroll: false, direction: Math.sign(step) || 1});
}

function slideDirection(from, to, total) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to || total <= 1) {
        return 1;
    }

    const forward = (to - from + total) % total;
    const backward = (from - to + total) % total;
    return forward <= backward ? 1 : -1;
}

function animateSkinSlide() {
    const preview = document.querySelector(".player-preview");
    if (!preview) {
        return;
    }

    preview.classList.remove("is-skin-slide-next", "is-skin-slide-prev");
    preview.offsetHeight;
    preview.classList.add(state.skinSlideDirection >= 0 ? "is-skin-slide-next" : "is-skin-slide-prev");
}

function renderMods(build, refs) {
    if (!build.mods.length) {
        refs.mods.innerHTML = `<li class="muted">Список модов пока не указан.</li>`;
        return;
    }

    refs.mods.innerHTML = build.mods
        .map((mod) => `<li><a href="${escapeAttr(mod.url)}" target="_blank" rel="noreferrer">${escapeHtml(mod.name)}</a></li>`)
        .join("");
}

function initAnimatedDetails() {
    const detailsItems = Array.from(document.querySelectorAll("details"));
    const canAnimate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const details of detailsItems) {
        const summary = details.querySelector(":scope > summary");
        const content = details.querySelector(":scope > .details-content");
        if (!summary || !content || !canAnimate) {
            continue;
        }

        summary.addEventListener("click", (event) => {
            event.preventDefault();
            details.dataset.animating === "true" ? undefined : toggleDetails(details, content);
        });
    }
}

function toggleDetails(details, content) {
    details.dataset.animating = "true";

    if (!details.open) {
        details.open = true;
        content.style.display = "block";
        content.style.height = "0px";
        content.style.opacity = "0";
        content.offsetHeight;
        content.style.transition = "height 240ms ease, opacity 180ms ease";
        content.style.height = `${content.scrollHeight}px`;
        content.style.opacity = "1";
    } else {
        content.style.display = "block";
        content.style.height = `${content.scrollHeight}px`;
        content.style.opacity = "1";
        content.offsetHeight;
        content.style.transition = "height 220ms ease, opacity 160ms ease";
        content.style.height = "0px";
        content.style.opacity = "0";
    }

    const finish = (event) => {
        if (event.propertyName !== "height") {
            return;
        }

        const shouldClose = content.style.height === "0px";
        if (shouldClose) {
            details.open = false;
            content.style.display = "";
        }
        content.style.height = "";
        content.style.opacity = "";
        content.style.transition = "";
        details.dataset.animating = "false";
        content.removeEventListener("transitionend", finish);
    };

    content.addEventListener("transitionend", finish);
}

async function loadReleases() {
    let releases;
    try {
        releases = await fetchReleasePayload();
    } catch (error) {
        for (const build of BUILDS) {
            renderEmptyReleaseState(build, "GitHub Releases сейчас недоступны.");
        }
        console.warn(error);
        return;
    }

    for (const build of BUILDS) {
        const files = collectBuildArchives(releases, build);
        if (!files.length) {
            renderEmptyReleaseState(build, `Релизов для ${build.name} пока нет.`);
            continue;
        }

        files.sort(compareArchives);
        renderDownloads(build, files);
        renderUpdates(build, files);
    }
}

function renderDownloads(build, files) {
    const refs = buildRefs.get(build.id);
    const [latest, ...older] = files;

    refs.version.innerHTML = `
    <span>Minecraft: Forge ${escapeHtml(latest.mcVersion)}</span>
    <span>Сборка: ${escapeHtml(latest.buildVersion)}</span>
  `;

    refs.latest.innerHTML = `
    <div>
      ${renderArchiveTitle(latest)}
      <p>
        <a href="${escapeAttr(latest.url)}">/скачать_новейшую</a>
        <span class="muted"> ${formatBytes(latest.size)}</span>
      </p>
      <p class="muted">${formatMoscowDateTime(latest.createdAt)}</p>
    </div>
  `;

    refs.oldVersions.innerHTML = older.length
        ? older.map(renderVersionItem).join("")
        : `<div class="version-item muted">Старых версий пока нет.</div>`;
}

function renderVersionItem(file) {
    return `
    <article class="version-item">
      ${renderArchiveTitle(file)}
      <div class="version-meta">
        <span class="tag">${formatMoscowDateTime(file.createdAt)}</span>
        <span class="tag">${formatBytes(file.size)}</span>
      </div>
      <p><a href="${escapeAttr(file.url)}">/скачать</a></p>
    </article>
  `;
}

function renderArchiveTitle(file) {
    const requirementClass = file.required ? "requirement-icon--required" : "requirement-icon--optional";
    const kindClass = file.kind === "addition" ? "archive-kind--addition" : "archive-kind--version";
    const mark = file.required ? "!" : "*";
    const displayName = cleanArchiveDisplayName(file.displayName || file.fileName);

    return `
    <div class="archive-title">
      <span class="requirement-icon ${requirementClass}" title="${escapeAttr(file.requiredLabel)}">${mark}</span>
      <strong>${escapeHtml(displayName)}</strong>
      <span class="archive-kind ${kindClass}">${escapeHtml(file.kindLabel)}</span>
    </div>
  `;
}

function cleanArchiveDisplayName(fileName) {
    const value = String(fileName || "");
    const match = value.match(/^(.+?)(?:\+[^/\\]+)?(\.zip)$/i);
    return match ? `${match[1]}${match[2]}` : value.split("+")[0];
}

function renderUpdates(build, files) {
    const refs = buildRefs.get(build.id);
    refs.updates.innerHTML = files
        .map((file) => {
            const body = file.releaseBody.trim() || "Описание обновы пока пустое.";
            return `
        <article class="update-item">
          <strong>${escapeHtml(file.releaseName)}</strong>
          <div class="version-meta">
            <span class="tag">v${escapeHtml(file.buildVersion)}</span>
          </div>
          <div class="update-body markdown-body">${renderMarkdown(body)}</div>
        </article>
      `;
        })
        .join("");
}

function renderEmptyReleaseState(build, message) {
    const refs = buildRefs.get(build.id);
    refs.version.innerHTML = `
    <span>Minecraft: ожидает релиз</span>
    <span>Сборка: ожидает релиз</span>
  `;
    refs.latest.innerHTML = `
    <div>
      <strong>${escapeHtml(message)}</strong>
    </div>
  `;
    refs.oldVersions.innerHTML = `<div class="version-item muted">Старых версий пока нет.</div>`;
    refs.updates.innerHTML = `<div class="update-item muted">Обнов пока нет.</div>`;
}

function startHeads() {
    const canvases = Array.from(document.querySelectorAll("[data-head-canvas]"));
    for (const canvas of canvases) {
        startHead(canvas);
    }
}

async function startInventoryPlayer() {
    if (!els.playerCanvas) {
        return;
    }
    setActivePlayerSkin = await startPlayer(els.playerCanvas, SKINS[state.skinIndex] || SKINS[0]);
}

init();




