import dropboxLogo from '../assets/dropbox.svg';
import googleDriveLogo from '../assets/google-drive.svg';
import megaLogo from '../assets/mega.svg';
import oneDriveLogo from '../assets/microsoft-onedrive.svg';
import pcloudLogo from '../assets/pcloud.svg';
import yandexLogo from '../assets/yandex-disk.svg';
import s3Logo from '../assets/s3-storage.svg';

const providerIconMap = {
	google_drive: googleDriveLogo,
	drive: googleDriveLogo,
	onedrive: oneDriveLogo,
	dropbox: dropboxLogo,
	mega: megaLogo,
	pcloud: pcloudLogo,
	yandex: yandexLogo,
	s3: s3Logo,
};

const providerEmojiMap = {
	google_drive: '🔵',
	drive: '🔵',
	onedrive: '🟦',
	dropbox: '🔷',
	mega: '🔴',
	s3: '🟠',
	pcloud: '🟣',
	yandex: '🟡',
	protondrive: '🟣',
	filen: '🟢',
	jottacloud: '🔵',
	seafile: '🟡',
	nextcloud: '🔵',
	box: '🔷',
	rclone: '⚙️',
};

const providerLabelMap = {
	google_drive: 'Google Drive',
	drive: 'Google Drive',
	onedrive: 'OneDrive',
	dropbox: 'Dropbox',
	mega: 'MEGA',
	pcloud: 'pCloud',
	yandex: 'Yandex Disk',
	s3: 'S3 Storage',
	protondrive: 'Proton Drive',
	filen: 'Filen',
	jottacloud: 'Jottacloud',
	seafile: 'Seafile',
	nextcloud: 'Nextcloud',
	box: 'Box',
	rclone: 'Rclone',
};

export function getProviderIcon(provider) {
	return providerIconMap[provider] || null;
}

export function getProviderEmoji(provider) {
	return providerEmojiMap[provider] || '⚙️';
}

export function getProviderLabel(provider) {
	return providerLabelMap[provider] || provider || 'Provider';
}
