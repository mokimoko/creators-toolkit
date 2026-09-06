const fs = require('fs-extra');
const path = require('path');
const bcrypt = require('bcrypt');

const ACCOUNT_POLICY = Object.freeze({
    username: Object.freeze({ minLength: 3, maxLength: 64, pattern: '^[A-Za-z0-9 _.-]+$' }),
    password: Object.freeze({ minLength: 6, maxLength: 256 }),
    email: Object.freeze({ maxLength: 254 }),
    securityQuestion: Object.freeze({ minLength: 8, maxLength: 160 }),
    securityAnswer: Object.freeze({ minLength: 2, maxLength: 160 }),
    uniqueness: 'case-insensitive'
});

class AccountError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

function normalizeUsername(value) {
    const username = String(value || '').trim();
    if (username.length < ACCOUNT_POLICY.username.minLength || username.length > ACCOUNT_POLICY.username.maxLength) {
        throw new AccountError(`Username must be ${ACCOUNT_POLICY.username.minLength}-${ACCOUNT_POLICY.username.maxLength} characters`);
    }
    if (!new RegExp(ACCOUNT_POLICY.username.pattern).test(username)) {
        throw new AccountError('Username contains unsupported characters');
    }
    return username;
}

function normalizeEmail(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const email = String(value).trim();
    if (email.length > ACCOUNT_POLICY.email.maxLength || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AccountError('Email address is invalid');
    }
    return email;
}

function validatePassword(value) {
    const password = String(value || '');
    if (password.length < ACCOUNT_POLICY.password.minLength || password.length > ACCOUNT_POLICY.password.maxLength) {
        throw new AccountError(`Password must be ${ACCOUNT_POLICY.password.minLength}-${ACCOUNT_POLICY.password.maxLength} characters`);
    }
    return password;
}

function normalizeSecurityQuestion(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const question = String(value).trim();
    const policy = ACCOUNT_POLICY.securityQuestion;
    if (question.length < policy.minLength || question.length > policy.maxLength) {
        throw new AccountError(`Security question must be ${policy.minLength}-${policy.maxLength} characters`);
    }
    return question;
}

function normalizeSecurityAnswer(value) {
    const answer = String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
    const policy = ACCOUNT_POLICY.securityAnswer;
    if (answer.length < policy.minLength || answer.length > policy.maxLength) {
        throw new AccountError(`Security answer must be ${policy.minLength}-${policy.maxLength} characters`);
    }
    return answer;
}

function findDuplicate(accounts, field, value, excludedId = null) {
    if (value === null) return null;
    const normalized = String(value).toLocaleLowerCase('en-US');
    return Object.values(accounts).find(account => (
        account.id !== excludedId
        && account[field] !== null
        && account[field] !== undefined
        && String(account[field]).toLocaleLowerCase('en-US') === normalized
    ));
}

function canonicalProfile(user, avatarVersion = 0) {
    return {
        id: user.id,
        username: user.username,
        email: user.email || null,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isGuest: false,
        isPremium: user.isPremium === true,
        isAdmin: user.isAdmin === true,
        securityQuestion: user.securityQuestion || null,
        hasSecurityQuestion: Boolean(user.securityQuestion && user.securityAnswerHash),
        avatar: '/api/user/avatar',
        avatarVersion
    };
}

class AccountService {
    constructor(options) {
        this.loadAccounts = options.loadAccounts;
        this.saveAccounts = options.saveAccounts;
        this.usersFolder = options.usersFolder;
        this.clearRememberedSession = options.clearRememberedSession;
        this.updateRememberedUsername = options.updateRememberedUsername;
        this.rotateToolkitSession = options.rotateToolkitSession;
        this.revokeToolkitSession = options.revokeToolkitSession;
        this.revokeToolkitSessionsForUser = options.revokeToolkitSessionsForUser;
        this.avatarService = options.avatarService;
        this.writeChain = Promise.resolve();
    }

    async getProfile(userContext) {
        if (userContext.isGuest) {
            return { username: 'Guest', isGuest: true, avatar: '/images/default-avatar.png', avatarVersion: 0 };
        }
        const accounts = await this.loadAccounts();
        const user = accounts[userContext.userId];
        if (!user) throw new AccountError('User not found', 404);
        return canonicalProfile(user, await this.avatarService.version(userContext));
    }

    async updateProfile(userContext, updates, toolkitSessionToken) {
        if (userContext.isGuest) throw new AccountError('Cannot update guest profile');
        return this.serialize(async () => {
            const accounts = await this.loadAccounts();
            const user = accounts[userContext.userId];
            if (!user) throw new AccountError('User not found', 404);

            const allowed = new Set(['username', 'email', 'password', 'securityQuestion', 'securityAnswer', 'currentPassword']);
            const unknown = Object.keys(updates || {}).filter(key => !allowed.has(key));
            if (unknown.length) throw new AccountError(`Unknown profile update: ${unknown[0]}`);
            const hasSensitiveChange = ['username', 'email', 'password', 'securityQuestion', 'securityAnswer'].some(key => (
                updates?.[key] !== undefined
            ));
            if (!hasSensitiveChange) throw new AccountError('No profile changes provided');
            if (!updates.currentPassword) throw new AccountError('Current password is required', 401);
            if (!await bcrypt.compare(updates.currentPassword, user.passwordHash)) {
                throw new AccountError('Current password is incorrect', 401);
            }

            const username = updates.username === undefined ? user.username : normalizeUsername(updates.username);
            const email = updates.email === undefined ? user.email : normalizeEmail(updates.email);
            if (findDuplicate(accounts, 'username', username, user.id)) throw new AccountError('Username already taken', 409);
            if (findDuplicate(accounts, 'email', email, user.id)) throw new AccountError('Email already in use', 409);

            const usernameChanged = username !== user.username;
            const passwordChanged = updates.password !== undefined;
            const recoveryChanged = updates.securityQuestion !== undefined || updates.securityAnswer !== undefined;
            user.username = username;
            user.email = email;
            if (passwordChanged) user.passwordHash = await bcrypt.hash(validatePassword(updates.password), 10);
            if (recoveryChanged) {
                const question = normalizeSecurityQuestion(updates.securityQuestion);
                if (!question || updates.securityAnswer === undefined) {
                    throw new AccountError('A security question and answer are both required');
                }
                user.securityQuestion = question;
                user.securityAnswerHash = await bcrypt.hash(normalizeSecurityAnswer(updates.securityAnswer), 10);
            }
            accounts[user.id] = user;
            if (!await this.saveAccounts(accounts)) throw new AccountError('Failed to save profile updates', 500);

            if (passwordChanged) await this.clearRememberedSession(user.id);
            else if (usernameChanged) await this.updateRememberedUsername(user.id, user.username);

            const rotatedToken = (usernameChanged || passwordChanged)
                ? this.rotateToolkitSession(toolkitSessionToken, {
                    userId: user.id,
                    username: user.username,
                    isGuest: false
                })
                : null;
            return {
                profile: canonicalProfile(user, await this.avatarService.version(userContext)),
                toolkitSessionToken: rotatedToken,
                rememberedSessionRevoked: passwordChanged
            };
        });
    }

    async deleteAccount(userContext, password, toolkitSessionToken) {
        if (userContext.isGuest) throw new AccountError('Cannot delete guest account');
        if (!password) throw new AccountError('Password is required');
        return this.serialize(async () => {
            const accounts = await this.loadAccounts();
            const user = accounts[userContext.userId];
            if (!user) throw new AccountError('User not found', 404);
            if (!await bcrypt.compare(password, user.passwordHash)) throw new AccountError('Incorrect password', 401);

            return this.deleteAccountRecord(accounts, user, toolkitSessionToken);
        });
    }

    async listAccounts(adminContext) {
        const accounts = await this.loadAccounts();
        const admin = accounts[adminContext.userId];
        if (!admin?.isAdmin) throw new AccountError('Administrator access required', 403);
        return Object.values(accounts)
            .map(user => ({
                id: user.id,
                username: user.username,
                email: user.email || null,
                isAdmin: user.isAdmin === true,
                createdAt: user.createdAt
            }))
            .sort((left, right) => left.username.localeCompare(right.username));
    }

    async deleteAccountAsAdmin(adminContext, targetUserId) {
        return this.serialize(async () => {
            const accounts = await this.loadAccounts();
            const admin = accounts[adminContext.userId];
            if (!admin?.isAdmin) throw new AccountError('Administrator access required', 403);
            const user = accounts[targetUserId];
            if (!user) throw new AccountError('User not found', 404);
            if (user.isAdmin && Object.values(accounts).filter(account => account.isAdmin === true).length === 1) {
                throw new AccountError('Create another administrator before deleting the last admin account', 409);
            }
            return this.deleteAccountRecord(accounts, user, null);
        });
    }

    async deleteAccountRecord(accounts, user, toolkitSessionToken) {
            const userFolder = path.join(this.usersFolder, user.id);
            const trashFolder = path.join(this.usersFolder, '.trash', 'account-deletions');
            const deletionId = `${user.id}-${Date.now()}`;
            const stagingPath = path.join(trashFolder, deletionId);
            const directoryExists = await fs.pathExists(userFolder);
            const deletionPlan = {
                accountRecord: 'pending',
                sessions: 'pending',
                userDirectory: directoryExists ? 'pending-staging' : 'not-present'
            };

            try {
                await this.clearRememberedSession(user.id);
                if (toolkitSessionToken) this.revokeToolkitSession(toolkitSessionToken);
                this.revokeToolkitSessionsForUser?.(user.id);
                deletionPlan.sessions = 'revoked';
            } catch {
                throw new AccountError('Sessions could not be revoked; the account and user files were not changed', 500);
            }
            if (directoryExists) {
                try {
                    await fs.ensureDir(trashFolder);
                    await fs.move(userFolder, stagingPath);
                    deletionPlan.userDirectory = 'staged';
                } catch {
                    throw new AccountError('User files could not be staged; the account record was not changed, but sessions were revoked', 500);
                }
            }

            delete accounts[user.id];
            if (!await this.saveAccounts(accounts)) {
                if (directoryExists) await fs.move(stagingPath, userFolder).catch(() => {});
                throw new AccountError('Account record could not be removed; user files were restored, but sessions were revoked', 500);
            }
            deletionPlan.accountRecord = 'removed';

            return {
                deletionId,
                deletionPlan,
                profile: { id: user.id, username: user.username },
                stagedUserDirectory: directoryExists,
                sessionsRevoked: true,
                backupGuidance: 'Export any projects you want to retain before deleting an account.'
            };
    }

    serialize(operation) {
        const result = this.writeChain.then(operation, operation);
        this.writeChain = result.catch(() => {});
        return result;
    }
}

module.exports = {
    ACCOUNT_POLICY,
    AccountError,
    AccountService,
    canonicalProfile,
    findDuplicate,
    normalizeEmail,
    normalizeSecurityAnswer,
    normalizeSecurityQuestion,
    normalizeUsername,
    validatePassword
};
