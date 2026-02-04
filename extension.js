import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";

import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";

import * as Api from "./api.js";
import * as Device from "./device.js";
import * as History from "./history.js";
import {SYSTEM_PROMPT} from "./prompts.js";
import * as Utils from "./utils.js";

export default class SimpleAiAssistantExtension extends Extension {
	enable() {
		this._settings = this.getSettings();
		this._api = new Api.ApiClient();
		this._history = History.loadHistory();

		// Indicator
		this._indicator = new PanelMenu.Button(0.0, "Simple AI Assistant", false);
		let icon = new St.Label({
			text: "✨",
			y_expand: true,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this._indicator.add_child(icon);

		// Build Popup UI
		this._buildUi();

		Main.panel.addToStatusArea("simple-ai-assistant", this._indicator);

		// Listen for theme changes
		this._themeId = this._settings.connect("changed::theme", () =>
			this._updateTheme(),
		);
		this._updateTheme();
	}

	disable() {
		if (this._themeId) {
			this._settings.disconnect(this._themeId);
			this._themeId = null;
		}
		this._indicator.destroy();
		this._indicator = null;
		this._settings = null;
		this._api = null;
	}

	_updateTheme() {
		if (!this._chatContainer) return;

		const theme = this._settings.get_string("theme");
		this._chatContainer.remove_style_class_name("simple-light");
		this._chatContainer.remove_style_class_name("simple-dark");

		if (theme === "light") {
			this._chatContainer.add_style_class_name("simple-light");
		} else if (theme === "dark") {
			this._chatContainer.add_style_class_name("simple-dark");
		}
		// if 'system', it relies on default shell styling + stylesheet.css base
	}

	_buildUi() {
		this._chatContainer = new St.BoxLayout({
			vertical: true,
			style_class: "chat-container",
			width: 400,
			height: 500,
		});

		// Header
		let header = new St.BoxLayout({style_class: "chat-header"});
		let title = new St.Label({text: "AI Assistant", x_expand: true});
		let newChatBtn = new St.Button({
			label: "New Chat",
			style_class: "button",
		});
		newChatBtn.connect("clicked", () => this._newChat());
		header.add_child(title);
		header.add_child(newChatBtn);
		this._chatContainer.add_child(header);

		// Scrollable Chat Area
		this._chatScroll = new St.ScrollView({
			x_expand: true,
			y_expand: true,
			overlay_scrollbars: true,
			style_class: "chat-scroll",
		});
		this._chatBox = new St.BoxLayout({
			vertical: true,
			style_class: "chat-box",
		});
		this._chatScroll.add_child(this._chatBox);
		this._chatContainer.add_child(this._chatScroll);

		// Render existing history
		this._history
			.filter(m => m.role !== "system")
			.forEach(m => this._addMessageToUi(m.role, m.content));

		// Input Area
		let inputArea = new St.BoxLayout({style_class: "chat-input-area"});
		this._input = new St.Entry({
			hint_text: "Type a message...",
			can_focus: true,
			x_expand: true,
			style_class: "chat-input",
		});
		this._input.clutter_text.connect("activate", () => this._sendMessage());

		this._deviceInfoCheck = new St.Button({
			style_class: "device-info-check",
			can_focus: true,
			toggle_mode: true,
			checked: this._settings.get_boolean("send-device-info"),
			child: new St.Icon({icon_name: "computer-symbolic", icon_size: 16}),
		});

		inputArea.add_child(this._deviceInfoCheck);
		inputArea.add_child(this._input);
		this._chatContainer.add_child(inputArea);

		this._indicator.menu.box.add_child(this._chatContainer);
		this._updateTheme();
	}

	async _sendMessage() {
		let text = this._input.get_text();
		if (!text) return;
		this._input.set_text("");

		// Prepare context
		if (this._history.length === 0) {
			this._history.push({role: "system", content: SYSTEM_PROMPT});

			// Send device info if checked
			if (this._deviceInfoCheck.checked) {
				const info = Device.getDeviceInfo();
				this._history[0].content += "\n\nUser System Info:\n" + info;
			}
		}

		this._history.push({role: "user", content: text});
		this._addMessageToUi("user", text);
		History.saveHistory(this._history, this._settings.get_int("history-limit"));

		// API Call
		try {
			const provider = this._settings.get_string("api-provider");
			const apiKey = this._settings.get_string(provider + "-api-key");
			const model = this._settings.get_string(provider + "-model");

			let loadingId = this._addMessageToUi("assistant", "Thinking...");

			const response = await this._api.sendMessage(
				provider,
				apiKey,
				model,
				this._history,
			);

			// Remove loading
			this._removeMessageFromUi(loadingId);

			this._history.push({role: "assistant", content: response});
			this._addMessageToUi("assistant", response);
			History.saveHistory(this._history, this._settings.get_int("history-limit"));
		} catch (e) {
			this._addMessageToUi("assistant", "Error: " + e.message);
		}
	}

	_newChat() {
		this._history = [];
		History.clearHistory();
		this._chatBox.destroy_all_children();
	}

	_addMessageToUi(role, content) {
		let msgBox = new St.BoxLayout({
			vertical: true,
			style_class: `message-box ${role}-message`,
		});

		let label = new St.Label({
			style_class: "message-text",
		});
		label.clutter_text.set_markup(Utils.formatMessage(content));
		label.clutter_text.line_wrap = true;
		msgBox.add_child(label);

		// Check for commands
		const cmdMatch = content.match(/\[RUN: (.*?)\]/);
		if (cmdMatch) {
			let cmd = cmdMatch[1];
			let runBtn = new St.Button({
				label: "Run Command",
				style_class: "run-button",
			});
			runBtn.connect("clicked", () => this._runCommand(cmd, msgBox));
			msgBox.add_child(runBtn);
		}

		this._chatBox.add_child(msgBox);

		// Scroll to bottom
		GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
			let adj = this._chatScroll.get_vscroll_bar().get_adjustment();
			adj.set_value(adj.get_upper() - adj.get_page_size());
			return false;
		});

		return msgBox;
	}

	_removeMessageFromUi(actor) {
		if (actor) actor.destroy();
	}

	async _runCommand(cmd, msgBox) {
		let outputBox = new St.BoxLayout({
			vertical: true,
			style_class: "terminal-box",
		});
		let outputLabel = new St.Label({
			text: "Running...",
			style_class: "terminal-text",
		});
		outputBox.add_child(outputLabel);
		msgBox.add_child(outputBox);

		try {
			const [res, stdout, stderr, status] = await this._spawnCommandLineAsync(cmd);
			const outTxt = new TextDecoder().decode(stdout).trim();
			const errTxt = new TextDecoder().decode(stderr).trim();

			let result = outTxt || errTxt || "Command finished with no output";

			// Show only last 3 lines by default
			const lines = result.split("\n");
			const shortResult = lines.slice(-3).join("\n");

			outputLabel.set_text(shortResult);

			if (lines.length > 3) {
				let expandBtn = new St.Button({
					label: "Expand",
					style_class: "expand-button",
				});
				expandBtn.connect("clicked", () => {
					outputLabel.set_text(result);
					expandBtn.destroy();
				});
				outputBox.add_child(expandBtn);
			}
		} catch (e) {
			outputLabel.set_text("Error: " + e.message);
		}
	}

	_spawnCommandLineAsync(cmd) {
		return new Promise((resolve, reject) => {
			try {
				let [success, argv] = GLib.shell_parse_argv(cmd);
				if (!success) throw new Error("Failed to parse command");

				let [res, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
					null,
					argv,
					null,
					GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
					null,
				);

				let stdoutStream = new Gio.DataInputStream({
					base_stream: new Gio.UnixInputStream({fd: stdout, close_fd: true}),
				});
				let stderrStream = new Gio.DataInputStream({
					base_stream: new Gio.UnixInputStream({fd: stderr, close_fd: true}),
				});

				let stdoutData = [];
				let stderrData = [];

				const readStream = (stream, dataArray) => {
					return new Promise(res => {
						const read = () => {
							stream.read_line_async(
								GLib.PRIORITY_DEFAULT,
								null,
								(s, result) => {
									let [line, len] = s.read_line_finish(result);
									if (line != null) {
										dataArray.push(new TextDecoder().decode(line));
										read();
									} else {
										res();
									}
								},
							);
						};
						read();
					});
				};

				Promise.all([
					readStream(stdoutStream, stdoutData),
					readStream(stderrStream, stderrData),
				]).then(() => {
					resolve([
						true,
						GLib.Bytes.new(stdoutData.join("\n")),
						GLib.Bytes.new(stderrData.join("\n")),
						0,
					]);
				});
			} catch (e) {
				reject(e);
			}
		});
	}
}
