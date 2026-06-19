import { computed, ref, watch } from 'vue';

export function useIncrementalRender(source, options = {}) {
	const initialCount = options.initialCount ?? 80;
	const step = options.step ?? 80;
	const threshold = options.threshold ?? 240;
	const renderCount = ref(initialCount);

	const visibleItems = computed(() => source.value.slice(0, renderCount.value));

	function loadMore() {
		renderCount.value = Math.min(source.value.length, renderCount.value + step);
	}

	function reset() {
		renderCount.value = initialCount;
	}

	function handleScroll(event) {
		const element = event.target;
		if (!element) return;
		const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
		if (remaining <= threshold) loadMore();
	}

	watch(source, () => {
		reset();
	});

	return {
		renderCount,
		visibleItems,
		loadMore,
		reset,
		handleScroll,
	};
}
