import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireAppUser } from '../middleware/authMiddleware.js';
import { upsertCloudAccount, markAccountStatus } from '../services/accountService.js';
import { syncAccount } from '../services/syncService.js';
import { env } from '../config/env.js';
import * as rclone from '../services/rcloneService.js';

const router = Router();

router.use(requireAppUser);

// ---------------------------------------------------------------------------
// Provider catalogue
// ---------------------------------------------------------------------------

/**
 * Static catalogue of rclone-backed providers that have free storage tiers.
 * Each entry describes the auth fields the frontend should collect and the
 * rclone backend type used under the hood.
 */
const RCLONE_PROVIDERS = [
	{
		type: 'protondrive',
		name: 'Proton Drive',
		freeStorage: '500 MB',
		description: 'Encrypted cloud storage by Proton',
		authMethod: 'username_password',
		fields: ['username', 'password', 'twoFactorCode?'],
		rcloneType: 'protondrive',
		/** Map user-supplied field names to rclone config keys. */
		mapConfig: (cfg) => ({
			user: cfg.username,
			pass: cfg.password,
			...(cfg.twoFactorCode ? { '2fa': cfg.twoFactorCode } : {}),
		}),
	},
	{
		type: 'mega_rclone',
		name: 'MEGA (rclone)',
		freeStorage: '20 GB',
		description: 'MEGA cloud storage via rclone backend',
		authMethod: 'email_password',
		fields: ['email', 'password'],
		rcloneType: 'mega',
		mapConfig: (cfg) => ({
			user: cfg.email,
			pass: cfg.password,
		}),
	},
	{
		type: 'filen',
		name: 'Filen',
		freeStorage: '10 GB',
		description: 'End-to-end encrypted storage',
		authMethod: 'email_password',
		fields: ['email', 'password'],
		rcloneType: 'filen',
		mapConfig: (cfg) => ({
			email: cfg.email,
			password: cfg.password,
		}),
	},
	{
		type: 'jottacloud',
		name: 'Jottacloud',
		freeStorage: '5 GB',
		description: 'Norwegian cloud storage',
		authMethod: 'username_password',
		fields: ['username', 'password'],
		rcloneType: 'jottacloud',
		mapConfig: (cfg) => ({
			user: cfg.username,
			pass: cfg.password,
		}),
	},
	{
		type: 'seafile',
		name: 'Seafile',
		freeStorage: 'Self-hosted',
		description: 'Self-hosted file sync',
		authMethod: 'url_token',
		fields: ['url', 'username', 'password'],
		rcloneType: 'seafile',
		mapConfig: (cfg) => ({
			url: cfg.url,
			user: cfg.username,
			pass: cfg.password,
		}),
	},
	{
		type: 'nextcloud',
		name: 'Nextcloud',
		freeStorage: 'Self-hosted',
		description: 'Self-hosted collaboration platform',
		authMethod: 'url_user_pass',
		fields: ['url', 'username', 'password'],
		rcloneType: 'webdav',
		mapConfig: (cfg) => ({
			url: cfg.url,
			vendor: 'nextcloud',
			user: cfg.username,
			pass: cfg.password,
		}),
	},
	{
		type: 'box',
		name: 'Box',
		freeStorage: '10 GB',
		description: 'Enterprise cloud storage',
		authMethod: 'oauth',
		fields: ['client_id', 'client_secret'],
		rcloneType: 'box',
		mapConfig: (cfg) => ({
			client_id: cfg.client_id || env.boxClientId || '',
			client_secret: cfg.client_secret || env.boxClientSecret || '',
		}),
	},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a provider entry by its type slug.
 */
function findProvider(providerType) {
	return RCLONE_PROVIDERS.find((p) => p.type === providerType) || null;
}

/**
 * Build a deterministic rclone remote name for an account.
 */
function buildRemoteName(providerType, accountId) {
	const short = accountId.replace(/-/g, '').slice(0, 12);
	return `cloudhub_${providerType}_${short}`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/accounts/rclone/providers
 *
 * List all available rclone-backed providers with free tier info so the
 * frontend can render connection forms.
 */
router.get('/accounts/rclone/providers', (_req, res) => {
	const data = RCLONE_PROVIDERS.map(({ type, name, freeStorage, description, authMethod, fields }) => ({
		type,
		name,
		freeStorage,
		description,
		authMethod,
		fields,
	}));

	res.json({ data });
});

/**
 * POST /api/accounts/rclone/setup
 *
 * Set up a new rclone-backed cloud account:
 *   1. Create an rclone remote in the project config
 *   2. Run an initial health check to read quota
 *   3. Persist the account in the cloud_accounts table
 *   4. Kick off an initial sync
 *
 * Body:
 *   {
 *     provider_type: string,
 *     account_name:  string,
 *     config: { username?, password?, email?, url?, client_id?, client_secret?, ... }
 *   }
 */
router.post('/accounts/rclone/setup', async (req, res, next) => {
	try {
		const { provider_type, account_name, config } = req.body || {};

		if (!provider_type) {
			throw new Error('provider_type is required');
		}
		if (!config || typeof config !== 'object') {
			throw new Error('config object is required');
		}

		const provider = findProvider(provider_type);
		if (!provider) {
			throw new Error(`Unsupported rclone provider type: ${provider_type}`);
		}

		// Validate required fields (skip optional ones ending with "?")
		for (const field of provider.fields) {
			const isOptional = field.endsWith('?');
			const key = field.replace(/\?$/, '');
			if (!isOptional && !config[key]) {
				throw new Error(`Missing required config field: ${key}`);
			}
		}

		const accountId = randomUUID();
		const remoteName = buildRemoteName(provider_type, accountId);
		const rcloneParams = provider.mapConfig(config);

		// 1. Create the rclone remote
		await rclone.createRemote(remoteName, provider.rcloneType, rcloneParams);

		// 2. Attempt to read quota (best-effort – some providers don't support `about`)
		let totalSpace = 0;
		let usedSpace = 0;

		try {
			const quota = await rclone.about(remoteName);
			totalSpace = quota.total || 0;
			usedSpace = quota.used || 0;
		} catch {
			// `about` is not supported by every backend – proceed with 0/0
		}

		// 3. Build the credential blob that RcloneAdapter expects
		const email = account_name || config.email || config.username || `${provider_type}-account`;
		const credentials = {
			provider: provider_type,
			rclone_remote: remoteName,
			type: provider.rcloneType,
			...rcloneParams,
		};

		const account = upsertCloudAccount({
			userId: req.user.id,
			id: accountId,
			email,
			provider: provider_type,
			credentials,
			total_space: totalSpace,
			used_space: usedSpace,
			status: 'active',
		});

		// 4. Kick off initial sync (fire-and-forget)
		syncAccount(req.user.id, account).catch((error) => {
			markAccountStatus(req.user.id, account.id, 'active');
			console.warn(`[${provider_type}] initial sync warning:`, error?.message || error);
		});

		res.json({
			data: {
				account: {
					...account,
					encrypted_credentials: undefined, // never leak
				},
				profile: { email, provider: provider_type },
			},
		});
	} catch (error) {
		next(error);
	}
});

/**
 * POST /api/accounts/rclone/test
 *
 * Test connectivity to an rclone provider without persisting anything.
 * Creates a temporary remote, probes quota, then cleans up.
 *
 * Body:
 *   {
 *     provider_type: string,
 *     config: { ...same fields as /setup }
 *   }
 *
 * Response:
 *   { data: { success: true, quota: { total, used, free } } }
 */
router.post('/accounts/rclone/test', async (req, res, next) => {
	const tempRemote = `cloudhub_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

	try {
		const { provider_type, config } = req.body || {};

		if (!provider_type) {
			throw new Error('provider_type is required');
		}
		if (!config || typeof config !== 'object') {
			throw new Error('config object is required');
		}

		const provider = findProvider(provider_type);
		if (!provider) {
			throw new Error(`Unsupported rclone provider type: ${provider_type}`);
		}

		// Validate required fields
		for (const field of provider.fields) {
			const isOptional = field.endsWith('?');
			const key = field.replace(/\?$/, '');
			if (!isOptional && !config[key]) {
				throw new Error(`Missing required config field: ${key}`);
			}
		}

		const rcloneParams = provider.mapConfig(config);

		// Create temporary remote
		await rclone.createRemote(tempRemote, provider.rcloneType, rcloneParams);

		// Try to list root (works on all backends)
		await rclone.lsjson(tempRemote, '', {});

		// Try to read quota (best-effort)
		let quota = { total: 0, used: 0, free: 0 };
		try {
			quota = await rclone.about(tempRemote);
		} catch {
			// Not all backends support about – that's fine
		}

		res.json({ data: { success: true, quota } });
	} catch (error) {
		// If we have a meaningful error, return it rather than throwing
		if (error?.message && !error.message.startsWith('rclone')) {
			// Re-throw validation errors
			return next(error);
		}

		res.json({
			data: {
				success: false,
				error: error?.message || 'Connection test failed',
			},
		});
	} finally {
		// Always clean up the temporary remote
		rclone.removeRemote(tempRemote).catch(() => {});
	}
});

export default router;
