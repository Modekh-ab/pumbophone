export async function startHead(canvas) {
    const gl = canvas.getContext("webgl", {alpha: true, antialias: false});
    if (!gl) {
        return;
    }

    const hoverTarget = canvas.closest("a") || canvas;
    let isPaused = false;
    let rotation = Math.PI;
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

    const scene = await createGlbScene(gl, "resources/models/head.glb");
    if (!scene) {
        return;
    }

    function tick(time) {
        const delta = lastTime ? time - lastTime : 16;
        lastTime = time;
        if (!isPaused) {
            rotation += delta * 0.00055;
        }

        drawGlbScene(canvas, gl, scene, {
            view: mat4Translate(0, -0.08, -3.2),
            model: mat4Multiply(mat4RotateX(-0.16), mat4RotateY(rotation)),
            fov: Math.PI / 4
        });
        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

export async function startPlayer(canvas, initialSkin) {
    const gl = canvas.getContext("webgl", {alpha: true, antialias: false});
    if (!gl) {
        return;
    }

    let scene = null;
    let loadToken = 0;
    let targetYaw = 0;
    let targetPitch = 0;
    let yaw = 0;
    let pitch = 0;

    const loadSkin = async (url) => {
        const token = ++loadToken;
        const nextScene = await createGlbScene(gl, url);
        if (token !== loadToken || !nextScene) {
            return;
        }
        scene = nextScene;
    };

    await loadSkin(initialSkin);

    window.addEventListener("pointermove", (event) => {
        const rect = canvas.getBoundingClientRect();
        const centerX = rect.left + rect.width * 0.5;
        const centerY = rect.top + rect.height * 0.43;
        const trackingRect = canvas.closest(".inventory-window")?.getBoundingClientRect() || rect;
        const x = (event.clientX - centerX) / Math.max(trackingRect.width * 0.9, 1);
        const y = (event.clientY - centerY) / Math.max(trackingRect.height * 0.9, 1);
        targetYaw = clamp(x, -1, 1) * 0.8;
        targetPitch = clamp(y, -1, 1) * -0.5;
    });

    function tick(time) {
        yaw += (targetYaw - yaw) * 0.28;
        pitch += (targetPitch - pitch) * 0.28;
        const idle = Math.sin(time * 0.0018) * 0.012;
        const bodyYaw = yaw * 0.68;
        const bodyPitch = pitch * -0.3;
        const model = mat4Multiply(mat4RotateX(bodyPitch), mat4RotateY(Math.PI + bodyYaw));
        const head = mat4Multiply(mat4RotateX(pitch), mat4RotateY(yaw + idle));

        if (scene) {
            drawGlbScene(canvas, gl, scene, {
                view: mat4Translate(0, -0.02, -4.45),
                model,
                head,
                fov: Math.PI / 5
            });
        }
        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    return loadSkin;
}

async function createGlbScene(gl, url) {
    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    const locations = {
        position: gl.getAttribLocation(program, "aPosition"),
        normal: gl.getAttribLocation(program, "aNormal"),
        uv: gl.getAttribLocation(program, "aUv"),
        headWeight: gl.getAttribLocation(program, "aHeadWeight"),
        mvp: gl.getUniformLocation(program, "uMvp"),
        model: gl.getUniformLocation(program, "uModel"),
        head: gl.getUniformLocation(program, "uHead"),
        headCenter: gl.getUniformLocation(program, "uHeadCenter"),
        texture: gl.getUniformLocation(program, "uTexture")
    };

    let model;
    try {
        model = await loadGlbModel(url, gl);
    } catch (error) {
        console.warn(error);
        return null;
    }

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    return {
        program,
        locations,
        model,
        vertexBuffer,
        indexBuffer
    };
}

function drawGlbScene(canvas, gl, scene, options) {
    resizeGlCanvas(canvas, gl);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(scene.program);

    const aspect = canvas.width / canvas.height;
    const projection = mat4Perspective(options.fov, aspect, 0.1, 100);
    const mvp = mat4Multiply(projection, mat4Multiply(options.view, options.model));
    const head = options.head || mat4Identity();

    gl.uniformMatrix4fv(scene.locations.mvp, false, mvp);
    gl.uniformMatrix4fv(scene.locations.model, false, options.model);
    gl.uniformMatrix4fv(scene.locations.head, false, head);
    gl.uniform3fv(scene.locations.headCenter, scene.model.headCenter);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.model.texture);
    gl.uniform1i(scene.locations.texture, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, scene.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, scene.indexBuffer);
    gl.enableVertexAttribArray(scene.locations.position);
    gl.enableVertexAttribArray(scene.locations.normal);
    gl.enableVertexAttribArray(scene.locations.uv);
    gl.enableVertexAttribArray(scene.locations.headWeight);
    gl.vertexAttribPointer(scene.locations.position, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(scene.locations.normal, 3, gl.FLOAT, false, 36, 12);
    gl.vertexAttribPointer(scene.locations.uv, 2, gl.FLOAT, false, 36, 24);
    gl.vertexAttribPointer(scene.locations.headWeight, 1, gl.FLOAT, false, 36, 32);
    gl.drawElements(gl.TRIANGLES, scene.model.indices.length, gl.UNSIGNED_SHORT, 0);
}

function resizeGlCanvas(canvas, gl) {
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

async function loadGlbModel(url, gl) {
    const response = await fetch(pageUrl(url));
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
    const headMin = [Infinity, Infinity, Infinity];
    const headMax = [-Infinity, -Infinity, -Infinity];
    const sceneNodes = json.scenes?.[json.scene || 0]?.nodes || [];

    const walk = (nodeIndex, parentMatrix, isHeadPart = false) => {
        const node = json.nodes[nodeIndex];
        const local = nodeMatrix(node);
        const world = mat4Multiply(parentMatrix, local);
        const nodeName = String(node.name || "").toLowerCase();
        const nextIsHeadPart = isHeadPart || nodeName.includes("head") || nodeName.includes("hat");

        if (Number.isInteger(node.mesh)) {
            for (const primitive of json.meshes[node.mesh].primitives) {
                appendPrimitive(json, bin, primitive, world, vertices, indices, min, max, headMin, headMax, nextIsHeadPart);
            }
        }

        for (const child of node.children || []) {
            walk(child, world, nextIsHeadPart);
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

    const hasHeadBounds = headMin.every(Number.isFinite) && headMax.every(Number.isFinite);
    const headCenter = hasHeadBounds
        ? [
            (headMin[0] + headMax[0]) / 2,
            (headMin[1] + headMax[1]) / 2,
            (headMin[2] + headMax[2]) / 2
        ]
        : center;

    for (let index = 0; index < vertices.length; index += 9) {
        vertices[index] = (vertices[index] - center[0]) * scale;
        vertices[index + 1] = (vertices[index + 1] - center[1]) * scale;
        vertices[index + 2] = (vertices[index + 2] - center[2]) * scale;
    }

    return {
        vertices: new Float32Array(vertices),
        indices: new Uint16Array(indices),
        headCenter: new Float32Array([
            (headCenter[0] - center[0]) * scale,
            (headCenter[1] - center[1]) * scale,
            (headCenter[2] - center[2]) * scale
        ]),
        texture: await createGlTexture(gl, json, bin)
    };
}

function appendPrimitive(json, bin, primitive, world, vertices, indices, min, max, headMin, headMax, isHeadPart) {
    const positions = readAccessor(json, bin, primitive.attributes.POSITION);
    const normals = readAccessor(json, bin, primitive.attributes.NORMAL);
    const uvs = readAccessor(json, bin, primitive.attributes.TEXCOORD_0);
    const primitiveIndices = readAccessor(json, bin, primitive.indices);
    const vertexBase = vertices.length / 9;

    for (let index = 0; index < positions.length / 3; index += 1) {
        const position = transformPoint(world, positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
        const normal = normalizeVec3(transformVector(world, normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]));
        min[0] = Math.min(min[0], position[0]);
        min[1] = Math.min(min[1], position[1]);
        min[2] = Math.min(min[2], position[2]);
        max[0] = Math.max(max[0], position[0]);
        max[1] = Math.max(max[1], position[1]);
        max[2] = Math.max(max[2], position[2]);
        if (isHeadPart) {
            headMin[0] = Math.min(headMin[0], position[0]);
            headMin[1] = Math.min(headMin[1], position[1]);
            headMin[2] = Math.min(headMin[2], position[2]);
            headMax[0] = Math.max(headMax[0], position[0]);
            headMax[1] = Math.max(headMax[1], position[1]);
            headMax[2] = Math.max(headMax[2], position[2]);
        }
        vertices.push(position[0], position[1], position[2], normal[0], normal[1], normal[2], uvs[index * 2], uvs[index * 2 + 1], isHeadPart ? 1 : 0);
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
    return {5121: 1, 5123: 2, 5125: 4, 5126: 4}[componentType];
}

function accessorTypeSize(type) {
    return {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16}[type];
}

function pageUrl(url) {
    return new URL(url, window.location.href).href;
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

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

const vertexShaderSource = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  attribute vec2 aUv;
  attribute float aHeadWeight;
  uniform mat4 uMvp;
  uniform mat4 uModel;
  uniform mat4 uHead;
  uniform vec3 uHeadCenter;
  varying vec2 vUv;
  varying float vLight;

  void main() {
    vec3 headPosition = (uHead * vec4(aPosition - uHeadCenter, 1.0)).xyz + uHeadCenter;
    vec3 position = mix(aPosition, headPosition, aHeadWeight);
    vec3 headNormal = (uHead * vec4(aNormal, 0.0)).xyz;
    vec3 modelNormal = mix(aNormal, headNormal, aHeadWeight);
    vec3 normal = normalize((uModel * vec4(modelNormal, 0.0)).xyz);
    vec3 light = normalize(vec3(0.35, 0.75, 0.58));
    vLight = 0.62 + max(dot(normal, light), 0.0) * 0.58;
    vUv = aUv;
    gl_Position = uMvp * vec4(position, 1.0);
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

