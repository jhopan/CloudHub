import { Router } from 'express';
import { requireAppUser } from '../middleware/authMiddleware.js';
import {
	createSharedLink,
	listSharedLinks,
	deleteSharedLink,
	validateAccess,
	incrementDownloadCount,
} from '../services/sharedLinkService.js';
import { getAccountById } from '../services/accountService.js';
import { createAdapter } from '../services/adapterRegistry.js';

const router = Router();

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

router.post('/shared-links', requireAppUser, (req, res, next) => {
	try {
		const { file_metadata_id, expires_in_hours, password } = req.body || {};

		if (!file_metadata_id) {
			return res.status(400).json({ error: 'file_metadata_id is required' });
		}

		const link = createSharedLink(
			req.user.id,
			file_metadata_id,
			expires_in_hours,
			password || null,
		);

		return res.status(201).json({ data: link });
	} catch (error) {
		next(error);
	}
});

router.get('/shared-links', requireAppUser, (req, res, next) => {
	try {
		const links = listSharedLinks(req.user.id);
		return res.json({ data: links });
	} catch (error) {
		next(error);
	}
});

router.delete('/shared-links/:id', requireAppUser, (req, res, next) => {
	try {
		deleteSharedLink(req.user.id, req.params.id);
		return res.json({ data: { success: true } });
	} catch (error) {
		next(error);
	}
});

// ---------------------------------------------------------------------------
// Public route – NO authentication required
// ---------------------------------------------------------------------------

router.get('/public/:token', async (req, res, next) => {
	try {
		const { token } = req.params;
		const password = req.query.password || null;

		const { valid, error, link } = validateAccess(token, password);
		if (!valid) {
			return res.status(403).json({ error });
		}

		const account = getAccountById(link.file_user_id, link.cloud_account_id);
		if (!account || account.status !== 'active') {
			return res.status(409).json({ error: 'The file account is no longer connected' });
		}

		const adapter = createAdapter(account);
		const file = {
			id: link.file_metadata_id,
			file_name: link.file_name,
			mime_type: link.mime_type,
			size: link.size,
			cloud_account_id: link.cloud_account_id,
			remote_file_id: link.remote_file_id,
			remote_parent_id: link.remote_parent_id,
			virtual_path: link.virtual_path,
			is_folder: link.is_folder,
		};

		const stream = await adapter.getDownloadStream(file);

		res.setHeader('Content-Disposition', `attachment; filename="${link.file_name}"`);
		res.setHeader('Content-Type', link.mime_type || 'application/octet-stream');
		if (link.size) {
			res.setHeader('Content-Length', String(link.size));
		}

		incrementDownloadCount(token);
		stream.pipe(res);
	} catch (error) {
		next(error);
	}
});

export default router;
