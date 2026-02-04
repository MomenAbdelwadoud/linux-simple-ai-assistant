import GLib from "gi://GLib";
import Gio from "gi://Gio";

export function saveHistory(history, limit) {
	// limit counts all messages (user + assistant) excluding system prompt
	let truncatedHistory = history;

	// Always keep the system prompt at index 0 if it exists
	const hasSystemPrompt = history.length > 0 && history[0].role === "system";
	const systemPrompt = hasSystemPrompt ? history[0] : null;

	// Filter out system prompt for truncation logic
	const chatMessages = hasSystemPrompt ? history.slice(1) : history;

	if (chatMessages.length > limit) {
		const recentMessages = chatMessages.slice(-limit);
		truncatedHistory = systemPrompt
			? [systemPrompt, ...recentMessages]
			: recentMessages;
	}

	const dir = GLib.get_user_cache_dir() + "/simple-ai-assistant";
	GLib.mkdir_with_parents(dir, 0o755);
	const path = dir + "/history.json";
	const file = Gio.File.new_for_path(path);
	const contents = JSON.stringify(truncatedHistory);

	try {
		file.replace_contents(
			contents,
			null,
			false,
			Gio.FileCreateFlags.REPLACE_DESTINATION,
			null,
		);
	} catch (e) {
		logError(e, "Failed to save history");
	}
}

export function loadHistory() {
	const path = GLib.get_user_cache_dir() + "/simple-ai-assistant/history.json";
	const file = Gio.File.new_for_path(path);
	try {
		if (!file.query_exists(null)) return [];
		const [success, contents] = file.load_contents(null);
		if (success) {
			return JSON.parse(new TextDecoder().decode(contents));
		}
	} catch (e) {
		// File might not exist or be invalid JSON
	}
	return [];
}

export function clearHistory() {
	const path = GLib.get_user_cache_dir() + "/simple-ai-assistant/history.json";
	const file = Gio.File.new_for_path(path);
	try {
		if (file.query_exists(null)) {
			file.delete(null);
		}
	} catch (e) {}
}
