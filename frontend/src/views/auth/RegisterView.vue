<script setup>
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { IconLoader2, IconMail, IconLock, IconLockCheck } from '@tabler/icons-vue';
import { useAuthStore } from '../../stores/auth';
import AuthLayout from './AuthLayout.vue';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const form = reactive({ email: '', password: '', confirmPassword: '' });
const localError = ref('');

const isBusy = computed(() => authStore.loading);
const displayError = computed(() => localError.value || authStore.error);

async function handleSubmit() {
	localError.value = '';
	authStore.error = null;

	if (!form.email.trim() || !form.password) {
		localError.value = t('auth.errors.required');
		return;
	}
	if (form.password.length < 8) {
		localError.value = t('auth.errors.passwordLength');
		return;
	}
	if (form.password !== form.confirmPassword) {
		localError.value = t('auth.errors.passwordMismatch');
		return;
	}

	const ok = await authStore.register({ email: form.email.trim(), password: form.password });
	if (ok) {
		const redirect = router.currentRoute.value.query.redirect || '/';
		router.replace(String(redirect));
	}
}

function goLogin() {
	authStore.error = null;
	router.push({ name: 'login', query: router.currentRoute.value.query });
}
</script>

<template>
	<AuthLayout :title="t('auth.registerTitle')" :subtitle="t('auth.registerSubtitle')">
		<form class="auth-form" @submit.prevent="handleSubmit">
			<label class="auth-field">
				<span class="auth-field__label">{{ t('auth.email') }}</span>
				<span class="auth-field__control">
					<IconMail :size="18" class="auth-field__icon" />
					<input v-model="form.email" type="email" autocomplete="email" :placeholder="t('auth.emailPlaceholder')" required />
				</span>
			</label>

			<label class="auth-field">
				<span class="auth-field__label">{{ t('auth.password') }}</span>
				<span class="auth-field__control">
					<IconLock :size="18" class="auth-field__icon" />
					<input v-model="form.password" type="password" autocomplete="new-password" :placeholder="t('auth.passwordPlaceholder')" required />
				</span>
			</label>

			<label class="auth-field">
				<span class="auth-field__label">{{ t('auth.confirmPassword') }}</span>
				<span class="auth-field__control">
					<IconLockCheck :size="18" class="auth-field__icon" />
					<input v-model="form.confirmPassword" type="password" autocomplete="new-password" :placeholder="t('auth.confirmPasswordPlaceholder')" required />
				</span>
			</label>

			<p class="auth-hint">{{ t('auth.errors.passwordLength') }}</p>

			<Transition name="auth-fade">
				<p v-if="displayError" class="auth-error">{{ displayError }}</p>
			</Transition>

			<button type="submit" class="auth-submit" :disabled="isBusy">
				<IconLoader2 v-if="isBusy" :size="18" class="spin" />
				<span>{{ isBusy ? t('auth.creatingAccount') : t('auth.registerCta') }}</span>
			</button>
		</form>

		<p class="auth-switch">
			{{ t('auth.haveAccount') }}
			<button type="button" @click="goLogin">{{ t('auth.loginCta') }}</button>
		</p>
	</AuthLayout>
</template>

<style scoped src="./auth-form.css"></style>
