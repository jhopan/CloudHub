import { BaseCloudAdapter } from './BaseCloudAdapter.js';
import { createReadStream, statSync } from 'fs';
import { Readable } from 'stream';

let TeraBoxApp;

async function loadTeraBox() {
	if (!TeraBoxApp) {
		const mod = await import('terabox-api');
		TeraBoxApp = mod.TeraBoxApp;
	}
	return TeraBoxApp;
}

export class TeraBoxAdapter extends BaseCloudAdapter {
	constructor(account) {
		super(account);
		this.app = null;
	}

	async _init() {
		if (this.app) return this.app;
		const AppClass = await loadTeraBox();
		const creds = this.account.credentials || {};
		const ndus = creds.ndus || creds.cookie;
		if (!ndus) throw new Error('TeraBox: missing ndus cookie');
		this.app = new AppClass(ndus, 'ndus');
		await this.app.updateAppData();
		return this.app;
	}

	async getStorageSummary() {
		const app = await this._init();
		try {
			const quota = await app.getQuota();
			return {
				totalSpace: Number(quota?.total || this.account.total_space || 0),
				usedSpace: Number(quota?.used || this.account.used_space || 0),
			};
		} catch {
			return super.getStorageSummary();
		}
	}

	async fetchStructure(parentPath = '/') {
		const app = await this._init();
		const result = await app.getRemoteDir(parentPath);
		if (!result || !result.list) return [];

		return result.list.map(item => ({
			id: String(item.fs_id),
			name: item.server_filename,
			size: item.size || 0,
			isDir: !!item.isdir,
			mimeType: item.isdir ? 'folder' : guessMime(item.server_filename),
			modifiedAt: new Date((item.server_mtime || 0) * 1000).toISOString(),
			path: item.path,
		}));
	}

	async downloadStream(remotePath) {
		const app = await this._init();

		// First, find the file to get its fs_id
		const dir = remotePath.substring(0, remotePath.lastIndexOf('/')) || '/';
		const listing = await app.getRemoteDir(dir);
		const fileName = remotePath.split('/').pop();
		const file = listing?.list?.find(f => f.server_filename === fileName && !f.isdir);

		if (!file) throw new Error('TeraBox: file not found');

		// Get download link using fs_id
		const dlResult = await app.download([file.fs_id]);
		if (!dlResult?.dlink?.length) throw new Error('TeraBox: no download link');

		const dlink = dlResult.dlink[0].dlink;
		const resp = await fetch(dlink, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Cookie': `ndus=${this.account.credentials.ndus}; PANWEB=1`,
				'Referer': 'https://www.terabox.com/',
			},
			redirect: 'follow',
		});

		if (!resp.ok) throw new Error(`TeraBox download failed: ${resp.status}`);
		return {
			stream: Readable.fromWeb(resp.body),
			size: file.size,
			mimeType: guessMime(file.server_filename),
		};
	}

	async uploadStream({ stream, size, fileName, virtualPath, onProgress }) {
		const app = await this._init();
		const remotePath = virtualPath || `/${fileName}`;

		// Collect stream into buffer
		const chunks = [];
		for await (const chunk of stream) chunks.push(chunk);
		const buffer = Buffer.concat(chunks);

		// Use the helper upload flow
		const { createHash, createHashFromBuffer } = await import('terabox-api/helper');

		const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
		const blockList = [];
		const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);

		// Hash each chunk
		for (let i = 0; i < totalChunks; i++) {
			const start = i * CHUNK_SIZE;
			const end = Math.min(start + CHUNK_SIZE, buffer.length);
			const chunk = buffer.subarray(start, end);
			const md5 = createHash('md5', chunk);
			blockList.push(md5);
		}

		const fullMd5 = createHash('md5', buffer);
		const sliceMd5 = createHash('md5', buffer.subarray(0, Math.min(256 * 1024, buffer.length)));

		// Step 1: Precreate
		const pre = await app.precreateFile({
			path: remotePath,
			size: buffer.length,
			isdir: 0,
			block_list: JSON.stringify(blockList),
			content_md5: fullMd5,
			slice_md5: sliceMd5,
		});

		// Rapid upload: file already exists on server
		if (pre.return_type === 2) {
			return { path: remotePath, size: buffer.length, rapid: true };
		}

		const uploadId = pre.uploadid;

		// Step 2: Upload chunks
		for (let i = 0; i < totalChunks; i++) {
			const start = i * CHUNK_SIZE;
			const end = Math.min(start + CHUNK_SIZE, buffer.length);
			const chunk = buffer.subarray(start, end);
			await app.uploadChunk(
				{ uploadid, path: remotePath },
				i,
				new Blob([chunk])
			);
			if (onProgress) onProgress(end);
		}

		// Step 3: Finalize
		const result = await app.createFile({
			path: remotePath,
			size: buffer.length,
			uploadid: uploadId,
			block_list: JSON.stringify(blockList),
		});

		return { path: remotePath, size: buffer.length, fsId: result?.fs_id };
	}

	async deleteFile(remotePath) {
		const app = await this._init();
		await app.filemanager('delete', [remotePath]);
		return { success: true };
	}

	async renameFile(remotePath, newName) {
		const app = await this._init();
		await app.filemanager('rename', [{ path: remotePath, newname: newName }]);
		return { success: true };
	}

	async mkdir(remotePath) {
		const app = await this._init();
		await app.createDir(remotePath);
		return { success: true };
	}

	async search(keyword) {
		const app = await this._init();
		const result = await app.search(keyword);
		if (!result?.list) return [];
		return result.list.map(item => ({
			id: String(item.fs_id),
			name: item.server_filename,
			size: item.size || 0,
			isDir: !!item.isdir,
			path: item.path,
		}));
	}

	async createShare(paths, password, periodDays) {
		const app = await this._init();
		const result = await app.shareSet(paths, password, periodDays);
		return result;
	}
}

function guessMime(filename) {
	const ext = filename?.split('.').pop()?.toLowerCase();
	const map = {
		mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
		mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
		jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
		pdf: 'application/pdf', zip: 'application/zip', rar: 'application/x-rar',
		doc: 'application/msword', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		txt: 'text/plain', json: 'application/json', js: 'text/javascript',
	};
	return map[ext] || 'application/octet-stream';
}
