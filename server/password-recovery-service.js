const crypto = require('crypto');
const bcrypt = require('bcrypt');
const {
    AccountError,
    normalizeSecurityAnswer,
    validatePassword
} = require('./account-service');

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function maskEmail(email) {
    const [local, domain] = String(email).split('@');
    return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

function hashCode(code, salt) {
    return crypto.scryptSync(String(code), salt, 32).toString('hex');
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSmtpTransport() {
    const host = process.env.CT_SMTP_HOST;
    const from = process.env.CT_SMTP_FROM;
    if (!host || !from) return null;

    // Loaded only when email delivery is configured, so local-only installs do not
    // pay the startup cost or fail because SMTP is intentionally unused.
    const nodemailer = require('nodemailer');
    const port = Number(process.env.CT_SMTP_PORT || 587);
    const user = process.env.CT_SMTP_USER;
    const pass = process.env.CT_SMTP_PASS;
    return {
        from,
        transport: nodemailer.createTransport({
            host,
            port,
            secure: String(process.env.CT_SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
            ...(user && pass ? { auth: { user, pass } } : {})
        })
    };
}

class PasswordRecoveryService {
    constructor(options) {
        this.loadAccounts = options.loadAccounts;
        this.saveAccounts = options.saveAccounts;
        this.clearRememberedSession = options.clearRememberedSession;
        this.revokeToolkitSessionsForUser = options.revokeToolkitSessionsForUser;
        this.smtp = options.smtp === undefined ? createSmtpTransport() : options.smtp;
        this.challenges = new Map();
        this.writeChain = Promise.resolve();
    }

    findUser(accounts, identifier) {
        const normalized = String(identifier || '').trim().toLocaleLowerCase('en-US');
        if (!normalized) throw new AccountError('Enter your username or email');
        return Object.values(accounts).find(user => (
            String(user.username || '').toLocaleLowerCase('en-US') === normalized
            || String(user.email || '').toLocaleLowerCase('en-US') === normalized
        ));
    }

    async begin(identifier) {
        const accounts = await this.loadAccounts();
        const user = this.findUser(accounts, identifier);
        if (!user) throw new AccountError('No account matches that username or email', 404);

        const enteredEmail = String(identifier || '').trim().includes('@');
        if (enteredEmail && user.email && this.smtp) {
            const code = String(crypto.randomInt(100000, 1000000));
            const salt = crypto.randomBytes(16).toString('hex');
            this.challenges.set(user.id, {
                codeHash: hashCode(code, salt),
                salt,
                expiresAt: Date.now() + CODE_TTL_MS,
                attempts: 0
            });
            await this.smtp.transport.sendMail({
                from: this.smtp.from,
                to: user.email,
                subject: "Creator's Toolkit password reset",
                text: `Your Creator's Toolkit password reset code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.`
            });
            return { method: 'email', destination: maskEmail(user.email) };
        }

        if (user.securityQuestion && user.securityAnswerHash) {
            return { method: 'security-question', question: user.securityQuestion };
        }

        if (enteredEmail && user.email && !this.smtp) {
            throw new AccountError('Email recovery is not configured on this Toolkit. Add a security question from Settings after signing in.', 503);
        }
        throw new AccountError('This account does not have a security question yet', 409);
    }

    async reset({ identifier, method, credential, newPassword }) {
        const password = validatePassword(newPassword);
        return this.serialize(async () => {
            const accounts = await this.loadAccounts();
            const user = this.findUser(accounts, identifier);
            if (!user) throw new AccountError('Account not found', 404);

            if (method === 'email') {
                const challenge = this.challenges.get(user.id);
                if (!challenge || challenge.expiresAt <= Date.now()) {
                    this.challenges.delete(user.id);
                    throw new AccountError('That reset code has expired. Request a new one.', 410);
                }
                challenge.attempts += 1;
                if (challenge.attempts > MAX_ATTEMPTS) {
                    this.challenges.delete(user.id);
                    throw new AccountError('Too many attempts. Request a new reset code.', 429);
                }
                if (!safeEqual(hashCode(String(credential || '').trim(), challenge.salt), challenge.codeHash)) {
                    throw new AccountError('Reset code is incorrect', 401);
                }
                this.challenges.delete(user.id);
            } else if (method === 'security-question') {
                if (!user.securityAnswerHash || !await bcrypt.compare(normalizeSecurityAnswer(credential), user.securityAnswerHash)) {
                    throw new AccountError('Security answer is incorrect', 401);
                }
            } else {
                throw new AccountError('Choose a valid recovery method');
            }

            user.passwordHash = await bcrypt.hash(password, 10);
            accounts[user.id] = user;
            if (!await this.saveAccounts(accounts)) throw new AccountError('Could not reset password', 500);
            await this.clearRememberedSession(user.id);
            this.revokeToolkitSessionsForUser(user.id);
            return { success: true };
        });
    }

    serialize(operation) {
        const result = this.writeChain.then(operation, operation);
        this.writeChain = result.catch(() => {});
        return result;
    }
}

module.exports = { PasswordRecoveryService, createSmtpTransport };
