import { randomUUID } from 'crypto';
import { db } from '../config/database.js';

const VALID_ACTIONS = new Set(['upload', 'download', 'delete', 'rename', 'move', 'mkdir']);
const VALID_STATUSES = new Set(['success', 'failed', 'retry']);

/**
 * Insert a transfer log entry.
 *
 * @param {object}   params
 * @param {string}   params.userId        – owner of the operation
 * @param {string}   [params.accountId]   – cloud account involved
 * @param {string}   params.action        – one of: upload, download, delete, rename, move, mkdir
 * @param {string}   [params.fileName]    – name of the file / folder
 * @param {number}   [params.fileSize]    – size in bytes (default 0)
 * @param {string}   [params.status]      – success | failed | retry (default 'success')
 * @param {string}   [params.errorMessage] – error detail when status is 'failed'
 * @returns {object} the inserted row
 */
export function logTransfer({
	userId,
	accountId = null,
	action,
	fileName = null,
	fileSize = 0,
	status = 'success',
	errorMessage = null,
}) {
	if (!userId) throw new Error('userId is required');
	if (!VALID_ACTIONS.has(action)) throw new Error(`Invalid action: ${action}`);
	if (!VALID_STATUSES.has(status)) throw new Error(`Invalid status: ${status}`);

	const id = randomUUID();

	db.prepare(`
		INSERT INTO transfer_logs (id, user_id, cloud_account_id, action, file_name, file_size, status, error_message)
		VALUES (@id, @userId, @accountId, @action, @fileName, @fileSize, @status, @errorMessage)
	`).run({
		id,
		userId,
		accountId,
		action,
		fileName,
		fileSize: Number(fileSize) || 0,
		status,
		errorMessage,
	});

	return { id, user_id: userId, action, file_name: fileName, file_size: fileSize, status };
}

/**
 * Paginated list of transfer logs with optional filters.
 *
 * @param {string} userId
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=25]
 * @param {string} [options.action]  – filter by action type
 * @param {string} [options.status]  – filter by status
 * @returns {{ data: object[], pagination: object }}
 */
export function listTransfers(userId, { page = 1, limit = 25, action, status } = {}) {
	const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
	const safePage = Math.max(Number(page) || 1, 1);
	const offset = (safePage - 1) * safeLimit;

	const conditions = ['user_id = ?'];
	const params = [userId];

	if (action && VALID_ACTIONS.has(action)) {
		conditions.push('action = ?');
		params.push(action);
	}

	if (status && VALID_STATUSES.has(status)) {
		conditions.push('status = ?');
		params.push(status);
	}

	const whereClause = conditions.join(' AND ');

	const total = db
		.prepare(`SELECT COUNT(*) AS count FROM transfer_logs WHERE ${whereClause}`)
		.get(...params).count;

	const data = db
		.prepare(`
			SELECT * FROM transfer_logs
			WHERE ${whereClause}
			ORDER BY created_at DESC
			LIMIT ? OFFSET ?
		`)
		.all(...params, safeLimit, offset);

	return {
		data,
		pagination: {
			page: safePage,
			limit: safeLimit,
			total,
			totalPages: Math.ceil(total / safeLimit),
		},
	};
}

/**
 * Aggregate transfer statistics for a user.
 *
 * @param {string} userId
 * @returns {{ totalTransfers, uploads, downloads, deletes, errors, totalBandwidth, byAction, recentErrors }}
 */
export function getTransferStats(userId) {
	const byAction = db
		.prepare(`
			SELECT
				action,
				status,
				COUNT(*) AS count,
				COALESCE(SUM(file_size), 0) AS total_bytes
			FROM transfer_logs
			WHERE user_id = ?
			GROUP BY action, status
		`)
		.all(userId);

	let totalTransfers = 0;
	let uploads = 0;
	let downloads = 0;
	let deletes = 0;
	let errors = 0;
	let totalBandwidth = 0;

	const actionMap = {};

	for (const row of byAction) {
		totalTransfers += row.count;

		if (row.status === 'failed') {
			errors += row.count;
		}

		if (row.status === 'success') {
			totalBandwidth += row.total_bytes;
		}

		if (!actionMap[row.action]) {
			actionMap[row.action] = { success: 0, failed: 0, retry: 0, total_bytes: 0 };
		}
		actionMap[row.action][row.status] = row.count;
		actionMap[row.action].total_bytes += row.total_bytes;

		if (row.action === 'upload' && row.status === 'success') uploads += row.count;
		if (row.action === 'download' && row.status === 'success') downloads += row.count;
		if (row.action === 'delete' && row.status === 'success') deletes += row.count;
	}

	const recentErrors = db
		.prepare(`
			SELECT * FROM transfer_logs
			WHERE user_id = ? AND status = 'failed'
			ORDER BY created_at DESC
			LIMIT 5
		`)
		.all(userId);

	return {
		totalTransfers,
		uploads,
		downloads,
		deletes,
		errors,
		totalBandwidth,
		byAction: actionMap,
		recentErrors,
	};
}

/**
 * Delete transfer logs older than the specified number of days.
 *
 * @param {number} daysToKeep – keep logs newer than this many days (default 90)
 * @returns {{ deleted: number }}
 */
export function cleanupOldLogs(daysToKeep = 90) {
	const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

	const result = db
		.prepare('DELETE FROM transfer_logs WHERE created_at < ?')
		.run(cutoff);

	return { deleted: result.changes };
}
