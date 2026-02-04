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

		const geminiKeyRow = new Adw.PasswordEntryRow({title: _("Gemini API Key")});
		apiGroup.add(geminiKeyRow);
		settings.bind(
			"gemini-api-key",
			geminiKeyRow,
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

		const openaiKeyRow = new Adw.PasswordEntryRow({title: _("OpenAI API Key")});
		apiGroup.add(openaiKeyRow);
		settings.bind(
			"openai-api-key",
			openaiKeyRow,
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

		// Appearance Group
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

		const heightRow = new Adw.ActionRow({
			title: _("Chat Window Height"),
			subtitle: _("Adjust window height (300px - 1000px)"),
		});
		const heightSpin = new Gtk.SpinButton({
			adjustment: new Gtk.Adjustment({
				lower: 300,
				upper: 1000,
				step_increment: 50,
				value: settings.get_int("chat-height"),
			}),
			valign: Gtk.Align.CENTER,
		});
		heightSpin.connect("value-changed", () => {
			settings.set_int("chat-height", heightSpin.get_value_as_int());
		});
		heightRow.add_suffix(heightSpin);
		themeGroup.add(heightRow);

		// Data Group
		const dataGroup = new Adw.PreferencesGroup({title: _("Data & Privacy")});
		page.add(dataGroup);

		const deviceInfoRow = new Adw.SwitchRow({
			title: _("Share System Details"),
			subtitle: _(
				"Sends CPU, GPU, RAM, and OS info to AI for better technical answers",
			),
		});
		dataGroup.add(deviceInfoRow);
		settings.bind(
			"send-device-info",
			deviceInfoRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);

		const privacyRow = new Adw.ActionRow({
			title: _("Privacy Shield"),
			subtitle: _(
				"No data is collected anywhere. All chat history is stored locally on your machine.",
			),
		});
		dataGroup.add(privacyRow);

		// About Group
		const aboutGroup = new Adw.PreferencesGroup({title: _("About")});
		page.add(aboutGroup);

		const creditsRow = new Adw.ActionRow({
			title: _("Developed by Momen Elkhalifa"),
			subtitle: _("Visit website: momen.codes"),
			activatable: true,
		});
		creditsRow.connect("activated", () => {
			GLib.spawn_command_line_async("xdg-open https://momen.codes");
		});
		aboutGroup.add(creditsRow);

		const historyRow = new Adw.ActionRow({
			title: _("History Context Limit"),
			subtitle: _("Messages kept in context (10-50)"),
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
		historyRow.add_suffix(limitSpin);
		aboutGroup.add(historyRow);
	}
}
