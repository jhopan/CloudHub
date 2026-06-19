import { Router } from 'express';
import { db } from '../config/database.js';
import { listAccounts } from '../services/accountService.js';
import { requireAppUser } from '../middleware/authMiddleware.js';

const router = Router();

router.use(requireAppUser);

router.get('/hub/summary', (req, res) => {
	const accounts = listAccounts(req.user.id);

	const totalCapacity = accounts.reduce((sum, a) => sum + Number(a.total_space || 0), 0);
	const totalUsed = accounts.reduce((sum, a) => sum + Number(a.used_space || 0), 0);
	const totalFree = Math.max(0, totalCapacity - totalUsed);

	const providerMap = new Map();
	for (const account of accounts) {
		const type = account.provider;
		if (!providerMap.has(type)) {
			providerMap.set(type, { type, accounts: 0, capacity: 0, used: 0 });
		}
		const entry = providerMap.get(type);
		entry.accounts += 1;
		entry.capacity += Number(account.total_space || 0);
		entry.used += Number(account.used_space || 0);
	}

	res.json({
		data: {
			totalCapacity,
			totalUsed,
			totalFree,
			totalAccounts: accounts.length,
			providers: [...providerMap.values()],
		},
	});
});

router.get('/hub/files', (req, res) => {
	const rows = db
		.prepare(`
			SELECT
				fm.*, ca.provider, ca.email
			FROM file_metadata fm
			INNER JOIN cloud_accounts ca ON ca.id = fm.cloud_account_id
			WHERE fm.user_id = ?
				AND ca.status = 'active'
			ORDER BY fm.is_folder DESC, fm.file_name COLLATE NOCASE ASC
		`)
		.all(req.user.id);

	const files = rows.map((row) => ({
		...row,
		createdTime: row.remote_created_time || null,
		modifiedTime: row.remote_modified_time || null,
		capabilities: {
			starred: row.provider === 'google_drive',
			rename: true,
			delete: true,
		},
	}));

	res.json({ data: files });
});

export default router;
