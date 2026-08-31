function compactWhitespace(source, punctuation) {
    let output = '';
    let quote = '';
    let escaped = false;
    let inComment = false;
    let pendingWhitespace = false;

    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        const next = source[index + 1];

        if (inComment) {
            if (character === '*' && next === '/') {
                inComment = false;
                index++;
            }
            continue;
        }

        if (quote) {
            output += character;
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = '';
            continue;
        }

        if (character === '/' && next === '*') {
            inComment = true;
            index++;
            continue;
        }
        if (character === '"' || character === "'") {
            if (pendingWhitespace && output && !punctuation.has(output.at(-1))) output += ' ';
            pendingWhitespace = false;
            quote = character;
            output += character;
            continue;
        }
        if (/\s/.test(character)) {
            pendingWhitespace = true;
            continue;
        }

        const previous = output.at(-1);
        if (pendingWhitespace && previous && !punctuation.has(previous) && !punctuation.has(character)) {
            output += ' ';
        }
        pendingWhitespace = false;
        if (punctuation.has(character) && output.endsWith(' ')) output = output.slice(0, -1);
        output += character;
    }

    return output.trim();
}

export function minifyPublicCss(css) {
    return compactWhitespace(css, new Set(['{', '}', ':', ';', ',', '>']));
}

export function minifyPublicRuntime(runtimeMarkup) {
    return runtimeMarkup.replace(/<script>([\s\S]*?)<\/script>/gi, (_match, source) => {
        const compacted = source
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .join('\n');
        return `<script>\n${compacted}\n</script>`;
    });
}
