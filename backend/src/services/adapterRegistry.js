import { GoogleDriveAdapter } from '../adapters/GoogleDriveAdapter.js';
import { OneDriveAdapter } from '../adapters/OneDriveAdapter.js';
import { DropboxAdapter } from '../adapters/DropboxAdapter.js';
import { MegaAdapter } from '../adapters/MegaAdapter.js';
import { S3Adapter } from '../adapters/S3Adapter.js';
import { PCloudAdapter } from '../adapters/PCloudAdapter.js';
import { YandexAdapter } from '../adapters/YandexAdapter.js';
import { RcloneAdapter } from '../adapters/RcloneAdapter.js';

const adapters = {
	google_drive: GoogleDriveAdapter,
	onedrive: OneDriveAdapter,
	dropbox: DropboxAdapter,
	mega: MegaAdapter,
	s3: S3Adapter,
	pcloud: PCloudAdapter,
	yandex: YandexAdapter,
	rclone: RcloneAdapter,
};

export function createAdapter(account) {
	const Adapter = adapters[account.provider];

	if (Adapter) {
		return new Adapter(account);
	}

	// Fallback: if no dedicated adapter exists for this provider, use the
	// generic RcloneAdapter which can talk to any of rclone's 128+ backends
	// as long as the account credentials include a configured rclone remote.
	return new RcloneAdapter(account);
}
