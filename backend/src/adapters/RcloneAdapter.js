import { BaseCloudAdapter } from './BaseCloudAdapter.js';
import { decryptJson } from '../utils/crypto.js';
import * as rclone from '../services/rcloneService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a virtual path to always have a leading slash and a trailing slash
 * for directories. Mirrors the convention used by S3Adapter / PCloudAdapter.
 */
function normalizeVirtualPath(input = '/') {
	if (!input || input === '/') return '/';
	const prefixed = input.startsWith('/') ? input : `/${input}`;
	return prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
}

/**
 * Join a parent virtual path with a child name to produce a remote-side path
 * (no leading slash – rclone uses paths relative to the remote root).
 */
function toRemotePath(virtualPath = '/', name = '') {
	const folder = normalizeVirtualPath(virtualPath).replace(/^\/+/, '').replace(/\/+$/, '');
	if (!name) return folder;
	return folder ? `${folder}/${name}` : name;
}

/**
 * Convert an rclone remote path back into a virtual path (with leading /).
 */
function remotePathToVirtual(remotePath = '') {
	if (!remotePath) return '/';
	return `/${remotePath}/`;
}

/**
 * Extract the file/folder name from an rclone remote path.
 */
function remotePathToName(remotePath = '') {
	if (!remotePath) return '';
	const trimmed = remotePath.replace(/\/+$/, '');
	const idx = trimmed.lastIndexOf('/');
	return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

/**
 * Convert an rclone timestamp (ISO-8601 string or epoch millis) to ISO string.
 */
function toIso(value) {
	if (!value) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class RcloneAdapter extends BaseCloudAdapter {
	constructor(account) {
		super(account);
		this._creds = null;
	}

	/**
	 * Lazy-decrypt and cache the account credentials.
	 * Expected shape:
	 *   {
	 *     rclone_remote: "cloudhub_42",
	 *     type: "webdav",
	 *     vendor: "nextcloud",
	 *     url: "https://...",
	 *     user: "admin",
	 *     pass: "...",
	 *     ...any other rclone backend params
	 *   }
	 */
	readCredentials() {
		if (this._creds) return this._creds;

		const credentials = decryptJson(this.account.encrypted_credentials);
		if (!credentials.rclone_remote) {
			throw new Error('RcloneAdapter: credentials missing rclone_remote name');
		}
		if (!credentials.type) {
			throw new Error('RcloneAdapter: credentials missing backend type');
		}

		this._creds = credentials;
		return this._creds;
	}

	/** The rclone remote name for this account. */
	get remoteName() {
		return this.readCredentials().rclone_remote;
	}

	/**
	 * Ensure the rclone remote exists in the project config file.
	 * Creates it from the stored credentials if it hasn't been set up yet.
	 */
	async ensureRemote() {
		const creds = this.readCredentials();
		const existing = await rclone.listRemotes();

		if (existing.includes(creds.rclone_remote)) return;

		// Extract config params (everything except our meta keys)
		const { rclone_remote, type, ...params } = creds;
		await rclone.configCreate(rclone_remote, type, params);
	}

	// -----------------------------------------------------------------------
	// Capabilities
	// -----------------------------------------------------------------------

	getCapabilities() {
		return {
			starred: false,
			rename: true,
			delete: true,
		};
	}

	// -----------------------------------------------------------------------
	// Directory structure
	// -----------------------------------------------------------------------

	/**
	 * Fetch the full directory tree from the rclone remote and map it into
	 * the CloudHub flat record format used by every other adapter.
	 */
	async fetchStructure() {
		await this.ensureRemote();

		const entries = await rclone.lsjson(this.remoteName, '', { recurse: true });
		const records = [];

		for (const entry of entries) {
			const isFolder = Boolean(entry.IsDir);
			const remotePath = entry.Path || '';

			// Build the virtual_path (parent directory in virtual filesystem)
			const virtualPath = isFolder
				? remotePathToVirtual(remotePath.replace(/\/?[^/]+$/, ''))
				: remotePathToVirtual(remotePath.replace(/\/?[^/]+$/, ''));

			// For items at root, virtual_path should be '/'
			const slashCount = (remotePath.match(/\//g) || []).length;
			const parentPath = slashCount === 0
				? '/'
				: `/${remotePath.split('/').slice(0, -1).join('/')}/`;

			records.push({
				virtual_path: normalizeVirtualPath(parentPath),
				file_name: entry.Name || remotePathToName(remotePath),
				is_folder: isFolder,
				size: isFolder ? 0 : Number(entry.Size || 0),
				mime_type: isFolder ? null : (entry.MimeType || 'application/octet-stream'),
				remote_file_id: remotePath,
				remote_parent_id: normalizeVirtualPath(parentPath),
				remote_created_time: null, // lsjson doesn't always return creation time
				remote_modified_time: toIso(entry.ModTime),
			});
		}

		return records;
	}

	// -----------------------------------------------------------------------
	// Storage summary
	// -----------------------------------------------------------------------

	async getStorageSummary() {
		await this.ensureRemote();

		try {
			const info = await rclone.about(this.remoteName);
			return {
				totalSpace: info.total || Number(this.account.total_space || 0),
				usedSpace: info.used || Number(this.account.used_space || 0),
			};
		} catch {
			// Some backends (e.g. sftp, local) don't support `about`.
			// Fall back to stored values.
			return {
				totalSpace: Number(this.account.total_space || 0),
				usedSpace: Number(this.account.used_space || 0),
			};
		}
	}

	// -----------------------------------------------------------------------
	// Upload
	// -----------------------------------------------------------------------

	async uploadStream({ stream, size, fileName, mimeType, virtualPath = '/', remoteParentId, onProgress }) {
		await this.ensureRemote();

		const remotePath = toRemotePath(virtualPath, fileName);

		// Wrap the input stream with our progress-tracking transform
		const progressStream = this.createProgressStream(onProgress);
		const pipedStream = stream.pipe(progressStream);

		await rclone.rcat(this.remoteName, remotePath, pipedStream, {
			onProgress,
		});

		return {
			remoteFileId: remotePath,
			remoteParentId: remoteParentId || normalizeVirtualPath(virtualPath),
			size: Number(size || 0),
			fileName,
			mimeType,
		};
	}

	// -----------------------------------------------------------------------
	// Download
	// -----------------------------------------------------------------------

	async getDownloadStream(fileRecord) {
		await this.ensureRemote();

		const remotePath = fileRecord.remote_file_id || toRemotePath(fileRecord.virtual_path, fileRecord.file_name);
		return rclone.cat(this.remoteName, remotePath);
	}

	// -----------------------------------------------------------------------
	// Folder creation
	// -----------------------------------------------------------------------

	async createFolder({ name, virtualPath = '/', remoteParentId }) {
		await this.ensureRemote();

		const remotePath = toRemotePath(virtualPath, name);
		await rclone.mkdir(this.remoteName, remotePath);

		return {
			remoteFileId: remotePath,
			remoteParentId: remoteParentId || normalizeVirtualPath(virtualPath),
			fileName: name,
		};
	}

	// -----------------------------------------------------------------------
	// Rename / move
	// -----------------------------------------------------------------------

	async renameFile(fileRecord, nextName) {
		await this.ensureRemote();

		const oldPath = fileRecord.remote_file_id || toRemotePath(fileRecord.virtual_path, fileRecord.file_name);
		const dirPart = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : '';
		const newPath = dirPart ? `${dirPart}/${nextName}` : nextName;

		await rclone.moveto(this.remoteName, oldPath, newPath);
	}

	// -----------------------------------------------------------------------
	// Delete
	// -----------------------------------------------------------------------

	async deleteFile(fileRecord) {
		await this.ensureRemote();

		const remotePath = fileRecord.remote_file_id || toRemotePath(fileRecord.virtual_path, fileRecord.file_name);

		if (fileRecord.is_folder) {
			await rclone.purge(this.remoteName, remotePath);
		} else {
			await rclone.deleteFile(this.remoteName, remotePath);
		}
	}

	// -----------------------------------------------------------------------
	// File details
	// -----------------------------------------------------------------------

	async getFileDetails(fileRecord) {
		return {
			name: fileRecord.file_name,
			mime_type: fileRecord.mime_type,
			size: Number(fileRecord.size || 0),
			virtual_path: fileRecord.virtual_path,
			remote_file_id: fileRecord.remote_file_id,
			provider: this.account.provider,
			owner_email: this.account.email,
			createdTime: fileRecord.remote_created_time,
			modifiedTime: fileRecord.remote_modified_time,
		};
	}
}
