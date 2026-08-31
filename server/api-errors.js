const ERROR_CODES_BY_STATUS = Object.freeze({
    400: 'VALIDATION_ERROR', 401: 'SESSION_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
    409: 'CONFLICT', 410: 'GONE', 413: 'PAYLOAD_TOO_LARGE', 500: 'STORAGE_FAILURE'
});

function defaultErrorCode(statusCode) {
    return ERROR_CODES_BY_STATUS[statusCode] || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
}

function sendApiError(res, statusCode, message, code = defaultErrorCode(statusCode), details) {
    const payload = { error: message, code };
    if (details !== undefined) payload.details = details;
    return res.status(statusCode).json(payload);
}

function createStructuredErrorPayloads() {
    return function structuredErrorPayloads(_req, res, next) {
        const json = res.json.bind(res);
        res.json = body => json(body && typeof body === 'object' && !Array.isArray(body) && body.error && !body.code
            ? { ...body, code: defaultErrorCode(res.statusCode) }
            : body);
        next();
    };
}

module.exports = { createStructuredErrorPayloads, defaultErrorCode, sendApiError };
