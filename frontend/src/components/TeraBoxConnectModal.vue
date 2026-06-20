<script setup>
import { ref } from 'vue';

const props = defineProps({
	isConnecting: { type: Boolean, default: false },
	error: { type: String, default: '' },
});

const emit = defineEmits(['close', 'connect']);

const ndus = ref('');
const showGuide = ref(false);

function closeModal() {
	if (props.isConnecting) return;
	emit('close');
}

function submitForm() {
	const value = ndus.value.trim();
	if (!value) return;
	emit('connect', { ndus: value });
}
</script>

<template>
	<div class="modal-overlay" @click.self="closeModal">
		<div class="modal-card">
			<header class="modal-head">
				<div class="modal-brand">
					<span class="modal-icon">☁️</span>
					<div>
						<h3>Connect TeraBox</h3>
						<p>1 TB free cloud storage</p>
					</div>
				</div>
				<button class="modal-close" @click="closeModal" :disabled="isConnecting">✕</button>
			</header>

			<!-- Guide -->
			<div class="guide-toggle" @click="showGuide = !showGuide">
				<span>📋 How to get your ndus cookie</span>
				<span class="guide-arrow">{{ showGuide ? '▲' : '▼' }}</span>
			</div>

			<div v-if="showGuide" class="guide-body">
				<ol>
					<li>Open <a href="https://www.terabox.com" target="_blank" rel="noreferrer">terabox.com</a> in your browser</li>
					<li>Login to your TeraBox account</li>
					<li>Press <strong>F12</strong> to open DevTools</li>
					<li>Go to <strong>Application</strong> tab → <strong>Cookies</strong> → <strong>https://www.terabox.com</strong></li>
					<li>Find cookie named <code>ndus</code></li>
					<li>Copy the <strong>Value</strong> and paste below</li>
				</ol>
			</div>

			<!-- Form -->
			<form @submit.prevent="submitForm" class="modal-form">
				<label>
					<span>ndus Cookie</span>
					<input
						v-model="ndus"
						type="text"
						required
						autocomplete="off"
						placeholder="Paste your ndus cookie value here..."
						class="modal-input"
					/>
				</label>

				<p v-if="error" class="modal-error">{{ error }}</p>

				<div class="modal-actions">
					<button type="button" class="btn-cancel" @click="closeModal" :disabled="isConnecting">Cancel</button>
					<button type="submit" class="btn-connect" :disabled="isConnecting || !ndus.trim()">
						{{ isConnecting ? 'Connecting...' : 'Connect TeraBox' }}
					</button>
				</div>
			</form>

			<footer class="modal-foot">
				<p>🔒 Your cookie is encrypted and stored securely. Full download speed (no throttle).</p>
			</footer>
		</div>
	</div>
</template>

<style scoped>
.modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 100;
	display: grid;
	place-items: center;
	background: rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(4px);
	padding: 1rem;
}

.modal-card {
	width: 100%;
	max-width: 28rem;
	background: #fff;
	border-radius: 1.25rem;
	padding: 1.75rem;
	box-shadow: 0 24px 48px rgba(0, 0, 0, 0.18);
}

:global(.dark) .modal-card {
	background: #1e293b;
	color: #e2e8f0;
}

.modal-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	margin-bottom: 1.25rem;
}

.modal-brand {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.modal-icon {
	font-size: 2rem;
	width: 3rem;
	height: 3rem;
	display: grid;
	place-items: center;
	border-radius: 0.9rem;
	background: linear-gradient(135deg, #06b6d4, #0ea5e9);
}

.modal-brand h3 {
	margin: 0;
	font-size: 1.2rem;
	font-weight: 700;
}

.modal-brand p {
	margin: 0;
	font-size: 0.8rem;
	color: #64748b;
}

.modal-close {
	background: none;
	border: none;
	font-size: 1.2rem;
	cursor: pointer;
	color: #94a3b8;
	padding: 0.25rem;
}

.guide-toggle {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0.75rem 1rem;
	background: #f1f5f9;
	border-radius: 0.75rem;
	cursor: pointer;
	font-size: 0.85rem;
	font-weight: 600;
	margin-bottom: 1rem;
	transition: background 0.15s;
}

:global(.dark) .guide-toggle {
	background: #334155;
}

.guide-toggle:hover {
	background: #e2e8f0;
}

.guide-arrow {
	font-size: 0.75rem;
}

.guide-body {
	background: #f8fafc;
	border-radius: 0.75rem;
	padding: 1rem 1.25rem;
	margin-bottom: 1rem;
	font-size: 0.85rem;
	line-height: 1.7;
}

:global(.dark) .guide-body {
	background: #1e293b;
	border: 1px solid #334155;
}

.guide-body ol {
	margin: 0;
	padding-left: 1.25rem;
}

.guide-body a {
	color: #2563eb;
	font-weight: 600;
}

.guide-body code {
	background: #e2e8f0;
	padding: 0.1rem 0.35rem;
	border-radius: 0.25rem;
	font-size: 0.8rem;
}

.modal-form {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.modal-form label {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	font-size: 0.85rem;
	font-weight: 600;
}

.modal-input {
	height: 2.75rem;
	border-radius: 0.75rem;
	border: 1px solid #dadce0;
	padding: 0 1rem;
	font-size: 0.9rem;
	outline: none;
	transition: border-color 0.15s;
}

:global(.dark) .modal-input {
	background: #0f172a;
	border-color: #334155;
	color: #e2e8f0;
}

.modal-input:focus {
	border-color: #0ea5e9;
}

.modal-error {
	margin: 0;
	color: #dc2626;
	font-size: 0.85rem;
}

.modal-actions {
	display: flex;
	gap: 0.75rem;
	justify-content: flex-end;
	margin-top: 0.5rem;
}

.btn-cancel {
	height: 2.5rem;
	padding: 0 1.25rem;
	border-radius: 999px;
	border: 1px solid #dadce0;
	background: transparent;
	font-weight: 600;
	cursor: pointer;
}

.btn-connect {
	height: 2.5rem;
	padding: 0 1.5rem;
	border-radius: 999px;
	border: none;
	background: linear-gradient(135deg, #06b6d4, #0ea5e9);
	color: #fff;
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.15s;
}

.btn-connect:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.modal-foot {
	margin-top: 1rem;
	padding-top: 0.75rem;
	border-top: 1px solid #f1f5f9;
}

:global(.dark) .modal-foot {
	border-color: #334155;
}

.modal-foot p {
	margin: 0;
	font-size: 0.75rem;
	color: #64748b;
}
</style>
