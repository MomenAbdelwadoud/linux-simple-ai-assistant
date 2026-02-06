import Secret from "gi://Secret";

const SECRET_SCHEMA = new Secret.Schema(
	"org.gnome.shell.extensions.simple-ai-assistant.ApiKey",
	Secret.SchemaFlags.NONE,
	{
		provider: Secret.SchemaAttributeType.STRING,
	},
);

export function storeApiKey(provider, key) {
	return new Promise((resolve, reject) => {
		if (!key) {
			removeApiKey(provider).then(resolve).catch(reject);
			return;
		}

		try {
			Secret.password_store(
				SECRET_SCHEMA,
				{provider: provider},
				Secret.COLLECTION_DEFAULT,
				`Simple AI Assistant: ${provider} API Key`,
				key,
				null, // cancellable
				(source, result) => {
					try {
						Secret.password_store_finish(result);
						resolve();
					} catch (e) {
						console.error(
							`Simple AI Assistant: Failed to store key for ${provider}: ${e.message}`,
						);
						// For strict mode, we might want to reject, but logging is vital
						reject(e);
					}
				},
			);
		} catch (e) {
			reject(e);
		}
	});
}

export function getApiKey(provider) {
	return new Promise((resolve, reject) => {
		try {
			Secret.password_lookup(
				SECRET_SCHEMA,
				{provider: provider},
				null, // cancellable
				(source, result) => {
					try {
						const key = Secret.password_lookup_finish(result);
						resolve(key);
					} catch (e) {
						// e.message might be null if not found?
						console.error(
							`Simple AI Assistant: Failed to lookup key for ${provider}: ${e.message}`,
						);
						resolve(null);
					}
				},
			);
		} catch (e) {
			reject(e);
		}
	});
}

export function removeApiKey(provider) {
	return new Promise((resolve, reject) => {
		try {
			Secret.password_clear(
				SECRET_SCHEMA,
				{provider: provider},
				null, // cancellable
				(source, result) => {
					try {
						Secret.password_clear_finish(result);
						resolve();
					} catch (e) {
						console.error(
							`Simple AI Assistant: Failed to clear key for ${provider}: ${e.message}`,
						);
						resolve(); // Resolving anyway to not block
					}
				},
			);
		} catch (e) {
			reject(e);
		}
	});
}
