const FACE_COUNT = 6;
const PANORAMA_SWAP_MS = 60000;
const PANORAMA_FADE_MS = 1800;
const PANORAMA_SPEEDS = [1, 2, 4, 8, 16];

const stages = [];
let animationFrame = 0;

export function initBuildPanoramas() {
    document.querySelectorAll("[data-panorama]").forEach((element) => {
        if (element.dataset.panoramaReady === "true") {
            return;
        }

        const paths = parsePaths(element.dataset.panoramaPaths);
        if (!paths.length) {
            return;
        }

        element.dataset.panoramaReady = "true";
        const stage = new PanoramaStage(element, paths);
        stages.push(stage);
    });

    if (stages.length && !animationFrame) {
        animationFrame = requestAnimationFrame(renderPanoramas);
    }
}

function parsePaths(value) {
    try {
        const paths = JSON.parse(value || "[]");
        return Array.isArray(paths) ? paths.filter(Boolean) : [];
    } catch (error) {
        console.warn(error);
        return [];
    }
}

function renderPanoramas(time) {
    for (const stage of stages) {
        stage.render(time);
    }
    animationFrame = requestAnimationFrame(renderPanoramas);
}

class PanoramaStage {
    constructor(root, paths) {
        this.root = root;
        this.interactionRoot = root.closest(".hero-media") || root;
        this.paths = paths;
        this.index = 0;
        this.layers = [];
        this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.isPaused = false;
        this.speedIndex = 0;
        this.speed = PANORAMA_SPEEDS[this.speedIndex];
        this.panoramaTime = 0;
        this.lastTickTime = 0;
        this.controls = {
            speed: this.interactionRoot.querySelector("[data-panorama-speed]"),
            next: this.interactionRoot.querySelector("[data-panorama-next]")
        };

        this.bindInteraction();
        this.bindControls();
        this.updateSpeedControl();
        if (this.controls.next && paths.length < 2) {
            this.controls.next.disabled = true;
        }

        this.show(paths[0], true);

        if (paths.length > 1 && !this.reducedMotion) {
            window.setInterval(() => this.next(), PANORAMA_SWAP_MS);
        }
    }

    next() {
        this.index = (this.index + 1) % this.paths.length;
        this.show(this.paths[this.index], false);
    }

    toggleSpeed() {
        this.speedIndex = (this.speedIndex + 1) % PANORAMA_SPEEDS.length;
        this.speed = PANORAMA_SPEEDS[this.speedIndex];
        this.updateSpeedControl();
    }

    updateSpeedControl() {
        if (this.controls.speed) {
            const isAccelerated = this.speed > 1;
            const label = `x${this.speed}`;
            this.controls.speed.setAttribute("aria-pressed", String(isAccelerated));
            this.controls.speed.setAttribute("aria-label", `Скорость панорамы ${label}`);
            this.controls.speed.classList.toggle("is-active", isAccelerated);
            this.controls.speed.querySelector("[data-panorama-speed-label]")?.replaceChildren(label);
        }
    }

    bindControls() {
        Object.values(this.controls).forEach((control) => {
            control?.addEventListener("pointerdown", (event) => {
                event.stopPropagation();
            });
        });

        this.controls.speed?.addEventListener("click", () => this.toggleSpeed());
        this.controls.next?.addEventListener("click", () => this.next());
    }

    bindInteraction() {
        this.interactionRoot.addEventListener("pointerdown", (event) => {
            if (event.target.closest(".panorama-controls")) {
                return;
            }
            if (this.isPaused) {
                return;
            }
            this.interactionRoot.setPointerCapture?.(event.pointerId);
            this.isPaused = true;
            this.interactionRoot.classList.add("is-panorama-pressed");
        });

        const resume = (event) => {
            if (!this.isPaused) {
                return;
            }
            this.isPaused = false;
            if (this.interactionRoot.hasPointerCapture?.(event.pointerId)) {
                this.interactionRoot.releasePointerCapture(event.pointerId);
            }
            this.interactionRoot.classList.remove("is-panorama-pressed");
        };

        this.interactionRoot.addEventListener("pointerup", resume);
        this.interactionRoot.addEventListener("pointercancel", resume);
        this.interactionRoot.addEventListener("lostpointercapture", resume);
    }

    async show(path, immediate) {
        const layer = new PanoramaLayer(path);
        this.layers.push(layer);
        this.root.append(layer.canvas);

        await layer.ready;
        requestAnimationFrame(() => {
            layer.canvas.classList.add("is-visible");
        });

        if (immediate) {
            return;
        }

        const stale = this.layers.filter((item) => item !== layer);
        stale.forEach((item) => item.canvas.classList.remove("is-visible"));
        window.setTimeout(() => {
            stale.forEach((item) => {
                item.dispose();
                item.canvas.remove();
            });
            this.layers = this.layers.filter((item) => item === layer);
        }, PANORAMA_FADE_MS);
    }

    render(time) {
        if (!this.lastTickTime) {
            this.lastTickTime = time;
        }
        if (!this.isPaused) {
            this.panoramaTime += (time - this.lastTickTime) * this.speed;
        }
        this.lastTickTime = time;

        for (const layer of this.layers) {
            layer.render(this.panoramaTime, this.reducedMotion);
        }
    }
}

class PanoramaLayer {
    constructor(path) {
        this.path = path;
        this.canvas = document.createElement("canvas");
        this.canvas.className = "panorama-canvas";
        this.gl = this.canvas.getContext("webgl", {
            alpha: true,
            antialias: false,
            depth: false,
            premultipliedAlpha: false
        });
        this.ready = this.gl ? this.init() : Promise.resolve();
    }

    async init() {
        const gl = this.gl;
        this.program = createProgram(gl);
        this.matrixLocation = gl.getUniformLocation(this.program, "uMatrix");
        this.textureLocation = gl.getUniformLocation(this.program, "uTexture");
        this.positionLocation = gl.getAttribLocation(this.program, "aPosition");
        this.uvLocation = gl.getAttribLocation(this.program, "aUv");
        this.faces = createFaces(gl);
        this.textures = await Promise.all(
            Array.from({length: FACE_COUNT}, (_value, index) => loadTexture(gl, `${this.path}/panorama_${index}.png`))
        );

        gl.useProgram(this.program);
        gl.uniform1i(this.textureLocation, 0);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
    }

    render(time, reducedMotion) {
        const gl = this.gl;
        if (!gl || !this.textures) {
            return;
        }

        resizeCanvas(this.canvas, gl);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);

        const aspect = this.canvas.width / Math.max(1, this.canvas.height);
        const yaw = reducedMotion ? 0.34 : time * 0.000035;
        const pitch = reducedMotion ? -0.08 : -0.08 + Math.sin(time * 0.00012) * 0.035;
        const matrix = multiplyMat4(perspectiveMat4(Math.PI / 2.12, aspect, 0.05, 8), viewMat4(yaw, pitch));
        gl.uniformMatrix4fv(this.matrixLocation, false, matrix);

        for (let index = 0; index < FACE_COUNT; index += 1) {
            const face = this.faces[index];
            gl.bindBuffer(gl.ARRAY_BUFFER, face.buffer);
            gl.enableVertexAttribArray(this.positionLocation);
            gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 20, 0);
            gl.enableVertexAttribArray(this.uvLocation);
            gl.vertexAttribPointer(this.uvLocation, 2, gl.FLOAT, false, 20, 12);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.textures[index]);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    }

    dispose() {
        if (!this.gl) {
            return;
        }
        this.textures?.forEach((texture) => this.gl.deleteTexture(texture));
        this.faces?.forEach((face) => this.gl.deleteBuffer(face.buffer));
        this.gl.deleteProgram(this.program);
    }
}

function createProgram(gl) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, `
        attribute vec3 aPosition;
        attribute vec2 aUv;
        uniform mat4 uMatrix;
        varying vec2 vUv;

        void main() {
            vUv = aUv;
            gl_Position = uMatrix * vec4(aPosition, 1.0);
        }
    `);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
        precision mediump float;
        uniform sampler2D uTexture;
        varying vec2 vUv;

        void main() {
            gl_FragColor = texture2D(uTexture, vUv);
        }
    `);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "Panorama program link failed");
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return program;
}

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || "Panorama shader compile failed");
    }
    return shader;
}

function createFaces(gl) {
    return [
        createFace(gl, [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]]),
        createFace(gl, [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]]),
        createFace(gl, [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]]),
        createFace(gl, [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]]),
        createFace(gl, [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]),
        createFace(gl, [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]])
    ];
}

function createFace(gl, corners) {
    const uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
    const order = [0, 1, 2, 0, 2, 3];
    const values = [];
    order.forEach((cornerIndex) => {
        values.push(...corners[cornerIndex], ...uvs[cornerIndex]);
    });
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
    return {buffer};
}

function loadTexture(gl, source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            resolve(texture);
        };
        image.onerror = () => reject(new Error(`Failed to load panorama face ${source}`));
        image.src = source;
    });
}

function resizeCanvas(canvas, gl) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
    }
}

function perspectiveMat4(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
    ]);
}

function viewMat4(yaw, pitch) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    return new Float32Array([
        cy, sy * sp, sy * cp, 0,
        0, cp, -sp, 0,
        -sy, cy * sp, cy * cp, 0,
        0, 0, 0, 1
    ]);
}

function multiplyMat4(a, b) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
        for (let row = 0; row < 4; row += 1) {
            out[column * 4 + row] =
                a[row] * b[column * 4] +
                a[4 + row] * b[column * 4 + 1] +
                a[8 + row] * b[column * 4 + 2] +
                a[12 + row] * b[column * 4 + 3];
        }
    }
    return out;
}
