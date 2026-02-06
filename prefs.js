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

		// 1. API Group
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

		// 2. Appearance Group
		const appearanceGroup = new Adw.PreferencesGroup({title: _("Appearance")});
		page.add(appearanceGroup);

		const widthRow = new Adw.ActionRow({
			title: _("Window Width"),
			subtitle: _("Adjust width (400px - 1200px)"),
		});
		const widthSpin = new Gtk.SpinButton({
			adjustment: new Gtk.Adjustment({
				lower: 400,
				upper: 1200,
				step_increment: 50,
				value: settings.get_int("chat-width"),
			}),
			valign: Gtk.Align.CENTER,
		});
		widthSpin.connect("value-changed", () => {
			settings.set_int("chat-width", widthSpin.get_value_as_int());
		});
		widthRow.add_suffix(widthSpin);
		appearanceGroup.add(widthRow);

		const heightRow = new Adw.ActionRow({
			title: _("Window Height"),
			subtitle: _("Adjust height (400px - 1600px)"),
		});
		const heightSpin = new Gtk.SpinButton({
			adjustment: new Gtk.Adjustment({
				lower: 400,
				upper: 1600,
				step_increment: 50,
				value: settings.get_int("chat-height"),
			}),
			valign: Gtk.Align.CENTER,
		});
		heightSpin.connect("value-changed", () => {
			settings.set_int("chat-height", heightSpin.get_value_as_int());
		});
		heightRow.add_suffix(heightSpin);
		appearanceGroup.add(heightRow);

		// 3. General Settings Group
		const generalGroup = new Adw.PreferencesGroup({title: _("General Settings")});
		page.add(generalGroup);

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
		generalGroup.add(historyRow);

		const deviceInfoRow = new Adw.SwitchRow({
			title: _("Share System Details"),
			subtitle: _(
				"Sends CPU, GPU, RAM, and OS info to AI for better technical answers",
			),
		});
		generalGroup.add(deviceInfoRow);
		settings.bind(
			"send-device-info",
			deviceInfoRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);

		// 4. Information Group
		const infoGroup = new Adw.PreferencesGroup({title: _("Information")});
		page.add(infoGroup);

		const privacyRow = new Adw.ActionRow({
			title: _("Privacy"),
			subtitle: _(
				"No data is collected anywhere. All chat history is stored locally on your machine.",
			),
		});
		const privacyIcon = new Gtk.Image({
			icon_name: "dialog-warning-symbolic",
		});
		privacyRow.add_prefix(privacyIcon);
		infoGroup.add(privacyRow);

		const creditsRow = new Adw.ActionRow({
			title: _("Developed by Momen Elkhalifa"),
			subtitle: _("Visit website: momen.codes"),
			activatable: true,
		});
		const creditsIcon = new Gtk.Image({
			icon_name: "avatar-default-symbolic",
		});
		creditsRow.add_prefix(creditsIcon);
		creditsRow.connect("activated", () => {
			GLib.spawn_command_line_async("xdg-open https://momen.codes");
		});
		infoGroup.add(creditsRow);
	}
}
