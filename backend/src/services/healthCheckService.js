import { db } from '../config/database.js';
import { markAccountStatus, updateAccountStorage } from './accountService.js';
import { createAdapter } from './adapterRegistry.js';
import { isAuthError } from '../utils/providerErrors.js';

/**
 * In-memory cache of the most recent health-check result per account.
 * Keyed by account id, values are result objects from checkAccount().
 */
const healthResults = new Map();

let lastRunSummary = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getAllActiveAccounts() {
	return db.prepare("SELECT * FROM cloud_accounts WHERE status = 'active'").all();
}

function getUserAccounts(userId) {
	return db
		.prepare(
			'SELECT id, email, provider, status, total_space, used_space FROM cloud_accounts WHERE user_id = ? ORDER BY provider, email',
		)
		.all(userId);
}

// ---------------------------------------------------------------------------
// Core health-check logic
// ---------------------------------------------------------------------------

/**
 * Run a single health check against one cloud account.
 *
 * 1. Creates an adapter from the account row.
 * 2. Calls adapter.getStorageSummary() to verify connectivity + fetch quota.
 * 3. On success  → marks the account 'active' and updates quota in the DB.
 * 4. On auth error → marks the account 'invalid_token'.
 * 5. On any other error → marks the account 'suspended'.
 *
 * @param {object} account  Full cloud_accounts row (must include encrypted_credentials).
 * @returns {Promise<{accountId, status, totalSpace, usedSpace, error?, checkedAt}>}
 */
export async function checkAccount(account) {
	try {
		const adapter = createAdapter(account);
		const storage = await adapter.getStorageSummary();

		// Connectivity confirmed – refresh status + quota in the database.
		markAccountStatus(account.user_id, account.id, 'active');
		updateAccountStorage(account.user_id, account.id, storage.totalSpace, storage.usedSpace);

		const result = {
			accountId: account.id,
			status: 'active',
			totalSpace: storage.totalSpace,
			usedSpace: storage.usedSpace,
			checkedAt: new Date().toISOString(),
		};

		healthResults.set(account.id, result);
		return result;
	} catch (error) {
		const isAuth = isAuthError(error);
		const status = isAuth ? 'invalid_token' : 'suspended';

		markAccountStatus(account.user_id, account.id, status);

		const result = {
			accountId: account.id,
			status,
			totalSpace: Number(account.total_space || 0),
			usedSpace: Number(account.used_space || 0),
			error: error?.message || String(error),
			checkedAt: new Date().toISOString(),
		};

		healthResults.set(account.id, result);
		return result;
	}
}

/**
 * Check every active account across all users.
 * Intended to be called by the periodic cron scheduler.
 *
 * @returns {Promise<object>} Summary of the health-check run.
 */
export async function runHealthChecks() {
	const accounts = getAllActiveAccounts();
	const settled = await Promise.allSettled(accounts.map(checkAccount));

	let healthy = 0;
	let unhealthy = 0;
	const results = [];

	for (const outcome of settled) {
		if (outcome.status === 'fulfilled') {
			results.push(outcome.value);
			if (outcome.value.status === 'active') {
				healthy += 1;
			} else {
				unhealthy += 1;
			}
		}
	}

	lastRunSummary = {
		checkedAt: new Date().toISOString(),
		totalChecked: accounts.length,
		healthy,
		unhealthy,
	};

	console.log(
		`[health] Health check complete: ${healthy}/${accounts.length} accounts healthy` +
			(unhealthy ? `, ${unhealthy} unhealthy` : ''),
	);

	return { ...lastRunSummary, results };
}

/**
 * Get a health summary scoped to a single user's accounts.
 * Combines live DB state with cached check results.
 *
 * @param {string} userId
 * @returns {object}
 */
export function getHealthStatus(userId) {
	const accounts = getUserAccounts(userId);

	const accountStatuses = accounts.map((account) => {
		const lastCheck = healthResults.get(account.id);
		return {
			accountId: account.id,
			email: account.email,
			provider: account.provider,
			status: account.status,
			totalSpace: Number(account.total_space || 0),
			usedSpace: Number(account.used_space || 0),
			lastCheckedAt: lastCheck?.checkedAt || null,
			lastError: lastCheck?.error || null,
		};
	});

	return {
		accounts: accountStatuses,
		summary: {
			total: accountStatuses.length,
			active: accountStatuses.filter((a) => a.status === 'active').length,
			suspended: accountStatuses.filter((a) => a.status === 'suspended').length,
			invalidToken: accountStatuses.filter((a) => a.status === 'invalid_token').length,
		},
		lastRunAt: lastRunSummary?.checkedAt || null,
	};
}
