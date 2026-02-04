import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";
import {
	ExtensionPreferences,
	gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class SimpleAiAssistantPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window) {
		const settings = this.getSettings();
		const page = new Adw.PreferencesPage();
		window.add(page);

		// API Group
		const apiGroup = new Adw.PreferencesGroup({title: _("API Settings")});
		page.add(apiGroup);

		const providerRow = new Adw.ComboRow({
			title: _("API Provider"),
			model: new Gtk.StringList({
				strings: ["OpenAI", "Gemini"],
			}),
		});
		apiGroup.add(providerRow);
		providerRow.connect("notify::selected", () => {
			const val = providerRow.selected === 0 ? "openai" : "gemini";
			settings.set_string("api-provider", val);
		});
		providerRow.selected = settings.get_string("api-provider") === "openai" ? 0 : 1;

		const openaiKeyRow = new Adw.PasswordEntryRow({title: _("OpenAI API Key")});
		apiGroup.add(openaiKeyRow);
		settings.bind(
			"openai-api-key",
			openaiKeyRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);

		const geminiKeyRow = new Adw.PasswordEntryRow({title: _("Gemini API Key")});
		apiGroup.add(geminiKeyRow);
		settings.bind(
			"gemini-api-key",
			geminiKeyRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);

		const openaiModelRow = new Adw.EntryRow({title: _("OpenAI Model")});
		apiGroup.add(openaiModelRow);
		settings.bind(
			"openai-model",
			openaiModelRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);

		const geminiModelRow = new Adw.EntryRow({title: _("Gemini Model")});
		apiGroup.add(geminiModelRow);
		settings.bind(
			"gemini-model",
			geminiModelRow,
			"text",
			Gio.SettingsBindFlags.DEFAULT,
		);

		// Theme Group
		const themeGroup = new Adw.PreferencesGroup({title: _("Appearance")});
		page.add(themeGroup);

		const themeRow = new Adw.ComboRow({
			title: _("Theme"),
			model: new Gtk.StringList({
				strings: ["Follow System", "Simple Light", "Simple Dark"],
			}),
		});
		themeGroup.add(themeRow);
		const themeMap = ["system", "light", "dark"];
		themeRow.connect("notify::selected", () => {
			settings.set_string("theme", themeMap[themeRow.selected]);
		});
		themeRow.selected = themeMap.indexOf(settings.get_string("theme"));

		// History Group
		const historyGroup = new Adw.PreferencesGroup({title: _("History Management")});
		page.add(historyGroup);

		const limitRow = new Adw.ActionRow({
			title: _("History Context Limit"),
			subtitle: _("Number of messages to keep in context (10-50)"),
		});
		const limitSpin = new Gtk.SpinButton({
			adjustment: new Gtk.Adjustment({
				lower: 10,
				upper: 50,
				step_increment: 1,
				value: settings.get_int("history-limit"),
			}),
			valign: Gtk.Align.CENTER,
		});
		limitSpin.connect("value-changed", () => {
			settings.set_int("history-limit", limitSpin.get_value_as_int());
		});
		limitRow.add_suffix(limitSpin);
		historyGroup.add(limitRow);

		const clearHistoryRow = new Adw.ActionRow({
			title: _("Clear Chat History"),
			activatable: true,
		});
		const clearButton = new Gtk.Button({
			label: _("Clear"),
			valign: Gtk.Align.CENTER,
			css_classes: ["destructive-action"],
		});
		clearButton.connect("clicked", () => {
			const path = GLib.get_user_cache_dir() + "/simple-ai-assistant/history.json";
			const file = Gio.File.new_for_path(path);
			try {
				if (file.query_exists(null)) file.delete(null);
			} catch (e) {}
		});
		clearHistoryRow.add_suffix(clearButton);
		historyGroup.add(clearHistoryRow);

		// Debug Group
		const debugGroup = new Adw.PreferencesGroup({title: _("Debugging")});
		page.add(debugGroup);

		const deviceInfoRow = new Adw.SwitchRow({
			title: _("Send Device Info"),
			subtitle: _("Send basic system specs to help with debugging"),
		});
		debugGroup.add(deviceInfoRow);
		settings.bind(
			"send-device-info",
			deviceInfoRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
	}
}
