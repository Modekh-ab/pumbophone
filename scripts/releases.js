import { normalizeName } from "./utils.js?v=split-23";

export async function fetchReleasePayload() {
    if (isLocalPreview()) {
        const response = await fetch(new URL("resources/local-releases/releases.json", window.location.href).href, {cache: "no-store"});
        if (!response.ok) {
            throw new Error(`Local releases ${response.status}`);
        }
        return response.json();
    }

    const repo = detectRepository();
    if (!repo) {
        throw new Error("Репозиторий не определён.");
    }

    const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=100`, {
        headers: {Accept: "application/vnd.github+json"}
    });

    if (!response.ok) {
        throw new Error(`GitHub API ${response.status}`);
    }

    return response.json();
}

function isLocalPreview() {
    return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
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

export function collectBuildArchives(releases, build) {
    return collectMatchingArchives(releases, build)
        .filter((archive) => !archive.generatedType);
}

export function collectGeneratedArchives(releases, build) {
    return collectMatchingArchives(releases, build)
        .filter((archive) => archive.generatedType);
}

function collectMatchingArchives(releases, build) {
    return releases.flatMap((release) => {
        return (release.assets || [])
            .map((asset) => parseArchive(asset, release))
            .filter(Boolean)
            .filter((archive) => normalizeName(archive.name) === normalizeName(build.assetName));
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
        generatedType: flags.generatedType,
        size: asset.size,
        downloads: asset.download_count,
        url: asset.browser_download_url,
        apiUrl: asset.url || "",
        createdAt: asset.created_at || release.published_at,
        releaseName: release.name || release.tag_name || match[3],
        releaseBody: release.body || "",
        releaseUrl: release.html_url
    };
}

function cleanArchiveDisplayName(fileName) {
    const value = String(fileName || "");
    const match = value.match(/^(.+?)(?:\+[^/\\]+)?(\.zip)$/i);
    return match ? `${match[1]}${match[2]}` : value.split("+")[0];
}

function applyArchiveFlagOverrides(flags, asset) {
    const kind = asset.kind === "addition" || asset.kind === "version" ? asset.kind : flags.kind;
    const required = typeof asset.required === "boolean" ? asset.required : flags.required;
    const generatedType = asset.generatedType || flags.generatedType;

    return {
        kind,
        kindLabel: kind === "addition" ? "дополнение" : "версия",
        required,
        requiredLabel: required ? "обязательно" : "необязательно",
        generatedType
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
    const hasRequired =
        hasAny(tokens, ["required", "req", "mandatory", "must", "obyazatelno"]) ||
        hasAny(tokens, ["обязательно", "обяз"]);
    const hasOptional =
        hasAny(tokens, ["optional", "opt", "notrequired", "neobyazatelno"]) ||
        hasAny(tokens, ["необязательно", "опционально"]);
    const generatedType = hasAny(tokens, ["auto", "generated"])
        ? hasAny(tokens, ["incomplete", "lite", "requiredonly"]) ? "incomplete" : "full"
        : "";

    const kind = isAddition && !isVersion ? "addition" : "version";
    const required = hasOptional ? false : hasRequired ? true : kind === "version";

    return {
        kind,
        kindLabel: kind === "addition" ? "дополнение" : "версия",
        required,
        requiredLabel: required ? "обязательно" : "необязательно",
        generatedType
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

export function compareArchives(a, b) {
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

        return String(l).localeCompare(String(r), "en", {numeric: true});
    }

    return 0;
}

function tokenizeVersion(version) {
    return String(version)
        .split(/[._-]/)
        .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
}
