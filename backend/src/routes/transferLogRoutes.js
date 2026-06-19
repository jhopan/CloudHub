import { Router } from 'express';
import { requireAppUser } from '../middleware/authMiddleware.js';
import { listTransfers, getTransferStats } from '../services/transferLogService.js';

const router = Router();

router.use(requireAppUser);

/**
 * GET /api/transfers
 * Paginated list of transfer logs with optional filters.
 *
 * Query params:
 *   - page   (default 1)
 *   - limit  (default 25, max 100)
 *   - action (upload | download | delete | rename | move | mkdir)
 *   - status (success | failed | retry)
 */
router.get('/transfers', (req, res, next) => {
	try {
		const { page, limit, action, status } = req.query;
		const result = listTransfers(req.user.id, {
			page: page ? Number(page) : undefined,
			limit: limit ? Number(limit) : undefined,
			action,
			status,
		});
		res.json(result);
	} catch (error) {
		next(error);
	}
});

/**
 * GET /api/transfers/stats
 * Aggregate statistics: total uploads, downloads, deletes, errors, bandwidth.
 */
router.get('/transfers/stats', (req, res, next) => {
	try {
		const stats = getTransferStats(req.user.id);
		res.json({ data: stats });
	} catch (error) {
		next(error);
	}
});

export default router;
