export function createWorldDynamicPropertyStorage(target) {
	if (!target || typeof target.getDynamicProperty !== "function" || typeof target.setDynamicProperty !== "function")
		throw new TypeError("World dynamic-property storage requires get and set operations");

	return {
		delete(key) {
			target.setDynamicProperty(key, undefined);
		},
		get(key) {
			return target.getDynamicProperty(key);
		},
		set(key, value) {
			target.setDynamicProperty(key, value);
		}
	};
}
