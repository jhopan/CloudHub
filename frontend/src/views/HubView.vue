<script setup>
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import {
	IconCloudUpload,
	IconFolderPlus,
	IconRefresh,
	IconFileDescription,
	IconFolder,
} from '@tabler/icons-vue';
import DriveShell from '../components/DriveShell.vue';
import TruncateMarquee from '../components/TruncateMarquee.vue';
import { useAccountManagementStore } from '../stores/accountManagement';
import { getProviderIcon, getProviderEmoji, getProviderLabel } from '../utils/providerIcons';
import { api } from '../services/api';

const { t } = useI18n();
const accountStore = useAccountManagementStore();
const { accounts } = storeToRefs(accountStore);

const hubSummary = ref(null);
const hubFiles = ref([]);
const isLoadingSummary = ref(false);
const isLoadingFiles = ref(false);
const isRefreshing = ref(false);

const totalCapacity = computed(() => hubSummary.value?.totalCapacity || 0);
const totalUsed = computed(() => hubSummary.value?.totalUsed || 0);
const totalFree = computed(() => hubSummary.value?.totalFree || 0);
const totalAccounts = computed(() => hubSummary.value?.totalAccounts || 0);
const usagePercent = computed(() => {
	if (!totalCapacity.value) return 0;
	return Math.min(100, (totalUsed.value / totalCapacity.value) * 100);
});

const recentHubFiles = computed(() => hubFiles.value.filter((f) => !f.is_folder).slice(0, 8));

function formatBytes(value) {
	if (!value) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let amount = Number(value);
	let index = 0;
	while (amount >= 1024 && index < units.length - 1) {
		amount /= 1024;
		index += 1;
	}
	return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function getAccountUsagePercent(account) {
	const total = Number(account.total_space || 0);
	if (!total) return 0;
	return Math.min(100, (Number(account.used_space || 0) / total) * 100);
}

function formatDate(value) {
	if (!value) return '—';
	return new Intl.DateTimeFormat('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(new Date(value));
}

async function loadHubSummary() {
	isLoadingSummary.value = true;
	try {
		const { data } = await api.getHubSummary();
		hubSummary.value = data;
	} catch (error) {
		console.error('Failed to load HUB summary:', error.message);
	} finally {
		isLoadingSummary.value = false;
	}
}

async function loadHubFiles() {
	isLoadingFiles.value = true;
	try {
		const { data } = await api.listHubFiles();
		hubFiles.value = data;
	} catch (error) {
		console.error('Failed to load HUB files:', error.message);
	} finally {
		isLoadingFiles.value = false;
	}
}

async function refreshAll() {
	isRefreshing.value = true;
	try {
		await api.runSync();
		await Promise.all([loadHubSummary(), loadHubFiles(), accountStore.loadAccounts()]);
	} catch (error) {
		console.error('Refresh failed:', error.message);
	} finally {
		isRefreshing.value = false;
	}
}

async function loadPage() {
	await accountStore.loadAccounts();
	await Promise.all([loadHubSummary(), loadHubFiles()]);
}

onMounted(loadPage);
</script>

<template>
	<DriveShell current-section="hub">
		<div class="min-h-[calc(100vh-84px)] rounded-[24px] bg-white px-4 py-[18px] pb-7 text-[#202124] dark:bg-slate-800 dark:text-slate-100 sm:px-6">
			<div class="mb-[18px] flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
				<h1 class="m-0 text-2xl font-normal text-[#202124] dark:text-slate-100">{{ t('hub.title') }}</h1>

				<div class="flex items-center gap-2">
					<button type="button" class="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-3.5 text-sm text-[#1a73e8] hover:bg-[#f8fafd] dark:border-slate-600 dark:bg-slate-800 dark:text-sky-400 dark:hover:bg-slate-700" :disabled="isRefreshing" @click="refreshAll">
						<IconRefresh :size="16" :stroke="2" :class="{ 'animate-spin': isRefreshing }" />
						<span>{{ t('hub.refreshAll') }}</span>
					</button>
				</div>
			</div>

			<!-- Storage HUB Summary -->
			<div class="hub-summary bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white mb-6">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-2xl font-bold">☁️ {{ t('hub.myStorageHub') }}</h2>
						<p class="text-blue-100 mt-1">{{ t('hub.providersConnected', { count: totalAccounts }) }}</p>
					</div>
					<div class="text-right">
						<div class="text-3xl font-bold">{{ formatBytes(totalUsed) }}</div>
						<div class="text-blue-200">{{ t('hub.ofCapacity', { capacity: formatBytes(totalCapacity) }) }}</div>
					</div>
				</div>
				<!-- Progress bar -->
				<div class="mt-4 bg-white/20 rounded-full h-3">
					<div class="bg-white rounded-full h-3 transition-all" :style="{ width: usagePercent + '%' }" />
				</div>
				<div class="flex justify-between mt-2 text-sm text-blue-100">
					<span>{{ usagePercent.toFixed(1) }}% {{ t('hub.used') }}</span>
					<span>{{ formatBytes(totalFree) }} {{ t('hub.available') }}</span>
				</div>
			</div>

			<!-- Quick actions -->
			<div class="flex flex-wrap gap-3 mb-6">
				<RouterLink to="/my-drive" class="inline-flex h-10 items-center gap-2 rounded-full border border-[#1a73e8] bg-[#1a73e8] px-[18px] text-white disabled:opacity-60">
					<IconCloudUpload :size="18" :stroke="2" />
					{{ t('hub.upload') }}
				</RouterLink>
				<RouterLink to="/my-drive" class="inline-flex h-10 items-center gap-2 rounded-full border border-[#dadce0] bg-white px-[18px] text-[#1a73e8] dark:border-slate-600 dark:bg-slate-800 dark:text-sky-400">
					<IconFolderPlus :size="18" :stroke="2" />
					{{ t('hub.newFolder') }}
				</RouterLink>
			</div>

			<!-- Provider breakdown -->
			<div class="mb-6">
				<h2 class="mb-3 text-base font-medium text-[#202124] dark:text-slate-100">{{ t('hub.providerBreakdown') }}</h2>
				<div class="provider-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					<div v-for="account in accounts" :key="account.id"
						class="provider-card rounded-lg p-4 border border-[#e0e3e7] bg-[#f8fafd] dark:border-slate-700 dark:bg-slate-900/70">
						<div class="flex items-center gap-3">
							<div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-white dark:bg-slate-800">
								<img v-if="getProviderIcon(account.provider)" :src="getProviderIcon(account.provider)" :alt="getProviderLabel(account.provider)" class="size-5 object-contain" />
								<span v-else class="text-lg">{{ getProviderEmoji(account.provider) }}</span>
							</div>
							<div class="flex-1 min-w-0">
								<div class="font-medium truncate">{{ account.email }}</div>
								<div class="text-xs text-[#5f6368] dark:text-slate-400">{{ getProviderLabel(account.provider) }}</div>
							</div>
							<span :class="account.status === 'active' ? 'text-emerald-500' : 'text-red-500'"
								class="text-xs font-bold shrink-0">● {{ account.status }}</span>
						</div>
						<div class="mt-3">
							<div class="flex justify-between text-xs text-[#5f6368] dark:text-slate-400">
								<span>{{ formatBytes(account.used_space) }} {{ t('hub.used') }}</span>
								<span>{{ formatBytes(account.total_space) }}</span>
							</div>
							<div class="bg-[#e0e3e7] dark:bg-slate-700 rounded-full h-2 mt-1">
								<div class="bg-[#1a73e8] rounded-full h-2 transition-all" :style="{ width: getAccountUsagePercent(account) + '%' }" />
							</div>
						</div>
					</div>

					<div v-if="!accounts.length && !isLoadingSummary" class="col-span-full rounded-lg border border-dashed border-[#dadce0] p-6 text-center text-[#5f6368] dark:border-slate-600 dark:text-slate-400">
						{{ t('hub.noAccounts') }}
					</div>
				</div>
			</div>

			<!-- All files across providers -->
			<section>
				<div class="mb-3 flex items-center justify-between gap-3">
					<h2 class="m-0 text-base font-medium text-[#202124] dark:text-slate-100">{{ t('hub.allFiles') }}</h2>
					<RouterLink to="/my-drive" class="rounded-full border border-[#dadce0] bg-white px-3.5 py-2 text-[#1a73e8] dark:border-slate-600 dark:bg-slate-800 dark:text-sky-400">{{ t('hub.openDrive') }}</RouterLink>
				</div>

				<div class="overflow-hidden rounded-2xl border border-[#e0e3e7] dark:border-slate-700">
					<div class="grid min-h-11 grid-cols-[minmax(220px,2fr)_1.1fr_1fr_140px] items-center gap-3 bg-[#f8fafd] px-[18px] text-[13px] text-[#5f6368] dark:bg-slate-900/70 dark:text-slate-400 max-md:grid-cols-[minmax(180px,1.8fr)_1fr_1fr]">
						<span>{{ t('home.fileName') }}</span>
						<span>{{ t('home.fileOwner') }}</span>
						<span>{{ t('home.fileModified') }}</span>
						<span class="max-md:hidden">{{ t('home.fileSize') }}</span>
					</div>

					<div v-for="file in recentHubFiles" :key="file.id" class="grid min-h-[52px] grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1fr)_140px] items-center gap-3 border-t border-[#eceff1] px-[18px] dark:border-slate-700 max-md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)]">
						<span class="flex min-w-0 items-center gap-2.5 text-[#202124] dark:text-slate-100">
							<IconFolder v-if="file.is_folder" :size="18" :stroke="1.8" class="shrink-0 text-[#5f6368] dark:text-slate-400" />
							<IconFileDescription v-else :size="18" :stroke="1.8" class="shrink-0 text-[#5f6368] dark:text-slate-400" />
							<TruncateMarquee :text="file.display_name || file.file_name" />
						</span>
						<div class="flex min-w-0 items-center gap-2 text-[#5f6368] dark:text-slate-400">
							<div v-if="getProviderIcon(file.provider)" class="flex size-6 shrink-0 items-center justify-center rounded-full bg-white dark:bg-slate-900/70">
								<img :src="getProviderIcon(file.provider)" :alt="getProviderLabel(file.provider)" class="size-3.5 object-contain" />
							</div>
							<TruncateMarquee class="min-w-0" :text="file.email" />
						</div>
						<span class="text-[#5f6368] dark:text-slate-400">{{ formatDate(file.modifiedTime) }}</span>
						<span class="text-[#5f6368] dark:text-slate-400 max-md:hidden">{{ formatBytes(file.size) }}</span>
					</div>

					<div v-if="!recentHubFiles.length && !isLoadingFiles" class="p-[18px] text-[#5f6368] dark:text-slate-400">{{ t('hub.noFiles') }}</div>
					<div v-if="isLoadingFiles" class="p-[18px] text-[#5f6368] dark:text-slate-400">{{ t('common.loading') }}</div>
				</div>
			</section>
		</div>
	</DriveShell>
</template>
