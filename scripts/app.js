// import { BUILDS, FAQS, MODS, SKINS } from "./mods.js?v=split-25";
import { BUILDS } from "./data/builds.js";
import { FAQS } from "./data/faqs.js";
import { MODS } from "./data/mods.js";
import { SKINS } from "./data/skins.js";


import { collectBuildArchives, compareArchives, fetchReleasePayload } from "./releases.js?v=split-22";
import { escapeAttr, escapeHtml, formatBytes, formatMoscowDateTime, renderMarkdown } from "./utils.js?v=split-22";
import { initBuildPanoramas } from "./panorama.js?v=split-26";
import { startHead, startPlayer } from "./webgl.js?v=split-22";

const ITEM_TICK_MS = 50;
const SKIN_NAME_COUNTS = SKINS.reduce((counts, skin) => {
    const base = numberedSkinBase(skin);
    counts.set(base, (counts.get(base) || 0) + 1);
    return counts;
}, new Map());

const MOD_CATEGORIES = [
    {id: "content", label: "Контент", command: "/контент", icon: "package-open"},
    {id: "qol", label: "QoL", command: "/qol", icon: "sparkles"},
    {id: "optimization", label: "Оптимизация", command: "/оптимизация", icon: "fire-extinguisher"},
    {id: "compat", label: "Совместимости", command: "/совместимости", icon: "cable"},
    {id: "libraries", label: "Библиотеки", command: "/библиотеки", icon: "blocks"}
];

const MOD_CATEGORY_IDS = new Set(MOD_CATEGORIES.map((category) => category.id));
const MOD_CATEGORY_ALIASES = {
    content: "content",
    "контент": "content",
    qol: "qol",
    "куол": "qol",
    optimization: "optimization",
    optimize: "optimization",
    "оптимизация": "optimization",
    libraries: "libraries",
    library: "libraries",
    libs: "libraries",
    "библиотеки": "libraries",
    "библиотека": "libraries"
};
const MOD_KEYS_BY_CATEGORY = {
    content: [],
    qol: [
        "appleskin",
        "carryon",
        "controlling",
        "corpse",
        "enchantmentdescriptions",
        "fallingtree",
        "harvest",
        "hwyla",
        "inventoryhud",
        "inventorytweaks",
        "itemborders",
        "itemphysiclite",
        "jade",
        "jeiintegration",
        "jei",
        "journeymap",
        "jeb",
        "jer",
        "legendarytooltips",
        "mousetweaks",
        "naturescompass",
        "norecipebook",
        "onlinepicframe",
        "reachfix",
        "xaerominimap",
        "xaeroworldmap"
    ],
    compat: [
        "emberstic"
    ],
    optimization: [
        "aiimprovements",
        "clumps",
        "farsight",
        "fastfurnace",
        "fastworkbench",
        "fpsreducer",
        "optifine",
        "surge",
        "texfix",
        "vintagefix"
    ],
    libraries: [
        "artemislib",
        "baubles",
        "bookshelf",
        "codechickenlib",
        "creativecore",
        "endercore",
        "forgelin",
        "geckolib",
        "hammerlib",
        "ichunutil",
        "ivtoolkit",
        "konkrete",
        "libraryex",
        "llibrary",
        "lunatriuscore",
        "mixinbooter",
        "openmodslib",
        "patchouli",
        "placebo",
        "timecore",
        "xaerolib"
    ]
};

const MOD_CATEGORY_BY_KEY = Object.entries(MOD_KEYS_BY_CATEGORY).reduce((lookup, [category, keys]) => {
    for (const key of keys) {
        lookup[key] = category;
    }
    return lookup;
}, {});

const state = {

    inventoryEnabled: true,
    selectedBuildId: null,
    sliderIndex: 0,
    skinIndex: SKINS.length ? Math.floor(Math.random() * SKINS.length) : 0,
    buildSlideDirection: 1,
    skinSlideDirection: 1,
    drag: {
        active: false,
        pointerId: null,
        startX: 0,
        currentX: 0,
        section: null,
        moved: false
    }
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
const generatedVersionPackages = new Map();
const screenshotGroups = new Map();
const hotbarItemAnimations = [];
let setActivePlayerSkin = null;
let jsZipImportPromise = null;
let hotbarAnimationFrame = null;
let screenshotViewer = null;

function init() {
  initAnimatedFavicon();
  renderHotbar();
  renderInventoryOverlays();
  renderSkinControls();
    renderBuilds();
    initBuildPanoramas();
    renderFaq();
    renderSliderControls();
    bindInventoryToggle();
    bindSkinControls();
    bindBuildSwipe();
    bindUpdateLinks();
    bindGeneratedVersionDownloads();
    bindScreenshotGallery();
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
        <canvas class="item-texture" width="16" height="16" data-item-texture="${escapeAttr(build.icon)}" aria-hidden="true"></canvas>
      </button>
    `;
    });

    els.hotbar.innerHTML = slots.join("");
    initHotbarItemTextures();
    els.hotbar.querySelectorAll("[data-build-id]").forEach((button) => {
        button.addEventListener("click", () => selectBuild(button.dataset.buildId, {scroll: true}));
    });
}

function initHotbarItemTextures() {
    hotbarItemAnimations.length = 0;
    if (hotbarAnimationFrame) {
        cancelAnimationFrame(hotbarAnimationFrame);
        hotbarAnimationFrame = null;
    }

    els.hotbar.querySelectorAll("[data-item-texture]").forEach((canvas) => {
        initHotbarItemTexture(canvas);
    });
}

async function initHotbarItemTexture(canvas) {
    const src = canvas.dataset.itemTexture;
    if (!src) {
        return;
    }

    try {
        const image = await loadImage(src);
        const meta = await fetchItemTextureMeta(src);
        const animation = createItemTextureAnimation(canvas, image, meta);
        drawItemTextureFrame(animation, 0);

        if (animation.frames.length > 1) {
            hotbarItemAnimations.push(animation);
            startHotbarItemAnimationLoop();
        }
    } catch (error) {
        console.warn(error);
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Texture ${src} failed to load`));
        image.src = src;
    });
}

async function fetchItemTextureMeta(src) {
    try {
        const response = await fetch(`${src}.mcmeta`, {cache: "force-cache"});
        if (!response.ok) {
            return null;
        }
        return response.json();
    } catch (_error) {
        return null;
    }
}

function createItemTextureAnimation(canvas, image, meta) {
    const frameSize = image.width;
    const frameCount = Math.max(1, Math.floor(image.height / frameSize));
    const defaultFrameTime = Math.max(1, Number(meta?.animation?.frametime) || 1);
    const rawFrames = Array.isArray(meta?.animation?.frames) ? meta.animation.frames : null;
    const frames = rawFrames?.length
        ? rawFrames.map((frame) => normalizeItemFrame(frame, defaultFrameTime)).filter((frame) => frame.index >= 0 && frame.index < frameCount)
        : Array.from({length: frameCount}, (_frame, index) => ({index, time: defaultFrameTime}));

    return {
        canvas,
        context: canvas.getContext("2d"),
        image,
        frameSize,
        frames: frames.length ? frames : [{index: 0, time: defaultFrameTime}],
        frameCursor: 0,
        frameStartedAt: performance.now()
    };
}

function normalizeItemFrame(frame, defaultFrameTime) {
    if (typeof frame === "number") {
        return {index: frame, time: defaultFrameTime};
    }

    return {
        index: Number(frame?.index) || 0,
        time: Math.max(1, Number(frame?.time) || defaultFrameTime)
    };
}

function startHotbarItemAnimationLoop() {
    if (hotbarAnimationFrame) {
        return;
    }

    const tick = (time) => {
        for (const animation of hotbarItemAnimations) {
            advanceItemTextureAnimation(animation, time);
        }
        hotbarAnimationFrame = hotbarItemAnimations.length ? requestAnimationFrame(tick) : null;
    };

    hotbarAnimationFrame = requestAnimationFrame(tick);
}

function advanceItemTextureAnimation(animation, time) {
    const frame = animation.frames[animation.frameCursor];
    const duration = frame.time * ITEM_TICK_MS;
    if (time - animation.frameStartedAt < duration) {
        return;
    }

    animation.frameCursor = (animation.frameCursor + 1) % animation.frames.length;
    animation.frameStartedAt = time;
    drawItemTextureFrame(animation, animation.frameCursor);
}

function drawItemTextureFrame(animation, cursor) {
    const frame = animation.frames[cursor];
    const {canvas, context, image, frameSize} = animation;
    if (!context || !frame) {
        return;
    }

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
        image,
        0,
        frame.index * frameSize,
        frameSize,
        frameSize,
        0,
        0,
        canvas.width,
        canvas.height
    );
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
    screenshotGroups.clear();

    for (const build of BUILDS) {
        const root = document.querySelector(`#build-${build.id}`);
        buildRefs.set(build.id, {
            root,
        image: root.querySelector("[data-hero-image]"),
            version: root.querySelector("[data-version-info]"),
            mods: root.querySelector("[data-mods-list]"),
            latest: root.querySelector("[data-latest-download]"),
            oldVersions: root.querySelector("[data-old-versions]"),
            generatedVersions: root.querySelector("[data-generated-versions]"),
            screenshots: root.querySelector("[data-screenshots-grid]"),
            updates: root.querySelector("[data-updates-list]")
        });
        renderMods(build, buildRefs.get(build.id));
        renderScreenshots(build, buildRefs.get(build.id));
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

    renderLucideIcons();
}


function renderLucideIcons() {
    const render = () => {
        window.lucide?.createIcons({
            attrs: {
                "stroke-width": 2.4,
                "aria-hidden": "true"
            }
        });
    };

    render();
    if (!window.lucide) {
        window.addEventListener("load", render, {once: true});
    }
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
            ${renderHeroVisual(build)}
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
        <details class="command-panel command-panel--about">
          <summary>
            <i class="summary-icon summary-icon--search" data-lucide="search" aria-hidden="true"></i>
            <span>/чё_за</span>
          </summary>
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
                  <div class="mod-versions" data-mods-list></div>
                </div>
              </details>
            </div>
          </div>
        </details>

        <details class="command-panel command-panel--download">
          <summary>
            <i class="summary-icon summary-icon--download" data-lucide="download" aria-hidden="true"></i>
            <span>/скачать</span>
          </summary>
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

            <details class="mini-panel versions-panel">
              <summary>/авто_версии</summary>
              <div class="details-content">
                <div class="generated-warning">
                  <i data-lucide="triangle-alert" aria-hidden="true"></i>
                  <span>Версии были собраны автоматически, могут быть ошибки</span>
                </div>
                <div class="version-stack" data-generated-versions></div>
              </div>
            </details>
          </div>
        </details>

        <details class="command-panel command-panel--updates" data-updates-panel>
          <summary>
            <i class="summary-icon summary-icon--updates" data-lucide="refresh-cw" aria-hidden="true"></i>
            <span>/обновы</span>
          </summary>
          <div class="details-content">
            <div class="updates-stack" data-updates-list></div>
          </div>
        </details>

        <details class="command-panel command-panel--screenshots">
          <summary>
            <i class="summary-icon summary-icon--screenshots" data-lucide="images" aria-hidden="true"></i>
            <span>/скрины</span>
          </summary>
          <div class="details-content">
            <div class="screenshots-grid" data-screenshots-grid></div>
          </div>
        </details>
      </section>
    </article>
  `;
}

function renderHeroVisual(build) {
    const panoramas = Array.isArray(build.panoramas) ? build.panoramas.filter(Boolean) : [];
    if (panoramas.length) {
        return `
            <div
              class="hero-panorama ${build.gate ? "is-blurred" : ""}"
              data-hero-image
              data-panorama
              data-panorama-paths="${escapeAttr(JSON.stringify(panoramas))}"
              aria-label="${escapeAttr(build.name)} Minecraft-панорама"
              role="img"
            ></div>
            <div class="panorama-controls" aria-label="Управление панорамой">
              <button class="panorama-control" type="button" data-panorama-speed aria-pressed="false" aria-label="Скорость панорамы x1">
                <i data-lucide="chevrons-right" aria-hidden="true"></i>
                <span data-panorama-speed-label>x1</span>
              </button>
              <button class="panorama-control" type="button" data-panorama-prev aria-label="Предудыщая панорама">
                <i data-lucide="rotate-ccw" aria-hidden="true"></i>
              </button>
              <button class="panorama-control" type="button" data-panorama-next aria-label="Следующая панорама">
                <i data-lucide="rotate-cw" aria-hidden="true"></i>
              </button>
            </div>
        `;
    }

    return `<img class="hero-image ${build.gate ? "is-blurred" : ""}" data-hero-image src="${escapeAttr(build.image)}" alt="${escapeAttr(build.name)} Minecraft-сборка" />`;
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
          <div class="faq-answer markdown-body">${renderMarkdown(item.answer)}${renderFaqLegend(item.legend)}${item.after ? renderMarkdown(item.after) : ""}</div>
        </div>
      </details>
    `;
    }).join("");
}

function renderFaqLegend(items) {
    if (!Array.isArray(items) || !items.length) {
        return "";
    }

    const rows = items.map((item) => {
        return `
          <li class="faq-legend-item">
            ${renderFaqLegendBadge(item)}
            <span>${escapeHtml(item.text)}</span>
          </li>
        `;
    }).join("");

    return `<ul class="faq-legend">${rows}</ul>`;
}

function renderFaqLegendBadge(item) {
    if (item.badge === "kind") {
        const kindClass = item.variant === "addition" ? "archive-kind--addition" : "archive-kind--version";
        return `<span class="archive-kind ${kindClass}">${escapeHtml(item.label)}</span>`;
    }

    const requirementClass = item.variant === "optional" ? "requirement-icon--optional" : "requirement-icon--required";
    return `<span class="requirement-icon ${requirementClass}">${escapeHtml(item.label)}</span>`;
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


function bindBuildSwipe() {
    els.buildsRegion?.addEventListener("pointerdown", (event) => {
        if (!isTouchSliderEnabled(event)) {
            return;
        }

        const section = event.target.closest(".build-section.is-active");
        if (!section || event.target.closest("a, button, summary, input, textarea, select")) {
            return;
        }

        state.drag.active = true;
        state.drag.pointerId = event.pointerId;
        state.drag.startX = event.clientX;
        state.drag.currentX = event.clientX;
        state.drag.section = section;
        state.drag.moved = false;
        section.classList.remove("is-drag-settling");
        section.classList.add("is-dragging");
        section.setPointerCapture?.(event.pointerId);
    });

    els.buildsRegion?.addEventListener("pointermove", (event) => {
        if (!state.drag.active || event.pointerId !== state.drag.pointerId) {
            return;
        }

        const delta = event.clientX - state.drag.startX;
        const softenedDelta = delta * 0.86;
        state.drag.currentX = event.clientX;
        state.drag.moved = state.drag.moved || Math.abs(delta) > 6;
        state.drag.section?.style.setProperty("--drag-x", `${softenedDelta}px`);
        if (state.drag.moved) {
            event.preventDefault();
        }
    }, {passive: false});

    const finish = (event) => {
        if (!state.drag.active || event.pointerId !== state.drag.pointerId) {
            return;
        }

        const section = state.drag.section;
        const delta = state.drag.currentX - state.drag.startX;
        const width = section?.getBoundingClientRect().width || window.innerWidth;
        const threshold = Math.min(120, Math.max(58, width * 0.18));
        const shouldSlide = Math.abs(delta) >= threshold;

        section?.releasePointerCapture?.(event.pointerId);
        section?.classList.remove("is-dragging");
        section?.classList.add("is-drag-settling");
        section?.style.setProperty("--drag-x", "0px");

        window.setTimeout(() => {
            section?.classList.remove("is-drag-settling");
            section?.style.removeProperty("--drag-x");
        }, 220);

        resetDragState();

        if (shouldSlide) {
            moveSlider(delta < 0 ? 1 : -1);
        }
    };

    els.buildsRegion?.addEventListener("pointerup", finish);
    els.buildsRegion?.addEventListener("pointercancel", finish);
}

function isTouchSliderEnabled(event) {
    return (
        event.isPrimary !== false &&
        event.pointerType !== "mouse" &&
        window.matchMedia("(max-width: 760px)").matches &&
        BUILDS.length > 1
    );
}

function resetDragState() {
    state.drag.active = false;
    state.drag.pointerId = null;
    state.drag.startX = 0;
    state.drag.currentX = 0;
    state.drag.section = null;
    state.drag.moved = false;
}

function bindUpdateLinks() {
    els.buildsRegion?.addEventListener("click", (event) => {
        const link = event.target.closest("[data-update-link]");
        if (!link) {
            return;
        }

        const target = document.querySelector(link.getAttribute("href"));
        const panel = link.closest(".build-section")?.querySelector("[data-updates-panel]");
        if (!target || !panel) {
            return;
        }

        event.preventDefault();
        panel.open = true;
        panel.classList.add("is-expanded");
        history.pushState(null, "", link.getAttribute("href"));
        requestAnimationFrame(() => {
            target.scrollIntoView({behavior: "smooth", block: "start"});
            target.classList.add("is-targeted");
            window.setTimeout(() => target.classList.remove("is-targeted"), 1400);
        });
    });
}

function bindGeneratedVersionDownloads() {
    els.buildsRegion?.addEventListener("click", async (event) => {
        const link = event.target.closest("[data-generated-version-id]");
        if (!link) {
            return;
        }
        if (link.getAttribute("aria-busy") === "true") {
            event.preventDefault();
            return;
        }

        event.preventDefault();
        const pack = generatedVersionPackages.get(link.dataset.generatedVersionId);
        if (!pack) {
            return;
        }

        await downloadGeneratedVersion(pack, link);
    });
}

function bindScreenshotGallery() {
    els.buildsRegion?.addEventListener("click", (event) => {
        const stepButton = event.target.closest("[data-screenshot-preview-step]");
        if (stepButton) {
            event.preventDefault();
            stepScreenshotCardPreview(stepButton);
            return;
        }

        const openButton = event.target.closest("[data-screenshot-open]");
        if (openButton) {
            event.preventDefault();
            openScreenshotViewer(openButton.dataset.screenshotOpen, Number(openButton.dataset.screenshotIndex) || 0);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (!screenshotViewer?.root?.classList.contains("is-open")) {
            return;
        }

        if (event.key === "Escape") {
            closeScreenshotViewer();
        } else if (event.key === "ArrowLeft") {
            moveScreenshotViewer(-1);
        } else if (event.key === "ArrowRight") {
            moveScreenshotViewer(1);
        }
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
        refs.mods.innerHTML = `<div class="mod-empty muted">Список модов пока не указан.</div>`;
        return;
    }

    const mods = build.mods
        .map((mod) => resolveBuildMod(build, mod))
        .filter(Boolean);

    if (!mods.length) {
        refs.mods.innerHTML = `<div class="mod-empty muted">Список модов пока не указан.</div>`;
        return;
    }

    refs.mods.innerHTML = renderModVersionGroups(mods);
}

function resolveBuildMod(build, mod) {
    const minecraftVersion = mod?.minecraftVersion || mod?.mcVersion || build.minecraftVersion || build.mcVersion;

    if (typeof mod === "object" && mod) {
        const key = mod.id || mod.key || "";
        return normalizeBuildMod(mod, key, minecraftVersion);
    }

    const data = MODS[minecraftVersion]?.[mod];
    return data ? normalizeBuildMod(data, mod, minecraftVersion) : null;
}

function normalizeBuildMod(mod, key, minecraftVersion) {
    return {
        ...mod,
        key,
        minecraftVersion,
        category: normalizeModCategory(mod.category || inferModCategory(key, mod))
    };
}

function normalizeModCategory(category) {
    const normalized = String(category || "").toLowerCase();
    return MOD_CATEGORY_ALIASES[normalized] || (MOD_CATEGORY_IDS.has(normalized) ? normalized : "content");
}

function inferModCategory(key, mod) {
    const normalizedKey = String(key || "").toLowerCase();
    if (MOD_CATEGORY_BY_KEY[normalizedKey]) {
        return MOD_CATEGORY_BY_KEY[normalizedKey];
    }

    const haystack = `${mod.name || ""} ${mod.description || ""}`.toLowerCase();
    if (/(lib|library|core|api|mixin|forgelin|baubles|bookshelf)/i.test(haystack)) {
        return "libraries";
    }
    if (/(optimiz|performance|fps|lag|memory|furnace|workbench|texfix|fix)/i.test(haystack)) {
        return "optimization";
    }
    if (/(hud|map|inventory|tooltip|recipe|jei|controls|compass|tweak|sort)/i.test(haystack)) {
        return "qol";
    }

    return "content";
}

function renderModVersionGroups(mods) {
    return MOD_CATEGORIES
        .map((category) => renderModCategoryPanel(category, mods.filter((mod) => mod.category === category.id)))
        .join("");
}

function renderModCategoryPanel(category, mods) {
    const items = mods.length
        ? mods.map(renderModItem).join("")
        : `<li class="mod-empty muted">Пока пусто.</li>`;

    return `
      <details class="mini-panel mod-category-panel" ${mods.length ? "open" : ""}>
        <summary>
          <i class="mod-category-icon" data-lucide="${escapeAttr(category.icon)}" aria-hidden="true"></i>
          <span>${escapeHtml(category.command)}</span>
          <span class="mod-count">${mods.length}</span>
        </summary>
        <div class="details-content">
          <ul class="mod-list">
            ${items}
          </ul>
        </div>
      </details>
    `;
}

function renderModItem(mod) {
    return `
      <li>
        <a class="mod-link" href="${escapeAttr(mod.url)}" target="_blank" rel="noreferrer">${escapeHtml(mod.name)} v${escapeHtml(mod.version)}</a>
        <span> - ${escapeHtml(mod.description)}</span>
      </li>
    `;
}

function renderScreenshots(build, refs) {
    const groups = normalizeScreenshotGroups(build);
    if (!groups.length) {
        refs.screenshots.innerHTML = `<div class="screenshot-empty muted">Скринов пока нет.</div>`;
        return;
    }

    refs.screenshots.innerHTML = groups.map((group) => renderScreenshotCard(group)).join("");
}

function normalizeScreenshotGroups(build) {
    return (build.screenshots || [])
        .map((entry, groupIndex) => {
            const rawItems = Array.isArray(entry?.items) ? entry.items : [entry];
            const items = rawItems
                .map((item, itemIndex) => normalizeScreenshotItem(item, entry, itemIndex))
                .filter(Boolean);

            if (!items.length) {
                return null;
            }

            const group = {
                id: `${build.id}-screenshots-${groupIndex}`,
                caption: typeof entry?.caption === "string" ? entry.caption : "",
                date: entry?.date || formatScreenshotDate(items[0].src),
                items
            };
            screenshotGroups.set(group.id, group);
            return group;
        })
        .filter(Boolean);
}

function normalizeScreenshotItem(item, groupEntry, itemIndex) {
    if (typeof item === "string") {
        return {
            src: item,
            caption: "",
            date: formatScreenshotDate(item)
        };
    }

    if (!item?.src) {
        return null;
    }

    return {
        src: item.src,
        caption: typeof item.caption === "string" ? item.caption : "",
        date: item.date || formatScreenshotDate(item.src),
        alt: item.alt || item.caption || groupEntry?.caption || `Скрин ${itemIndex + 1}`
    };
}

function renderScreenshotCard(group) {
    const first = group.items[0];
    const cardCaption = group.caption || first.caption || "";
    const cardDate = group.date || first.date || "";
    const date = cardDate ? `<span class="screenshot-date" data-screenshot-card-date>${escapeHtml(cardDate)}</span>` : "";
    const caption = `<p data-screenshot-card-caption ${cardCaption ? "" : "hidden"}>${escapeHtml(cardCaption)}</p>`;
    const multi = group.items.length > 1;
    const controls = multi
        ? `
          <div class="screenshot-card-controls">
            <button type="button" data-screenshot-preview-step="-1" data-screenshot-group="${escapeAttr(group.id)}" aria-label="Предыдущий скрин">‹</button>
            <span data-screenshot-counter>1/${group.items.length}</span>
            <button type="button" data-screenshot-preview-step="1" data-screenshot-group="${escapeAttr(group.id)}" aria-label="Следующий скрин">›</button>
          </div>
        `
        : "";
    const stack = multi ? `<span class="screenshot-stack-count">${group.items.length}</span>` : "";

    return `
      <article class="screenshot-card ${multi ? "screenshot-card--group" : ""}" data-screenshot-card="${escapeAttr(group.id)}" data-screenshot-current="0">
        <button class="screenshot-open" type="button" data-screenshot-open="${escapeAttr(group.id)}" data-screenshot-index="0">
          <img src="${escapeAttr(first.src)}" alt="${escapeAttr(first.alt || group.caption || "Скрин сборки")}" loading="lazy" data-screenshot-preview />
          ${stack}
        </button>
        <div class="screenshot-meta">
          ${date}
          ${caption}
          ${controls}
        </div>
      </article>
    `;
}

function stepScreenshotCardPreview(button) {
    const group = screenshotGroups.get(button.dataset.screenshotGroup);
    const card = button.closest("[data-screenshot-card]");
    if (!group || !card) {
        return;
    }

    const step = Number(button.dataset.screenshotPreviewStep) || 0;
    const nextIndex = (Number(card.dataset.screenshotCurrent) + step + group.items.length) % group.items.length;
    const item = group.items[nextIndex];
    const preview = card.querySelector("[data-screenshot-preview]");
    const caption = group.caption || item.caption || "";
    const date = group.date || item.date || "";
    card.dataset.screenshotCurrent = String(nextIndex);
    preview?.classList.add("is-switching");
    window.setTimeout(() => {
        preview?.setAttribute("src", item.src);
        preview?.setAttribute("alt", item.alt || caption || "Скрин сборки");
        preview?.classList.remove("is-switching");
    }, 120);
    card.querySelector("[data-screenshot-open]")?.setAttribute("data-screenshot-index", String(nextIndex));
    card.querySelector("[data-screenshot-counter]")?.replaceChildren(`${nextIndex + 1}/${group.items.length}`);
    const captionNode = card.querySelector("[data-screenshot-card-caption]");
    if (captionNode) {
        captionNode.textContent = caption;
        captionNode.hidden = !caption;
    }
    const dateNode = card.querySelector("[data-screenshot-card-date]");
    if (dateNode) {
        dateNode.textContent = date;
        dateNode.hidden = !date;
    }
}

function formatScreenshotDate(src) {
    const fileName = String(src || "").split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "";
    const match = fileName.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})\.(\d{2})\.(\d{2})$/);
    if (!match) {
        return "";
    }

    return `${Number(match[3])}.${match[2]}.${match[1]}, ${match[4]}:${match[5]} мск`;
}

function ensureScreenshotViewer() {
    if (screenshotViewer) {
        return screenshotViewer;
    }

    const root = document.createElement("div");
    root.className = "screenshot-viewer";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="screenshot-viewer-backdrop" data-screenshot-close></div>
      <div class="screenshot-viewer-dialog" role="dialog" aria-modal="true" aria-label="Просмотр скрина">
        <div class="screenshot-viewer-toolbar">
          <button type="button" data-screenshot-move="-1" aria-label="Предыдущий скрин">‹</button>
          <button type="button" data-screenshot-zoom="-1" aria-label="Отдалить">−</button>
          <button type="button" data-screenshot-zoom-reset aria-label="Сбросить масштаб">1x</button>
          <button type="button" data-screenshot-zoom="1" aria-label="Приблизить">+</button>
          <a data-screenshot-download href="#" download>/скачать</a>
          <button type="button" data-screenshot-move="1" aria-label="Следующий скрин">›</button>
          <button type="button" data-screenshot-close aria-label="Закрыть">×</button>
        </div>
        <div class="screenshot-viewer-stage">
          <img alt="" data-screenshot-viewer-image />
        </div>
        <div class="screenshot-viewer-meta">
          <span data-screenshot-viewer-date></span>
          <p data-screenshot-viewer-caption></p>
        </div>
      </div>
    `;
    document.body.append(root);

    screenshotViewer = {
        root,
        image: root.querySelector("[data-screenshot-viewer-image]"),
        date: root.querySelector("[data-screenshot-viewer-date]"),
        caption: root.querySelector("[data-screenshot-viewer-caption]"),
        download: root.querySelector("[data-screenshot-download]"),
        group: null,
        items: [],
        index: 0,
        zoom: 1,
        zoomOut: root.querySelector("[data-screenshot-zoom='-1']"),
        zoomLabel: root.querySelector("[data-screenshot-zoom-reset]")
    };

    root.addEventListener("click", (event) => {
        const close = event.target.closest("[data-screenshot-close]");
        const move = event.target.closest("[data-screenshot-move]");
        const zoom = event.target.closest("[data-screenshot-zoom]");
        const reset = event.target.closest("[data-screenshot-zoom-reset]");

        if (close) {
            closeScreenshotViewer();
        } else if (move) {
            moveScreenshotViewer(Number(move.dataset.screenshotMove) || 0);
        } else if (zoom) {
            zoomScreenshotViewer(Number(zoom.dataset.screenshotZoom) || 0);
        } else if (reset) {
            setScreenshotViewerZoom(1);
        }
    });

    return screenshotViewer;
}

function openScreenshotViewer(groupId, index) {
    const group = screenshotGroups.get(groupId);
    if (!group) {
        return;
    }

    const viewer = ensureScreenshotViewer();
    viewer.group = group;
    viewer.items = collectScreenshotViewerItems(group);
    viewer.index = viewer.items.findIndex((item) => item.groupId === group.id && item.groupIndex === index);
    if (viewer.index < 0) {
        viewer.index = 0;
    }
    viewer.root.classList.add("is-open");
    viewer.root.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-screenshot-viewer-open");
    setScreenshotViewerZoom(1);
    renderScreenshotViewer();
}

function closeScreenshotViewer() {
    if (!screenshotViewer) {
        return;
    }

    screenshotViewer.root.classList.remove("is-open");
    screenshotViewer.root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-screenshot-viewer-open");
}

function moveScreenshotViewer(step) {
    if (!screenshotViewer?.items || screenshotViewer.items.length < 2) {
        return;
    }

    screenshotViewer.index = (screenshotViewer.index + step + screenshotViewer.items.length) % screenshotViewer.items.length;
    setScreenshotViewerZoom(1);
    renderScreenshotViewer();
}

function zoomScreenshotViewer(step) {
    if (!screenshotViewer) {
        return;
    }

    setScreenshotViewerZoom(Math.min(4, Math.max(0.25, screenshotViewer.zoom + step * 0.25)));
}

function setScreenshotViewerZoom(value) {
    if (!screenshotViewer) {
        return;
    }

    screenshotViewer.zoom = Math.min(4, Math.max(0.25, value));
    screenshotViewer.image.style.transform = `scale(${screenshotViewer.zoom})`;
    screenshotViewer.zoomLabel?.replaceChildren(`${formatZoomLabel(screenshotViewer.zoom)}`);
    if (screenshotViewer.zoomOut) {
        screenshotViewer.zoomOut.disabled = screenshotViewer.zoom <= 0.25;
    }
}

function renderScreenshotViewer() {
    const viewer = screenshotViewer;
    const item = viewer.items[viewer.index];
    const caption = item.caption || item.groupCaption || "";
    const date = item.date || item.groupDate || "";

    viewer.image.classList.add("is-switching");
    window.setTimeout(() => {
        viewer.image.src = item.src;
        viewer.image.alt = item.alt || caption || "Скрин сборки";
        viewer.date.textContent = date;
        viewer.caption.textContent = caption;
        viewer.caption.hidden = !caption;
        viewer.date.hidden = !date;
        viewer.download.href = item.src;
        viewer.download.download = item.src.split(/[\\/]/).pop() || "screenshot.png";
        viewer.image.classList.remove("is-switching");
    }, 120);
}

function collectScreenshotViewerItems(activeGroup) {
    const activeBuildId = activeGroup.id.split("-screenshots-")[0];
    const groups = Array.from(screenshotGroups.values()).filter((group) => group.id.startsWith(`${activeBuildId}-screenshots-`));
    return groups.flatMap((group) => {
        return group.items.map((item, groupIndex) => ({
            ...item,
            groupId: group.id,
            groupIndex,
            groupCaption: group.caption,
            groupDate: group.date
        }));
    });
}

function formatZoomLabel(value) {
    return Number.isInteger(value) ? `${value}x` : `${value.toFixed(1)}x`;
}

function initAnimatedDetails() {
    const detailsItems = Array.from(document.querySelectorAll("details"));
    const canAnimate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const details of detailsItems) {
        const summary = details.querySelector(":scope > summary");
        const content = details.querySelector(":scope > .details-content");
        if (!summary || !content) {
            continue;
        }

        details.classList.toggle("is-expanded", details.open);

        if (!canAnimate) {
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
        details.classList.add("is-expanded");
        details.open = true;
        content.style.display = "block";
        content.style.height = "0px";
        content.style.opacity = "0";
        content.offsetHeight;
        content.style.transition = "height 240ms ease, opacity 180ms ease";
        content.style.height = `${content.scrollHeight}px`;
        content.style.opacity = "1";
    } else {
        details.classList.remove("is-expanded");
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
        } else {
            details.classList.add("is-expanded");
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
      ${renderArchiveTitle(latest, build)}
      <div class="download-actions">
        <a class="download-link download-link--primary" href="${escapeAttr(latest.url)}">/скачать_новейшую</a>
        <a class="download-link download-link--ghost" href="#${escapeAttr(updateElementId(build, latest))}" data-update-link>/чё_обновилось</a>
        <span class="muted">${formatBytes(latest.size)}</span>
      </div>
      <p class="muted">${formatMoscowDateTime(latest.createdAt)}</p>
    </div>
  `;

    refs.oldVersions.innerHTML = older.length
        ? older.map((file) => renderVersionItem(build, file)).join("")
        : `<div class="version-item muted">Старых версий пока нет.</div>`;

    renderGeneratedVersions(build, files, refs);
    renderLucideIcons();
}

function renderVersionItem(build, file) {
    return `
    <article class="version-item">
      ${renderArchiveTitle(file, build)}
      <div class="version-meta">
        <span class="tag">${formatMoscowDateTime(file.createdAt)}</span>
        <span class="tag">${formatBytes(file.size)}</span>
      </div>
      <div class="download-actions">
        <a class="download-link download-link--primary" href="${escapeAttr(file.url)}">/скачать</a>
        <a class="download-link download-link--ghost" href="#${escapeAttr(updateElementId(build, file))}" data-update-link>/чё_обновилось</a>
      </div>
    </article>
  `;
}

function renderArchiveTitle(file, build) {
    const requirementClass = file.required ? "requirement-icon--required" : "requirement-icon--optional";
    const kindClass = file.kind === "addition" ? "archive-kind--addition" : "archive-kind--version";
    const mark = file.required ? "!" : "*";
    const displayName = cleanArchiveDisplayName(file.displayName || file.fileName);
    const title = build ? `<a class="archive-name" href="#${escapeAttr(updateElementId(build, file))}" data-update-link>${escapeHtml(displayName)}</a>` : `<strong>${escapeHtml(displayName)}</strong>`;

    return `
    <div class="archive-title">
      <span class="requirement-icon ${requirementClass}" title="${escapeAttr(file.requiredLabel)}">${mark}</span>
      ${title}
      <span class="archive-kind ${kindClass}">${escapeHtml(file.kindLabel)}</span>
    </div>
  `;
}

function renderGeneratedVersions(build, files, refs) {
    const packs = createGeneratedVersionPackages(build, files);

    refs.generatedVersions.innerHTML = packs.length
        ? packs.map((pack) => renderGeneratedVersionItem(pack)).join("")
        : `<div class="version-item muted">Недостаточно архивов для автосборки.</div>`;
}

function createGeneratedVersionPackages(build, files) {
    const latestRequiredVersion = files.find((file) => file.kind === "version" && file.required);
    const latestVersion = files.find((file) => file.kind === "version");
    const packs = [];

    if (latestRequiredVersion) {
        packs.push(createGeneratedVersionPackage(build, latestRequiredVersion, files, {
            type: "incomplete",
            label: "неполная",
            includeOptionalAdditions: false
        }));
    }

    if (latestVersion) {
        packs.push(createGeneratedVersionPackage(build, latestVersion, files, {
            type: "full",
            label: "полная",
            includeOptionalAdditions: true
        }));
    }

    return packs.filter(Boolean);
}

function createGeneratedVersionPackage(build, baseVersion, files, options) {
    const additions = files
        .filter((file) => file.kind === "addition")
        .filter((file) => options.includeOptionalAdditions || file.required)
        .filter((file) => compareBuildVersions(file.buildVersion, baseVersion.buildVersion) >= 0)
        .sort(compareArchivesOldestFirst);
    const sources = [baseVersion, ...additions];
    const id = `${build.id}-${options.type}-${baseVersion.buildVersion}`;
    const fileName = `${build.assetName}-${baseVersion.mcVersion}-${baseVersion.buildVersion}+auto+${options.type}.zip`;
    const pack = {
        id,
        build,
        baseVersion,
        fileName,
        label: options.label,
        sources,
        size: sources.reduce((total, file) => total + (Number(file.size) || 0), 0),
        createdAt: sources[0]?.createdAt
    };

    generatedVersionPackages.set(id, pack);
    return pack;
}

function renderGeneratedVersionItem(pack) {
    const displayName = cleanArchiveDisplayName(pack.fileName);
    return `
    <article class="version-item">
      <div class="archive-title">
        <span class="generated-archive-mark" aria-hidden="true"></span>
        <strong>${escapeHtml(displayName)}</strong>
        <span class="generated-kind generated-kind--${escapeAttr(pack.label === "полная" ? "full" : "incomplete")}">${escapeHtml(pack.label)}</span>
      </div>
      <div class="version-meta">
        <span class="tag">${formatMoscowDateTime(pack.createdAt)}</span>
        <span class="tag">${formatBytes(pack.size)}</span>
        <span class="tag">${pack.sources.length} арх.</span>
      </div>
      <div class="download-actions">
        <a class="download-link download-link--primary" href="#" data-generated-version-id="${escapeAttr(pack.id)}">/скачать</a>
      </div>
    </article>
  `;
}

async function downloadGeneratedVersion(pack, link) {
    const originalText = link.textContent;
    link.textContent = "/собираю";
    link.setAttribute("aria-busy", "true");

    try {
        const JSZip = await loadJsZip();
        const outputZip = new JSZip();

        for (const source of pack.sources) {
            await appendArchiveToZip(outputZip, source, JSZip);
        }

        const blob = await outputZip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {level: 6}
        });
        triggerBlobDownload(blob, pack.fileName);
    } catch (error) {
        console.warn(error);
        window.alert("Не получилось собрать версию. Попробуй скачать архивы вручную.");
    } finally {
        link.textContent = originalText;
        link.removeAttribute("aria-busy");
    }
}

async function loadJsZip() {
    jsZipImportPromise ||= import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
    const module = await jsZipImportPromise;
    return module.default;
}

async function appendArchiveToZip(outputZip, source, JSZip) {
    const response = await fetch(source.url);
    if (!response.ok) {
        throw new Error(`Archive ${source.fileName} ${response.status}`);
    }

    const inputZip = await JSZip.loadAsync(await response.arrayBuffer());
    const writes = [];
    inputZip.forEach((path, entry) => {
        if (entry.dir) {
            outputZip.folder(path);
            return;
        }

        writes.push(entry.async("uint8array").then((content) => {
            outputZip.file(path, content, {date: entry.date});
        }));
    });

    await Promise.all(writes);
}

function triggerBlobDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function compareArchivesOldestFirst(a, b) {
    const version = compareBuildVersions(a.buildVersion, b.buildVersion);
    if (version !== 0) {
        return version;
    }

    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
}

function compareBuildVersions(a, b) {
    const left = tokenizeBuildVersion(a);
    const right = tokenizeBuildVersion(b);
    const total = Math.max(left.length, right.length);

    for (let index = 0; index < total; index += 1) {
        const l = left[index] ?? 0;
        const r = right[index] ?? 0;
        if (l === r) {
            continue;
        }

        if (typeof l === "number" && typeof r === "number") {
            return l - r;
        }

        return String(l).localeCompare(String(r), "en", {numeric: true});
    }

    return 0;
}

function tokenizeBuildVersion(version) {
    return String(version)
        .split(/[._-]/)
        .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
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
            const release = splitReleaseTitle(file.releaseName, file.buildVersion);
            return `
        <article class="update-item" id="${escapeAttr(updateElementId(build, file))}">
          <div class="update-heading">
            <strong>${escapeHtml(release.title)}</strong>
            <span class="release-version">${escapeHtml(release.version)}</span>
          </div>
          <div class="update-body markdown-body">${renderMarkdown(body)}</div>
        </article>
      `;
        })
        .join("");
}


function splitReleaseTitle(name, fallbackVersion) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1];
    const hasVersionSuffix = last && /^(?:v)?\d+(?:[._-]\d+)*(?:[a-z][\w.-]*)?$/i.test(last);
    const titleParts = hasVersionSuffix ? parts.slice(0, -1) : parts;
    const version = hasVersionSuffix ? last.replace(/^v/i, "v") : `v${fallbackVersion}`;

    return {
        title: titleParts.join(" ") || "Релиз",
        version
    };
}

function updateElementId(build, file) {
    return `update-${build.id}-${slugify(file.buildVersion)}-${slugify(file.kind)}`;
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/giu, "-")
        .replace(/^-+|-+$/g, "") || "release";
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
    refs.generatedVersions.innerHTML = `<div class="version-item muted">Автосборка пока недоступна.</div>`;
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
