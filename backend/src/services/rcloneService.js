import { spawn, execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Per-project rclone config file. Keeps rclone remotes isolated from the
 * user's personal ~/.config/rclone/rclone.conf so CloudHub can manage its
 * own remotes without side-effects.
 */
const RCLONE_CONFIG = path.resolve(__dirname, '../../cloudhub-rclone.conf');

/** Default timeout for most rclone commands (ms). */
const DEFAULT_TIMEOUT = 60_000;

/** Longer timeout for uploads / large transfers (ms). */
const UPLOAD_TIMEOUT = 300_000;

// Ensure the config file exists so rclone doesn't complain.
if (!fs.existsSync(RCLONE_CONFIG)) {
	fs.writeFileSync(RCLONE_CONFIG, '', { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the base args that every rclone invocation needs.
 */
function baseArgs() {
	return ['--config', RCLONE_CONFIG];
}

/**
 * Parse stderr output from rclone into a human-friendly error message.
 * rclone sometimes wraps errors in multiple lines; we grab the first
 * meaningful line that looks like an error.
 */
function parseRcloneError(stderr) {
	if (!stderr) return 'rclone command failed (no error details)';

	const lines = stderr
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

	// Prefer lines that explicitly say "error" or "failed"
	const errorLine =
		lines.find((l) => /^error/i.test(l) || /failed/i.test(l)) ||
		lines.find((l) => !l.startsWith('INFO')) ||
		lines[0];

	return errorLine;
}

// ---------------------------------------------------------------------------
// Core execution
// ---------------------------------------------------------------------------

/**
 * Execute an rclone command and return stdout as a string.
 *
 * @param {string[]} args       - rclone sub-command + flags (e.g. ['lsjson', 'remote:/path'])
 * @param {object}   [options]
 * @param {number}   [options.timeout]  - Kill after this many ms (default 60 000).
 * @param {boolean}  [options.json]     - If true, parse stdout as JSON before returning.
 * @returns {Promise<string|object>}
 */
export function execRclone(args, options = {}) {
	const { timeout = DEFAULT_TIMEOUT, json = false } = options;

	return new Promise((resolve, reject) => {
		const fullArgs = [...args, ...baseArgs()];

		const child = execFile('rclone', fullArgs, { timeout, maxBuffer: 100 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (error) {
				const message = parseRcloneError(stderr);
				const wrapped = new Error(`rclone ${args[0]} failed: ${message}`);
				wrapped.exitCode = error.code;
				wrapped.stderr = stderr;
				return reject(wrapped);
			}

			if (json) {
				try {
					return resolve(JSON.parse(stdout));
				} catch (parseErr) {
					return reject(new Error(`rclone ${args[0]} returned invalid JSON: ${parseErr.message}`));
				}
			}

			return resolve(stdout);
		});

		// Safety: ensure the child doesn't keep the event loop alive if we time out
		child.on('error', (err) => reject(err));
	});
}

// ---------------------------------------------------------------------------
// File listing
// ---------------------------------------------------------------------------

/**
 * List files/directories at a remote path using `rclone lsjson`.
 *
 * @param {string} remote  - rclone remote name (e.g. "cloudhub_42")
 * @param {string} [remotePath=''] - Path on the remote (e.g. "Documents/reports")
 * @param {object} [options]
 * @param {boolean} [options.recurse] - Recursively list all children.
 * @returns {Promise<Array>} Array of rclone lsjson entries.
 */
export async function lsjson(remote, remotePath = '', options = {}) {
	const { recurse = false } = options;
	const target = remotePath ? `${remote}:${remotePath}` : `${remote}:`;
	const args = ['lsjson', target, '--fast-list'];

	if (recurse) {
		args.push('--recursive');
	}

	return execRclone(args, { json: true });
}

// ---------------------------------------------------------------------------
// Storage quota
// ---------------------------------------------------------------------------

/**
 * Get storage quota information using `rclone about --json`.
 *
 * @param {string} remote - rclone remote name
 * @returns {Promise<{total: number, used: number, free: number}>}
 */
export async function about(remote) {
	const result = await execRclone(['about', `${remote}:`, '--json'], { json: true });

	return {
		total: Number(result.total || 0),
		used: Number(result.used || 0),
		free: Number(result.free || result.trashed || 0),
	};
}

// ---------------------------------------------------------------------------
// Upload (stdin → remote)
// ---------------------------------------------------------------------------

/**
 * Upload data from a readable stream to a remote path using `rclone rcat`.
 *
 * @param {string}   remote     - rclone remote name
 * @param {string}   remotePath - Destination path on the remote
 * @param {import('stream').Readable} stream - Readable stream to pipe
 * @param {object}   [options]
 * @param {number}   [options.timeout]
 * @param {function} [options.onProgress] - Called with bytes transferred so far.
 * @returns {Promise<void>}
 */
export function rcat(remote, remotePath, stream, options = {}) {
	const { timeout = UPLOAD_TIMEOUT, onProgress } = options;
	const target = `${remote}:${remotePath}`;
	const args = ['rcat', target, ...baseArgs(), '--stats', '1s', '--stats-one-line', '-v'];

	return new Promise((resolve, reject) => {
		const child = spawn('rclone', args, { timeout, stdio: ['pipe', 'pipe', 'pipe'] });

		let stderr = '';
		let lastBytes = 0;

		child.stderr.on('data', (chunk) => {
			const text = chunk.toString();
			stderr += text;

			// Parse rclone progress lines like: "Transferred:   12.345 MiB / 100 MiB, 12%, ..."
			if (onProgress) {
				const match = text.match(/Transferred:\s+([\d.]+)\s*(\w+)/i);
				if (match) {
					const value = parseFloat(match[1]);
					const unit = match[2].toLowerCase();
					let bytes;
					if (unit.startsWith('kib') || unit.startsWith('kb')) bytes = value * 1024;
					else if (unit.startsWith('mib') || unit.startsWith('mb')) bytes = value * 1024 * 1024;
					else if (unit.startsWith('gib') || unit.startsWith('gb')) bytes = value * 1024 * 1024 * 1024;
					else bytes = value; // assume bytes
					lastBytes = Math.max(lastBytes, Math.round(bytes));
					onProgress(lastBytes);
				}
			}
		});

		child.stdout.on('data', () => {
			// rcat doesn't normally write to stdout; swallow it.
		});

		child.on('error', (err) => reject(err));

		child.on('close', (code) => {
			if (code !== 0) {
				const message = parseRcloneError(stderr);
				const err = new Error(`rclone rcat failed (exit ${code}): ${message}`);
				err.exitCode = code;
				err.stderr = stderr;
				return reject(err);
			}
			return resolve();
		});

		stream.on('error', (err) => {
			child.kill('SIGTERM');
			reject(err);
		});

		stream.pipe(child.stdin);
	});
}

// ---------------------------------------------------------------------------
// Download (remote → stdout)
// ---------------------------------------------------------------------------

/**
 * Download a file from a remote path using `rclone cat`.
 * Returns a Node.js Readable stream of the file contents.
 *
 * @param {string} remote     - rclone remote name
 * @param {string} remotePath - Path on the remote
 * @param {object} [options]
 * @param {number} [options.timeout]
 * @returns {import('stream').Readable}
 */
export function cat(remote, remotePath, options = {}) {
	const { timeout = UPLOAD_TIMEOUT } = options;
	const target = `${remote}:${remotePath}`;
	const args = ['cat', target, ...baseArgs()];

	const child = spawn('rclone', args, { timeout, stdio: ['ignore', 'pipe', 'pipe'] });

	let stderr = '';
	child.stderr.on('data', (chunk) => {
		stderr += chunk.toString();
	});

	child.on('close', (code) => {
		if (code !== 0 && !child.stdout.destroyed) {
			const message = parseRcloneError(stderr);
			child.stdout.destroy(new Error(`rclone cat failed (exit ${code}): ${message}`));
		}
	});

	child.on('error', (err) => {
		if (!child.stdout.destroyed) child.stdout.destroy(err);
	});

	return child.stdout;
}

// ---------------------------------------------------------------------------
// Directory operations
// ---------------------------------------------------------------------------

/**
 * Create a directory on the remote.
 *
 * @param {string} remote     - rclone remote name
 * @param {string} remotePath - Directory path to create
 */
export async function mkdir(remote, remotePath) {
	const target = `${remote}:${remotePath}`;
	await execRclone(['mkdir', target]);
}

/**
 * Delete a single file on the remote.
 *
 * @param {string} remote     - rclone remote name
 * @param {string} remotePath - File path to delete
 */
export async function deleteFile(remote, remotePath) {
	const target = `${remote}:${remotePath}`;
	await execRclone(['delete', target]);
}

/**
 * Delete a directory and all its contents recursively.
 *
 * @param {string} remote     - rclone remote name
 * @param {string} remotePath - Directory path to purge
 */
export async function purge(remote, remotePath) {
	const target = `${remote}:${remotePath}`;
	await execRclone(['purge', target]);
}

// ---------------------------------------------------------------------------
// Move / rename
// ---------------------------------------------------------------------------

/**
 * Move (rename) a file or directory on the remote.
 *
 * @param {string} remote  - rclone remote name
 * @param {string} oldPath - Source path
 * @param {string} newPath - Destination path
 */
export async function moveto(remote, oldPath, newPath) {
	const source = `${remote}:${oldPath}`;
	const dest = `${remote}:${newPath}`;
	await execRclone(['moveto', source, dest]);
}

// ---------------------------------------------------------------------------
// Remote configuration management
// ---------------------------------------------------------------------------

/**
 * Create (or overwrite) an rclone remote in the project config file.
 *
 * @param {string} name   - Remote name (e.g. "cloudhub_42")
 * @param {string} type   - Backend type (e.g. "webdav", "s3", "drive")
 * @param {object} params - Key-value config parameters for the backend.
 */
export async function configCreate(name, type, params = {}) {
	// Build args: rclone config create <name> <type> [key=value ...]
	const kvArgs = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== null && v !== '')
		.map(([k, v]) => `${k}=${v}`);

	await execRclone(['config', 'create', name, type, ...kvArgs]);
}

/**
 * Delete an rclone remote from the project config file.
 *
 * @param {string} name - Remote name to delete
 */
export async function configDelete(name) {
	await execRclone(['config', 'delete', name]);
}

/**
 * List all configured remotes in the project config file.
 *
 * @returns {Promise<string[]>} Array of remote names (without trailing colon).
 */
export async function listRemotes() {
	const output = await execRclone(['listremotes']);

	// `rclone listremotes` prints each remote name followed by a colon, e.g.:
	//   myremote:
	//   otherremote:
	return output
		.split('\n')
		.map((line) => line.trim().replace(/:$/, ''))
		.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export { RCLONE_CONFIG, DEFAULT_TIMEOUT, UPLOAD_TIMEOUT };
