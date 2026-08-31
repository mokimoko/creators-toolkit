export function debounce(callback, delayMs) {
    let timeoutId = null;

    function debounced(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            timeoutId = null;
            callback.apply(this, args);
        }, delayMs);
    }

    debounced.cancel = () => {
        clearTimeout(timeoutId);
        timeoutId = null;
    };

    return debounced;
}
