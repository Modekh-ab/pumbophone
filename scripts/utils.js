export function normalizeName(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");
}

export function formatMoscowDateTime(date) {
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
    }).format(new Date(date))} мск`;
}

export function formatBytes(bytes = 0) {
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

export function renderMarkdown(source) {
    const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let index = 0;

    while (index < lines.length) {
        let line = lines[index];

        if (!line.trim()) {
            index += 1;
            continue;
        }

        line = line.replace(
            /<a\s+(?:name|id)=["']([^"']+)["']\s*><\/a>/i,
            (_, id) => `<span id="${escapeHtml(id)}"></span>`
        );

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
            const id = slugifyHeading(heading[2].trim());

            html.push(`<h${level} id="${id}">${renderInlineMarkdown(heading[2].trim())}</h${level}>`);
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
        while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
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
        .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
            (_match, text, href) => {
                if (href.startsWith("#")) {
                    return `<a href="${href}" class="anchor-link">${renderInlineMarkdown(text)}</a>`;
                }

                return `<a href="${href}" target="_blank" rel="noopener noreferrer"> ${renderInlineMarkdown(text)}</a>`;
                // return saveToken(`<a href="${escapeAttr(href)}" target="_blank" rel="noreferrer">${renderInlineMarkdown(label)}</a>`);
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

export function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function slugifyHeading(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/<[^>]+>/g, "")
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-");
}

export function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
}

