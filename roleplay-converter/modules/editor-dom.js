(function defineEditorDOM(root) {
    'use strict';

    function create(tagName, options = {}, children = []) {
        const element = document.createElement(tagName);
        if (options.className) element.className = options.className;
        if (options.text !== undefined) element.textContent = String(options.text);
        Object.entries(options.attributes || {}).forEach(([name, value]) => {
            if (value !== undefined && value !== null) element.setAttribute(name, String(value));
        });
        Object.entries(options.properties || {}).forEach(([name, value]) => {
            element[name] = value;
        });
        element.append(...children.filter(Boolean));
        return element;
    }

    function field(labelText, inputOptions, wrapperClass) {
        const label = create('label', {
            text: labelText,
            attributes: { for: inputOptions.attributes?.id }
        });
        const input = create('input', inputOptions);
        return {
            input,
            wrapper: create('div', { className: wrapperClass }, [label, input])
        };
    }

    root.RPArchiver.define('editorDOM', { create, field });
})(window);
