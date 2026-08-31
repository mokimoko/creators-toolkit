export function buildProjectPreviewBaseHref(projectName, userContext) {
    const userSegment = userContext?.isGuest ? 'guest' : userContext?.userId;
    if (!projectName || !userSegment) return '';

    return `/projects/${encodeURIComponent(userSegment)}/${encodeURIComponent(projectName)}/`;
}

export function addPreviewBaseHref(html, baseHref) {
    const source = html || '';
    if (!source || !baseHref || /<base\b/i.test(source)) return source;

    return source.replace(/<head(?:\s[^>]*)?>/i, match => `${match}\n    <base href="${baseHref}">`);
}
