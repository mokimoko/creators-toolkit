const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const SERVER_DIR = __dirname;
const LOCKFILE_PATH = path.join(SERVER_DIR, 'package-lock.json');
const NODE_MODULES_PATH = path.join(SERVER_DIR, 'node_modules');
const INSTALL_STATE_PATH = path.join(NODE_MODULES_PATH, '.creators-toolkit-lock.sha256');
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 250;

function getPort() {
    const value = process.env.PORT || '9000';
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid PORT value: ${value}`);
    }
    return port;
}

function hashFile(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: SERVER_DIR,
            env: process.env,
            stdio: 'inherit',
            shell: process.platform === 'win32'
        });

        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} failed (${signal || `exit ${code}`}).`));
        });
    });
}

async function ensureDependencies() {
    if (!fs.existsSync(LOCKFILE_PATH)) {
        throw new Error('package-lock.json is missing; dependencies cannot be verified.');
    }

    const expectedHash = hashFile(LOCKFILE_PATH);
    const installedHash = fs.existsSync(INSTALL_STATE_PATH)
        ? fs.readFileSync(INSTALL_STATE_PATH, 'utf8').trim()
        : null;

    if (fs.existsSync(NODE_MODULES_PATH) && installedHash === expectedHash) {
        console.log('Dependencies are ready.');
        return;
    }

    console.log('Dependency state changed or is unverified; running npm ci...');
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await run(npmCommand, ['ci', '--omit=dev', '--no-audit', '--no-fund']);
    fs.writeFileSync(INSTALL_STATE_PATH, `${expectedHash}\n`, 'utf8');
    console.log('Dependencies installed and verified.');
}

function requestHealth(url) {
    return new Promise((resolve) => {
        const request = http.get(url, { timeout: 1_000 }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                try {
                    const health = JSON.parse(body);
                    resolve(response.statusCode === 200 && health.ready === true);
                } catch {
                    resolve(false);
                }
            });
        });
        request.on('timeout', () => {
            request.destroy();
            resolve(false);
        });
        request.on('error', () => resolve(false));
    });
}

async function waitForReadiness(serverProcess, healthUrl) {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (serverProcess.exitCode !== null) {
            throw new Error(`Server exited before becoming ready (exit ${serverProcess.exitCode}).`);
        }
        if (await requestHealth(healthUrl)) return;
        await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
    throw new Error(`Server did not become ready within ${READY_TIMEOUT_MS / 1000} seconds.`);
}

function openBrowser(url) {
    if (process.env.TOOLKIT_NO_BROWSER === '1') return;

    let command;
    let args;
    if (process.platform === 'win32') {
        command = 'cmd.exe';
        args = ['/d', '/s', '/c', 'start', '', url];
    } else if (process.platform === 'darwin') {
        command = 'open';
        args = [url];
    } else {
        command = 'xdg-open';
        args = [url];
    }

    const browser = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    browser.on('error', () => {
        console.warn(`Could not open a browser automatically. Open ${url} manually.`);
    });
    browser.unref();
}

function waitForEnterOrExit(serverProcess) {
    return new Promise((resolve) => {
        const input = readline.createInterface({ input: process.stdin, output: process.stdout });
        let settled = false;

        const finish = (reason) => {
            if (settled) return;
            settled = true;
            input.close();
            resolve(reason);
        };

        serverProcess.once('exit', (code, signal) => finish({ code, signal }));
        input.once('close', () => finish({ requested: true, reason: 'input-closed' }));
        input.question('\nPress Enter to stop the server...\n', () => finish({ requested: true }));
    });
}

async function stopServer(serverProcess) {
    if (!serverProcess || serverProcess.exitCode !== null) return;

    serverProcess.kill('SIGTERM');
    await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 5_000))
    ]);

    if (serverProcess.exitCode === null) {
        serverProcess.kill('SIGKILL');
    }
}

async function main() {
    const port = getPort();
    const appUrl = `http://localhost:${port}`;
    const healthUrl = `http://127.0.0.1:${port}/api/health`;
    let serverProcess;
    let stopping = false;

    const shutdown = async () => {
        if (stopping) return;
        stopping = true;
        process.removeListener('SIGINT', handleSigint);
        process.removeListener('SIGTERM', handleSigterm);
        process.removeListener('SIGHUP', handleSighup);
        process.removeListener('exit', handleProcessExit);
        await stopServer(serverProcess);
    };

    const handleSigint = () => shutdown();
    const handleSigterm = () => shutdown();
    const handleSighup = () => shutdown();
    const handleProcessExit = () => {
        if (serverProcess?.exitCode === null) serverProcess.kill();
    };

    process.once('SIGINT', handleSigint);
    process.once('SIGTERM', handleSigterm);
    process.once('SIGHUP', handleSighup);
    process.once('exit', handleProcessExit);

    try {
        console.log("Starting Creator's Toolkit...");
        await ensureDependencies();

        serverProcess = spawn(process.execPath, ['server.js'], {
            cwd: SERVER_DIR,
            env: process.env,
            stdio: 'inherit'
        });
        serverProcess.once('error', (error) => {
            console.error(`Server process error: ${error.message}`);
        });

        await waitForReadiness(serverProcess, healthUrl);
        console.log(`Creator's Toolkit is ready at ${appUrl}`);
        openBrowser(appUrl);

        const result = await waitForEnterOrExit(serverProcess);
        if (!result.requested && !stopping && result.code !== 0) {
            throw new Error(`Server stopped unexpectedly (${result.signal || `exit ${result.code}`}).`);
        }
    } finally {
        await shutdown();
    }
}

main().catch((error) => {
    console.error(`Launcher failed: ${error.message}`);
    process.exitCode = 1;
});
