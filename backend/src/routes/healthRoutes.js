import { Router } from 'express';
import { redactEnv } from '../config/env.js';
import { getAuthSummary } from '../services/authService.js';
import { requireAppUser } from '../middleware/authMiddleware.js';
import { getLastSyncReport, runDeltaSync } from '../services/syncService.js';
import { checkAccount, getHealthStatus } from '../services/healthCheckService.js';
import { getAccountById } from '../services/accountService.js';

const router = Router();

router.get('/health', (req, res) => {
	res.json({
		status: 'ok',
		service: 'cloudhub-api',
		config: redactEnv(),
		auth: getAuthSummary(req.user),
		sync: getLastSyncReport(),
		timestamp: new Date().toISOString(),
	});
});

router.post('/sync/run', requireAppUser, async (req, res, next) => {
	try {
		const report = await runDeltaSync(req.user.id);
		res.json({ data: report });
	} catch (error) {
		next(error);
	}
});

router.get('/health/accounts', requireAppUser, (req, res) => {
	const status = getHealthStatus(req.user.id);
	res.json({ data: status });
});

router.post('/health/check/:accountId', requireAppUser, async (req, res, next) => {
	try {
		const account = getAccountById(req.user.id, req.params.accountId);
		if (!account) {
			return res.status(404).json({ error: 'Account not found' });
		}

		const result = await checkAccount(account);
		res.json({ data: result });
	} catch (error) {
		next(error);
	}
});

export default router;
