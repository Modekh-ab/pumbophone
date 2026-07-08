import { readFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const BUILD_ROOT_NAMES = new Set([
    "config",
    "defaultconfigs",
    "journeymap",
    "kubejs",
    "mods",
    "resourcepacks",
    "resources",
    "saves",
    "scripts",
    "shaderpacks"
]);

if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
}

const [owner, repo] = repository.split("/");
const assetNames = await readBuildAssetNames();
const releases = await githubJson(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`);

for (const assetName of assetNames) {
    const files = collectBuildArchives(releases, assetName).sort(compareArchives);
    if (!files.length) {
        continue;
    }

    const latestRequiredVersion = files.find((file) => file.kind === "version" && file.required);
    const latestVersion = files.find((file) => file.kind === "version");
    const packs = [
        latestRequiredVersion && createGeneratedPack(assetName, latestRequiredVersion, files, "incomplete", false),
        latestVersion && createGeneratedPack(assetName, latestVersion, files, "full", true)
    ].filter(Boolean);

    for (const pack of packs) {
        await uploadGeneratedPack(pack);
    }
}

async function readBuildAssetNames() {
    const source = await readFile("scripts/data/builds.js", "utf8");
    return [...source.matchAll(/assetName:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function collectBuildArchives(sourceReleases, assetName) {
    return sourceReleases.flatMap((release) => {
        return (release.assets || [])
            .map((asset) => parseArchive(asset, release))
            .filter(Boolean)
            .filter((archive) => normalizeName(archive.name) === normalizeName(assetName))
            .filter((archive) => !archive.generatedType);
    });
}

function parseArchive(asset, release) {
    const match = asset.name.match(/^(.+)-(\d+(?:\.\d+){1,3})-([^+]+?)(?:\+(.+))?\.zip$/iu);
    if (!match) {
        return null;
    }

    const flags = parseArchiveFlags(match[4]);
    return {
        fileName: asset.name,
        name: match[1],
        mcVersion: match[2],
        buildVersion: match[3],
        kind: flags.kind,
        required: flags.required,
        generatedType: flags.generatedType,
        size: asset.size,
        apiUrl: asset.url,
        createdAt: asset.created_at || release.published_at,
        releaseId: release.id
    };
}

function parseArchiveFlags(value = "") {
    const tokens = new Set(String(value).split(/[+_-]/).map(normalizeMetaToken).filter(Boolean));
    const isAddition = hasAny(tokens, ["addon", "add", "addition", "update", "patch", "hotfix", "dop", "dopolnenie"]);
    const isVersion = hasAny(tokens, ["version", "full", "build", "release"]);
    const hasRequired = hasAny(tokens, ["required", "req", "mandatory", "must", "obyazatelno"]);
    const hasOptional = hasAny(tokens, ["optional", "opt", "notrequired", "neobyazatelno"]);
    const generatedType = hasAny(tokens, ["auto", "generated"])
        ? hasAny(tokens, ["incomplete", "lite", "requiredonly"]) ? "incomplete" : "full"
        : "";
    const kind = isAddition && !isVersion ? "addition" : "version";

    return {
        kind,
        required: hasOptional ? false : hasRequired ? true : kind === "version",
        generatedType
    };
}

function createGeneratedPack(assetName, baseVersion, files, type, includeOptionalAdditions) {
    const additions = files
        .filter((file) => file.kind === "addition")
        .filter((file) => includeOptionalAdditions || file.required)
        .filter((file) => compareBuildVersions(file.buildVersion, baseVersion.buildVersion) >= 0)
        .sort(compareArchivesOldestFirst);
    const sources = [baseVersion, ...additions];
    const latestVersionSource = sources.slice().sort(compareArchives)[0];
    const latestPublishedSource = sources
        .slice()
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

    return {
        type,
        assetName,
        mcVersion: baseVersion.mcVersion,
        buildVersion: latestVersionSource.buildVersion,
        fileName: `${assetName}-${baseVersion.mcVersion}-${latestVersionSource.buildVersion}+auto+${type}.zip`,
        sources,
        targetReleaseId: latestPublishedSource.releaseId
    };
}

async function uploadGeneratedPack(pack) {
    const targetRelease = releases.find((release) => release.id === pack.targetReleaseId);
    if (!targetRelease) {
        throw new Error(`Target release ${pack.targetReleaseId} was not found.`);
    }

    for (const release of releases) {
        for (const asset of release.assets || []) {
            const archive = parseArchive(asset, release);
            const isPreviousGeneratedPack = archive &&
                normalizeName(archive.name) === normalizeName(pack.assetName) &&
                archive.mcVersion === pack.mcVersion &&
                archive.generatedType === pack.type;

            if (asset.name === pack.fileName || isPreviousGeneratedPack) {
                await githubFetch(asset.url, {method: "DELETE"});
            }
        }
    }

    const entriesByPath = new Map();
    let targetRootFolder = "";
    for (const [sourceIndex, source] of pack.sources.entries()) {
        const buffer = await downloadAsset(source);
        const archive = parseZipArchive(buffer, source);
        if (sourceIndex === 0) {
            targetRootFolder = findSingleRootFolder(archive.entries);
        }
        for (const entry of archive.entries) {
            const normalizedEntry = targetRootFolder
                ? moveEntryToRootFolder(entry, targetRootFolder)
                : entry;
            entriesByPath.set(normalizedEntry.path, normalizedEntry);
        }
    }

    const zip = buildZipBuffer([...entriesByPath.values()]);
    const uploadUrl = targetRelease.upload_url.replace("{?name,label}", `?name=${encodeURIComponent(pack.fileName)}`);
    await githubFetch(uploadUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/zip",
            "Content-Length": String(zip.byteLength)
        },
        body: zip
    });

    console.log(`Uploaded ${pack.fileName} from ${pack.sources.length} archive(s).`);
}

async function downloadAsset(source) {
    const response = await githubFetch(source.apiUrl, {
        headers: {Accept: "application/octet-stream"}
    });
    return response.arrayBuffer();
}

async function githubJson(url) {
    const response = await githubFetch(url);
    return response.json();
}

async function githubFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            ...options.headers
        }
    });

    if (!response.ok) {
        throw new Error(`${options.method || "GET"} ${url} failed: ${response.status} ${await response.text()}`);
    }

    return response;
}

function parseZipArchive(buffer, source) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const eocdOffset = findEndOfCentralDirectory(view);
    const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    const entryCount = view.getUint16(eocdOffset + 10, true);
    const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
    const localOffsets = [];
    const centralRecords = [];
    let offset = centralDirectoryOffset;

    if (centralDirectoryEnd > bytes.length) {
        throw new Error(`Archive ${source.fileName} central directory is outside file bounds.`);
    }

    for (let index = 0; index < entryCount; index += 1) {
        if (view.getUint32(offset, true) !== 0x02014b50) {
            throw new Error(`Archive ${source.fileName} has an invalid central directory.`);
        }

        const flags = view.getUint16(offset + 8, true);
        const fileNameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        const recordLength = 46 + fileNameLength + extraLength + commentLength;
        const pathBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
        const path = decodeZipPath(pathBytes, flags);
        const centralRecord = bytes.slice(offset, offset + recordLength);

        localOffsets.push(localOffset);
        centralRecords.push({path, localOffset, centralRecord});
        offset += recordLength;
    }

    const sortedLocalOffsets = [...localOffsets].sort((a, b) => a - b);
    return {
        entries: centralRecords.map((record) => {
            const localIndex = sortedLocalOffsets.indexOf(record.localOffset);
            const nextOffset = sortedLocalOffsets[localIndex + 1] ?? centralDirectoryOffset;
            return {
                path: record.path,
                localSegment: bytes.slice(record.localOffset, nextOffset),
                centralRecord: record.centralRecord
            };
        })
    };
}

function findEndOfCentralDirectory(view) {
    const minOffset = Math.max(0, view.byteLength - 0xffff - 22);
    for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            return offset;
        }
    }

    throw new Error("ZIP end of central directory was not found.");
}

function decodeZipPath(bytes, flags) {
    if (flags & 0x0800) {
        return new TextDecoder("utf-8").decode(bytes);
    }

    return [...bytes].map((byte) => String.fromCharCode(byte)).join("");
}

function encodeZipPath(path) {
    return new TextEncoder().encode(path);
}

function findSingleRootFolder(entries) {
    const filePaths = entries
        .map((entry) => normalizeZipPath(entry.path))
        .filter((path) => path && !path.endsWith("/"));
    if (!filePaths.length) {
        return "";
    }

    let rootFolder = "";
    for (const path of filePaths) {
        const slashIndex = path.indexOf("/");
        if (slashIndex <= 0) {
            return "";
        }

        const folder = path.slice(0, slashIndex);
        if (!rootFolder) {
            rootFolder = folder;
        } else if (folder !== rootFolder) {
            return "";
        }
    }

    return BUILD_ROOT_NAMES.has(rootFolder.toLowerCase()) ? "" : rootFolder;
}

function moveEntryToRootFolder(entry, targetRootFolder) {
    const path = normalizeZipPath(entry.path);
    if (!path || isPathInRootFolder(path, targetRootFolder)) {
        return entry;
    }

    const targetPath = path
        ? `${targetRootFolder}/${path}`
        : `${targetRootFolder}/`;

    return replaceZipEntryPath(entry, targetPath);
}

function normalizeZipPath(path) {
    return String(path).replace(/\\/g, "/").replace(/^\/+/, "");
}

function isPathInRootFolder(path, rootFolder) {
    return path === `${rootFolder}/` || path.startsWith(`${rootFolder}/`);
}

function replaceZipEntryPath(entry, path) {
    const encodedPath = encodeZipPath(path);
    const localHeader = entry.localSegment;
    const localNameLength = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength).getUint16(26, true);
    const localExtraLength = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength).getUint16(28, true);
    const localRestOffset = 30 + localNameLength + localExtraLength;
    const localSegment = new Uint8Array(30 + encodedPath.length + localExtraLength + (localHeader.length - localRestOffset));
    const localView = new DataView(localSegment.buffer);

    localSegment.set(localHeader.slice(0, 30), 0);
    localView.setUint16(6, localView.getUint16(6, true) | 0x0800, true);
    localView.setUint16(26, encodedPath.length, true);
    localSegment.set(encodedPath, 30);
    localSegment.set(localHeader.slice(30 + localNameLength, localRestOffset), 30 + encodedPath.length);
    localSegment.set(localHeader.slice(localRestOffset), 30 + encodedPath.length + localExtraLength);

    const centralRecord = entry.centralRecord;
    const centralNameLength = new DataView(centralRecord.buffer, centralRecord.byteOffset, centralRecord.byteLength).getUint16(28, true);
    const centralExtraLength = new DataView(centralRecord.buffer, centralRecord.byteOffset, centralRecord.byteLength).getUint16(30, true);
    const centralCommentLength = new DataView(centralRecord.buffer, centralRecord.byteOffset, centralRecord.byteLength).getUint16(32, true);
    const centralRestOffset = 46 + centralNameLength + centralExtraLength + centralCommentLength;
    const nextCentralRecord = new Uint8Array(46 + encodedPath.length + centralExtraLength + centralCommentLength);
    const centralView = new DataView(nextCentralRecord.buffer);

    nextCentralRecord.set(centralRecord.slice(0, 46), 0);
    centralView.setUint16(8, centralView.getUint16(8, true) | 0x0800, true);
    centralView.setUint16(28, encodedPath.length, true);
    nextCentralRecord.set(encodedPath, 46);
    nextCentralRecord.set(centralRecord.slice(46 + centralNameLength, centralRestOffset), 46 + encodedPath.length);

    return {
        ...entry,
        path,
        localSegment,
        centralRecord: nextCentralRecord
    };
}

function buildZipBuffer(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const centralRecord = entry.centralRecord.slice();
        new DataView(centralRecord.buffer).setUint32(42, offset, true);
        localParts.push(entry.localSegment);
        centralParts.push(centralRecord);
        offset += entry.localSegment.length;
    }

    const centralDirectoryOffset = offset;
    const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0);
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(8, entries.length, true);
    eocdView.setUint16(10, entries.length, true);
    eocdView.setUint32(12, centralDirectorySize, true);
    eocdView.setUint32(16, centralDirectoryOffset, true);

    return Buffer.concat([...localParts, ...centralParts, eocd].map((part) => Buffer.from(part)));
}

function compareArchives(a, b) {
    const version = compareBuildVersions(b.buildVersion, a.buildVersion);
    if (version !== 0) {
        return version;
    }

    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
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

function normalizeName(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");
}

function normalizeMetaToken(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-zа-яё0-9]/giu, "");
}

function hasAny(tokens, values) {
    return values.some((value) => tokens.has(value));
}
