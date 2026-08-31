export function assemblePublicDocument(parts) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${parts.title}</title>
    ${parts.fontLinks}
    ${parts.iconFontLink}
    <style>
        ${parts.css}
    </style>
</head>
<body>
    ${parts.header}
    ${parts.navigation}
    <div class="container">
        ${parts.content}
    </div>
    ${parts.siteNavigation}
    ${parts.modals}
    ${parts.runtime}
</body>
</html>`;
}
