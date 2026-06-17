const BUILD = {
  title: "ФАСТФУД",
  assetName: "Fastfood",
  mods: []
};

const els = {
  image: document.querySelector("#fastfoodImage"),
  gate: document.querySelector("#hungerGate"),
  peek: document.querySelector("#peekButton"),
  version: document.querySelector("#versionInfo"),
  mods: document.querySelector("#modsList"),
  latest: document.querySelector("#latestDownload"),
  oldVersions: document.querySelector("#oldVersions"),
  updates: document.querySelector("#updatesList")
};

els.peek?.addEventListener("click", () => {
  els.image.classList.remove("is-blurred");
  els.gate.classList.add("is-hidden");
});

renderMods();
loadReleases();
initAnimatedDetails();

function renderMods() {
  if (!BUILD.mods.length) {
    els.mods.innerHTML = `<li class="muted">Список модов пока не указан.</li>`;
    return;
  }

  els.mods.innerHTML = BUILD.mods
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
  if (isLocalPreview()) {
    await loadLocalReleases();
    return;
  }

  const repo = detectRepository();
  if (!repo) {
    renderEmptyReleaseState("Репозиторий не определён.");
    return;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=100`, {
      headers: { Accept: "application/vnd.github+json" }
    });

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}`);
    }

    const releases = await response.json();
    const files = collectBuildArchives(releases);

    if (!files.length) {
      renderEmptyReleaseState("Релизов для Фастфуда пока нет.");
      return;
    }

    files.sort(compareArchives);
    renderDownloads(files);
    renderUpdates(files);
  } catch (error) {
    renderEmptyReleaseState("GitHub Releases сейчас недоступны.");
    console.warn(error);
  }
}

function isLocalPreview() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function loadLocalReleases() {
  try {
    const response = await fetch("resources/local-releases/releases.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Local releases ${response.status}`);
    }

    const releases = await response.json();
    const files = collectBuildArchives(releases);
    if (!files.length) {
      renderEmptyReleaseState("Локальные тестовые архивы не найдены.");
      return;
    }

    files.sort(compareArchives);
    renderDownloads(files);
    renderUpdates(files);
  } catch (error) {
    renderEmptyReleaseState("Локальные тестовые релизы не найдены.");
    console.warn(error);
  }
}

function detectRepository() {
  const override = window.PUMBOPHONE_REPOSITORY;
  if (override?.owner && override?.repo) {
    return override;
  }

  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith(".github.io")) {
    return null;
  }

  const owner = host.replace(".github.io", "");
  const firstPathPart = window.location.pathname.split("/").filter(Boolean)[0];
  return {
    owner,
    repo: firstPathPart || `${owner}.github.io`
  };
}

function collectBuildArchives(releases) {
  return releases.flatMap((release) => {
    return (release.assets || [])
      .map((asset) => parseArchive(asset, release))
      .filter(Boolean)
      .filter((archive) => normalizeName(archive.name) === normalizeName(BUILD.assetName));
  });
}

function parseArchive(asset, release) {
  const match = asset.name.match(/^(.+)-(\d+(?:\.\d+){1,3})-([^+]+?)(?:\+(.+))?\.zip$/iu);
  if (!match) {
    return null;
  }

  const flags = applyArchiveFlagOverrides(parseArchiveFlags(match[4]), asset);

  return {
    fileName: asset.name,
    displayName: cleanArchiveDisplayName(asset.name),
    name: match[1],
    mcVersion: match[2],
    buildVersion: match[3],
    kind: flags.kind,
    kindLabel: flags.kindLabel,
    required: flags.required,
    requiredLabel: flags.requiredLabel,
    size: asset.size,
    downloads: asset.download_count,
    url: asset.browser_download_url,
    createdAt: asset.created_at || release.published_at,
    releaseName: release.name || release.tag_name || match[3],
    releaseBody: release.body || "",
    releaseUrl: release.html_url
  };
}

function applyArchiveFlagOverrides(flags, asset) {
  const kind = asset.kind === "addition" || asset.kind === "version" ? asset.kind : flags.kind;
  const required = typeof asset.required === "boolean" ? asset.required : flags.required;

  return {
    kind,
    kindLabel: kind === "addition" ? "дополнение" : "версия",
    required,
    requiredLabel: required ? "обязательно" : "необязательно"
  };
}

function parseArchiveFlags(value = "") {
  const rawTokens = String(value)
    .split(/[+_-]/)
    .map(normalizeMetaToken)
    .filter(Boolean);
  const tokens = new Set(rawTokens);

  const isAddition =
    hasAny(tokens, ["addon", "add", "addition", "update", "patch", "hotfix", "dop", "dopolnenie"]) ||
    hasAny(tokens, ["дополнение", "доп", "апдейт", "патч"]);
  const isVersion =
    hasAny(tokens, ["version", "full", "build", "release"]) ||
    hasAny(tokens, ["версия", "полная"]);
  const hasRequired = hasAny(tokens, ["required", "req", "mandatory", "must", "obyazatelno"]) || hasAny(tokens, ["обязательно", "обяз"]);
  const hasOptional = hasAny(tokens, ["optional", "opt", "notrequired", "neobyazatelno"]) || hasAny(tokens, ["необязательно", "опционально"]);

  const kind = isAddition && !isVersion ? "addition" : "version";
  const required = hasOptional ? false : hasRequired ? true : kind === "version";

  return {
    kind,
    kindLabel: kind === "addition" ? "дополнение" : "версия",
    required,
    requiredLabel: required ? "обязательно" : "необязательно"
  };
}

function normalizeMetaToken(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]/giu, "");
}

function hasAny(tokens, values) {
  return values.some((value) => tokens.has(value));
}

function compareArchives(a, b) {
  const version = compareVersionParts(b.buildVersion, a.buildVersion);
  if (version !== 0) {
    return version;
  }

  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function compareVersionParts(a, b) {
  const left = tokenizeVersion(a);
  const right = tokenizeVersion(b);
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

    return String(l).localeCompare(String(r), "en", { numeric: true });
  }

  return 0;
}

function tokenizeVersion(version) {
  return String(version)
    .split(/[._-]/)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
}

function renderDownloads(files) {
  const [latest, ...older] = files;

  els.version.innerHTML = `
    <span>Minecraft: Forge ${escapeHtml(latest.mcVersion)}</span>
    <span>Сборка: ${escapeHtml(latest.buildVersion)}</span>
  `;

  els.latest.innerHTML = `
    <div>
      ${renderArchiveTitle(latest)}
      <p>
        <a href="${escapeAttr(latest.url)}">/скачать_новейшую</a>
        <span class="muted"> ${formatBytes(latest.size)}</span>
      </p>
      <p class="muted">${formatMoscowDateTime(latest.createdAt)}</p>
    </div>
  `;

  els.oldVersions.innerHTML = older.length
    ? older.map(renderVersionItem).join("")
    : `<div class="version-item muted">Старых версий пока нет.</div>`;
}

function renderVersionItem(file) {
  return `
    <article class="version-item">
      ${renderArchiveTitle(file)}
      <div class="version-meta">
        <span class="tag">${formatMoscowDateTime(file.createdAt)}</span>
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

function renderUpdates(files) {
  els.updates.innerHTML = files
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

function renderEmptyReleaseState(message) {
  els.latest.innerHTML = `
    <div>
      <strong>${escapeHtml(message)}</strong>
    </div>
  `;
  els.oldVersions.innerHTML = `<div class="version-item muted">Старых версий пока нет.</div>`;
  els.updates.innerHTML = `<div class="update-item muted">Обнов пока нет.</div>`;
}

function startHeads() {
  const canvases = Array.from(document.querySelectorAll("[data-head-canvas]"));
  for (const canvas of canvases) {
    startHead(canvas);
  }
}

async function startHead(canvas) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false });
  if (!gl) {
    return;
  }

  const hoverTarget = canvas.closest("a") || canvas;
  let isPaused = false;
  let rotation = 0;
  let lastTime = 0;

  hoverTarget.addEventListener("pointerenter", () => {
    isPaused = true;
  });
  hoverTarget.addEventListener("pointerleave", () => {
    isPaused = false;
  });
  hoverTarget.addEventListener("focusin", () => {
    isPaused = true;
  });
  hoverTarget.addEventListener("focusout", () => {
    isPaused = false;
  });

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  const locations = {
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
    uv: gl.getAttribLocation(program, "aUv"),
    mvp: gl.getUniformLocation(program, "uMvp"),
    model: gl.getUniformLocation(program, "uModel"),
    texture: gl.getUniformLocation(program, "uTexture")
  };

  let model;
  try {
    model = await loadGlbModel("resources/models/head.glb", gl);
  } catch (error) {
    console.warn(error);
    return;
  }

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  }

  function tick(time) {
    const delta = lastTime ? time - lastTime : 16;
    lastTime = time;
    if (!isPaused) {
      rotation += delta * 0.00055;
    }

    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);

    const aspect = canvas.width / canvas.height;
    const projection = mat4Perspective(Math.PI / 4, aspect, 0.1, 100);
    const view = mat4Translate(0, -0.08, -3.2);
    const spin = mat4Multiply(mat4RotateX(-0.16), mat4RotateY(rotation));
    const mvp = mat4Multiply(projection, mat4Multiply(view, spin));

    gl.uniformMatrix4fv(locations.mvp, false, mvp);
    gl.uniformMatrix4fv(locations.model, false, spin);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, model.texture);
    gl.uniform1i(locations.texture, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.enableVertexAttribArray(locations.position);
    gl.enableVertexAttribArray(locations.normal);
    gl.enableVertexAttribArray(locations.uv);
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 32, 12);
    gl.vertexAttribPointer(locations.uv, 2, gl.FLOAT, false, 32, 24);
    gl.drawElements(gl.TRIANGLES, model.indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", resize);
  requestAnimationFrame(tick);
}

async function loadGlbModel(url, gl) {
  const response = await fetch(url);
  const bytes = await response.arrayBuffer();
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Файл модели не похож на GLB.");
  }

  let json = null;
  let bin = null;
  let offset = 12;
  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;

    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(bytes.slice(offset, offset + length)));
    }
    if (type === 0x004e4942) {
      bin = bytes.slice(offset, offset + length);
    }

    offset += length;
  }

  if (!json || !bin) {
    throw new Error("GLB не содержит JSON или BIN chunk.");
  }

  const vertices = [];
  const indices = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const sceneNodes = json.scenes?.[json.scene || 0]?.nodes || [];

  const walk = (nodeIndex, parentMatrix) => {
    const node = json.nodes[nodeIndex];
    const local = nodeMatrix(node);
    const world = mat4Multiply(parentMatrix, local);

    if (Number.isInteger(node.mesh)) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        appendPrimitive(json, bin, primitive, world, vertices, indices, min, max);
      }
    }

    for (const child of node.children || []) {
      walk(child, world);
    }
  };

  for (const nodeIndex of sceneNodes) {
    walk(nodeIndex, mat4Identity());
  }

  const center = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  ];
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.001);
  const scale = 1.95 / span;

  for (let index = 0; index < vertices.length; index += 8) {
    vertices[index] = (vertices[index] - center[0]) * scale;
    vertices[index + 1] = (vertices[index + 1] - center[1]) * scale;
    vertices[index + 2] = (vertices[index + 2] - center[2]) * scale;
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
    texture: await createGlTexture(gl, json, bin)
  };
}

function appendPrimitive(json, bin, primitive, world, vertices, indices, min, max) {
  const positions = readAccessor(json, bin, primitive.attributes.POSITION);
  const normals = readAccessor(json, bin, primitive.attributes.NORMAL);
  const uvs = readAccessor(json, bin, primitive.attributes.TEXCOORD_0);
  const primitiveIndices = readAccessor(json, bin, primitive.indices);
  const vertexBase = vertices.length / 8;

  for (let index = 0; index < positions.length / 3; index += 1) {
    const position = transformPoint(world, positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
    const normal = normalizeVec3(transformVector(world, normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]));
    min[0] = Math.min(min[0], position[0]);
    min[1] = Math.min(min[1], position[1]);
    min[2] = Math.min(min[2], position[2]);
    max[0] = Math.max(max[0], position[0]);
    max[1] = Math.max(max[1], position[1]);
    max[2] = Math.max(max[2], position[2]);
    vertices.push(position[0], position[1], position[2], normal[0], normal[1], normal[2], uvs[index * 2], uvs[index * 2 + 1]);
  }

  for (const primitiveIndex of primitiveIndices) {
    indices.push(vertexBase + primitiveIndex);
  }
}

function readAccessor(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const bufferView = json.bufferViews[accessor.bufferView];
  const componentSize = componentTypeSize(accessor.componentType);
  const componentCount = accessorTypeSize(accessor.type);
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = bufferView.byteStride || componentSize * componentCount;
  const dataView = new DataView(bin, byteOffset, bufferView.byteLength - (accessor.byteOffset || 0));
  const output = [];

  for (let item = 0; item < accessor.count; item += 1) {
    for (let component = 0; component < componentCount; component += 1) {
      output.push(readComponent(dataView, item * stride + component * componentSize, accessor.componentType));
    }
  }

  return output;
}

function readComponent(view, offset, componentType) {
  if (componentType === 5126) return view.getFloat32(offset, true);
  if (componentType === 5123) return view.getUint16(offset, true);
  if (componentType === 5125) return view.getUint32(offset, true);
  if (componentType === 5121) return view.getUint8(offset);
  throw new Error(`Unsupported component type: ${componentType}`);
}

function componentTypeSize(componentType) {
  return { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[componentType];
}

function accessorTypeSize(type) {
  return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
}

async function createGlTexture(gl, json, bin) {
  const image = json.images?.[0];
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  if (!image) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 244, 163, 255]));
    return texture;
  }

  const bufferView = json.bufferViews[image.bufferView];
  const blob = new Blob([bin.slice(bufferView.byteOffset || 0, (bufferView.byteOffset || 0) + bufferView.byteLength)], {
    type: image.mimeType || "image/png"
  });
  const bitmap = await createImageBitmap(blob);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  return texture;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function nodeMatrix(node) {
  let matrix = mat4Identity();
  if (node.matrix) {
    matrix = new Float32Array(node.matrix);
  }
  if (node.translation) {
    matrix = mat4Multiply(matrix, mat4Translate(node.translation[0], node.translation[1], node.translation[2]));
  }
  if (node.rotation) {
    matrix = mat4Multiply(matrix, mat4FromQuat(node.rotation));
  }
  if (node.scale) {
    matrix = mat4Multiply(matrix, mat4Scale(node.scale[0], node.scale[1], node.scale[2]));
  }
  return matrix;
}

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function mat4Translate(x, y, z) {
  const out = mat4Identity();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

function mat4Scale(x, y, z) {
  const out = mat4Identity();
  out[0] = x;
  out[5] = y;
  out[10] = z;
  return out;
}

function mat4RotateX(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function mat4RotateY(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function mat4FromQuat(q) {
  const [x, y, z, w] = q;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return new Float32Array([
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    0, 0, 0, 1
  ]);
}

function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function transformPoint(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ];
}

function transformVector(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z,
    matrix[1] * x + matrix[5] * y + matrix[9] * z,
    matrix[2] * x + matrix[6] * y + matrix[10] * z
  ];
}

function normalizeVec3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

const vertexShaderSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec2 aUv;
  uniform mat4 uMvp;
  uniform mat4 uModel;
  varying vec2 vUv;
  varying float vLight;

  void main() {
    vec3 normal = normalize((uModel * vec4(aNormal, 0.0)).xyz);
    vec3 light = normalize(vec3(0.35, 0.75, 0.58));
    vLight = 0.62 + max(dot(normal, light), 0.0) * 0.58;
    vUv = aUv;
    gl_Position = uMvp * vec4(aPosition, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  uniform sampler2D uTexture;
  varying vec2 vUv;
  varying float vLight;

  void main() {
    vec4 color = texture2D(uTexture, vUv);
    if (color.a < 0.05) {
      discard;
    }
    gl_FragColor = vec4(color.rgb * vLight, color.a);
  }
`;

startHeads();

function normalizeName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");
}

function formatMoscowDateTime(date) {
  if (!date) {
    return "без даты";
  }
  return `${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow"
  }).format(new Date(date))} МСК`;
}

function formatBytes(bytes = 0) {
  if (!bytes) {
    return "";
  }

  const units = ["Б", "КБ", "МБ", "ГБ"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function renderMarkdown(source) {
  const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += index < lines.length ? 1 : 0;
      const language = fence[1] ? ` data-lang="${escapeAttr(fence[1])}"` : "";
      html.push(`<pre${language}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isMarkdownBlockStart(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderInlineMarkdown(paragraph.join("\n"))}</p>`);
  }

  return html.join("");
}

function isMarkdownBlockStart(line) {
  return (
    /^```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^---+$/.test(line.trim())
  );
}

function renderInlineMarkdown(source) {
  const tokens = [];
  const saveToken = (html) => {
    const marker = `\uE000${tokens.length}\uE001`;
    tokens.push(html);
    return marker;
  };

  let text = String(source)
    .replace(/`([^`\n]+)`/g, (_match, code) => saveToken(`<code>${escapeHtml(code)}</code>`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, label, href) => {
      return saveToken(`<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer">${renderInlineMarkdown(label)}</a>`);
    });

  text = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${url}</a>`)
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([\s\S]+?)__/g, "<strong>$1</strong>")
    .replace(/~~([\s\S]+?)~~/g, "<del>$1</del>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");

  return text.replace(/\uE000(\d+)\uE001/g, (_match, tokenIndex) => tokens[Number(tokenIndex)] || "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
