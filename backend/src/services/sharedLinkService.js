import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../config/database.js';

function hashPassword(password) {
	return crypto.createHash('sha256').update(password).digest('hex');
}

export function createSharedLink(userId, fileMetadataId, expiresInHours = 24, password = null) {
	const file = db
		.prepare('SELECT * FROM file_metadata WHERE id = ? AND user_id = ?')
		.get(fileMetadataId, userId);

	if (!file) {
		throw new Error('File not found');
	}

	if (file.is_folder) {
		throw new Error('Shared links are not supported for folders');
	}

	const id = uuidv4();
	const token = uuidv4();
	const password_hash = password ? hashPassword(password) : null;
	const expires_at = expiresInHours
		? new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000).toISOString()
		: null;

	db.prepare(`
		INSERT INTO shared_links (id, user_id, file_metadata_id, token, password_hash, expires_at)
		VALUES (@id, @user_id, @file_metadata_id, @token, @password_hash, @expires_at)
	`).run({
		id,
		user_id: userId,
		file_metadata_id: fileMetadataId,
		token,
		password_hash,
		expires_at,
	});

	return getSharedLinkById(userId, id);
}

export function listSharedLinks(userId) {
	return db
		.prepare(`
			SELECT sl.*, fm.file_name, fm.mime_type, fm.size, fm.virtual_path
			FROM shared_links sl
			INNER JOIN file_metadata fm ON fm.id = sl.file_metadata_id
			WHERE sl.user_id = ?
			ORDER BY sl.created_at DESC
		`)
		.all(userId);
}

export function deleteSharedLink(userId, linkId) {
	const result = db
		.prepare('DELETE FROM shared_links WHERE id = ? AND user_id = ?')
		.run(linkId, userId);

	if (result.changes === 0) {
		throw new Error('Shared link not found');
	}
}

export function getSharedLink(token) {
	return db
		.prepare(`
			SELECT sl.*, fm.file_name, fm.mime_type, fm.size, fm.cloud_account_id,
			       fm.remote_file_id, fm.remote_parent_id, fm.user_id AS file_user_id,
			       fm.virtual_path, fm.is_folder
			FROM shared_links sl
			INNER JOIN file_metadata fm ON fm.id = sl.file_metadata_id
			WHERE sl.token = ?
		`)
		.get(token);
}

export function getSharedLinkById(userId, linkId) {
	return db
		.prepare(`
			SELECT sl.*, fm.file_name, fm.mime_type, fm.size, fm.virtual_path
			FROM shared_links sl
			INNER JOIN file_metadata fm ON fm.id = sl.file_metadata_id
			WHERE sl.id = ? AND sl.user_id = ?
		`)
		.get(linkId, userId);
}

export function validateAccess(token, password) {
	const link = getSharedLink(token);

	if (!link) {
		return { valid: false, error: 'Shared link not found' };
	}

	if (link.expires_at && new Date(link.expires_at) < new Date()) {
		return { valid: false, error: 'Shared link has expired' };
	}

	if (link.password_hash) {
		if (!password || hashPassword(password) !== link.password_hash) {
			return { valid: false, error: 'Invalid or missing password' };
		}
	}

	return { valid: true, link };
}

export function incrementDownloadCount(token) {
	db.prepare('UPDATE shared_links SET download_count = download_count + 1 WHERE token = ?').run(
		token,
	);
}
