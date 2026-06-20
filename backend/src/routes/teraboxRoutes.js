import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireAppUser } from '../middleware/authMiddleware.js';
import { upsertCloudAccount, getAccountById } from '../services/accountService.js';
import { decryptJson } from '../utils/crypto.js';
import { TeraBoxAdapter } from '../adapters/TeraBoxAdapter.js';

const router = Router();
router.use(requireAppUser);

// Connect TeraBox account
router.post('/connect', async (req, res) => {
	try {
		const { ndus } = req.body;
		if (!ndus) return res.status(400).json({ error: 'ndus cookie is required' });

		// Test connection
		const account = {
			id: -1,
			provider: 'terabox',
			credentials: { ndus },
			total_space: 0,
			used_space: 0,
		};

		const adapter = new TeraBoxAdapter(account);
		await adapter._init();

		const app = adapter.app;
		const params = app.params || {};
		const userName = params.uname || params.nick_name || 'terabox_user';
		const totalSpace = Number(params.total || 1099511627776); // default 1TB
		const usedSpace = Number(params.used || 0);

		// Save to DB using existing pattern
		const saved = upsertCloudAccount({
			userId: req.user.id,
			id: randomUUID(),
			email: `${userName}@terabox`,
			provider: 'terabox',
			credentials: { ndus, provider: 'terabox' },
			total_space: totalSpace,
			used_space: usedSpace,
			status: 'active',
		});

		res.json({
			data: {
				...saved,
				free_space: totalSpace - usedSpace,
				terabox_user: userName,
			},
		});
	} catch (err) {
		console.error('[terabox] connect error:', err.message);
		res.status(400).json({ error: `Connection failed: ${err.message}` });
	}
});

// Test connection
router.post('/test', async (req, res) => {
	try {
		const { ndus } = req.body;
		if (!ndus) return res.status(400).json({ error: 'ndus cookie is required' });

		const account = { id: -1, provider: 'terabox', credentials: { ndus }, total_space: 0, used_space: 0 };
		const adapter = new TeraBoxAdapter(account);
		await adapter._init();

		const params = adapter.app.params || {};
		res.json({
			data: {
				success: true,
				user: params.uname || params.nick_name || 'Unknown',
				total: params.total || 0,
				used: params.used || 0,
			},
		});
	} catch (err) {
		res.status(400).json({ error: `Test failed: ${err.message}` });
	}
});

// List files in TeraBox
router.get('/list/:accountId', async (req, res) => {
	try {
		const account = getAccountById(req.params.accountId, req.user.id);
		if (!account) return res.status(404).json({ error: 'Account not found' });

		const creds = decryptJson(account.encrypted_credentials);
		const adapter = new TeraBoxAdapter({ ...account, credentials: { ndus: creds.ndus } });
		const path = req.query.path || '/';
		const files = await adapter.fetchStructure(path);

		res.json({ data: { files, path } });
	} catch (err) {
		console.error('[terabox] list error:', err.message);
		res.status(400).json({ error: err.message });
	}
});

// Download file from TeraBox
router.get('/download/:accountId', async (req, res) => {
	try {
		const account = getAccountById(req.params.accountId, req.user.id);
		if (!account) return res.status(404).json({ error: 'Account not found' });

		const creds = decryptJson(account.encrypted_credentials);
		const adapter = new TeraBoxAdapter({ ...account, credentials: { ndus: creds.ndus } });
		const remotePath = req.query.path;
		if (!remotePath) return res.status(400).json({ error: 'path is required' });

		const { stream, size, mimeType } = await adapter.downloadStream(remotePath);

		res.setHeader('Content-Type', mimeType);
		if (size) res.setHeader('Content-Length', size);
		res.setHeader('Content-Disposition', `attachment; filename="${remotePath.split('/').pop()}"`);
		stream.pipe(res);
	} catch (err) {
		console.error('[terabox] download error:', err.message);
		res.status(400).json({ error: err.message });
	}
});

// Delete files from TeraBox
router.post('/delete/:accountId', async (req, res) => {
	try {
		const account = getAccountById(req.params.accountId, req.user.id);
		if (!account) return res.status(404).json({ error: 'Account not found' });

		const creds = decryptJson(account.encrypted_credentials);
		const adapter = new TeraBoxAdapter({ ...account, credentials: { ndus: creds.ndus } });
		const { paths } = req.body;
		if (!paths?.length) return res.status(400).json({ error: 'paths required' });

		for (const p of paths) await adapter.deleteFile(p);
		res.json({ data: { success: true, deleted: paths.length } });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

// Get quota
router.get('/quota/:accountId', async (req, res) => {
	try {
		const account = getAccountById(req.params.accountId, req.user.id);
		if (!account) return res.status(404).json({ error: 'Account not found' });

		const creds = decryptJson(account.encrypted_credentials);
		const adapter = new TeraBoxAdapter({ ...account, credentials: { ndus: creds.ndus } });
		const summary = await adapter.getStorageSummary();

		res.json({ data: summary });
	} catch (err) {
		res.status(400).json({ error: err.message });
	}
});

export default router;
