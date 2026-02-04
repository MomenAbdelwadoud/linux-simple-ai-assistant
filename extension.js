import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Pango from "gi://Pango";
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
		console.log("Simple AI Assistant: Enabling...");
		try {
			this._settings = this.getSettings();
			this._api = new Api.ApiClient();
			this._history = History.loadHistory() || [];

			this._indicator = new PanelMenu.Button(0.0, "Simple AI Assistant", false);

			try {
				const iconFile = this.dir.get_child("icon-symbolic.svg");
				if (iconFile.query_exists(null)) {
					const gicon = Gio.Icon.new_for_string(iconFile.get_path());
					const icon = new St.Icon();
					icon.gicon = gicon;
					icon.style_class = "system-status-icon";
					icon.icon_size = 16;
					this._indicator.add_child(icon);
				} else {
					const icon = new St.Icon();
					icon.icon_name = "starred-symbolic";
					icon.style_class = "system-status-icon";
					this._indicator.add_child(icon);
				}
			} catch (e) {
				console.error(`Simple AI Assistant: Icon error: ${e.message}`);
			}

			this._buildUi();
			Main.panel.addToStatusArea("simple-ai-assistant", this._indicator);

			this._themeId = this._settings.connect("changed::theme", () =>
				this._updateTheme(),
			);
			this._heightId = this._settings.connect("changed::chat-height", () => {
				if (this._chatContainer)
					this._chatContainer.height = this._settings.get_int("chat-height");
			});

			this._updateTheme();
			console.log("Simple AI Assistant: Enabled successfully");
		} catch (e) {
			console.error(
				`Simple AI Assistant: FATAL ENABLE ERROR: ${e.message}\n${e.stack}`,
			);
		}
	}

	disable() {
		if (this._themeId) this._settings.disconnect(this._themeId);
		if (this._heightId) this._settings.disconnect(this._heightId);
		if (this._indicator) this._indicator.destroy();

		this._themeId = null;
		this._heightId = null;
		this._indicator = null;
		this._settings = null;
		this._api = null;
		this._chatContainer = null;
	}

	_updateTheme() {
		if (!this._chatContainer) return;
		const theme = this._settings.get_string("theme");
		this._chatContainer.remove_style_class_name("simple-light");
		this._chatContainer.remove_style_class_name("simple-dark");
		if (theme === "light") this._chatContainer.add_style_class_name("simple-light");
		else if (theme === "dark")
			this._chatContainer.add_style_class_name("simple-dark");
	}

	_buildUi() {
		const chatHeight = this._settings.get_int("chat-height") || 500;
		this._chatContainer = new St.BoxLayout();
		this._chatContainer.vertical = true;
		this._chatContainer.style_class = "chat-container";
		this._chatContainer.width = 400;
		this._chatContainer.height = chatHeight;

		const header = new St.BoxLayout();
		header.style_class = "chat-header";

		const title = new St.Label();
		title.text = "Simple AI Assistant";
		title.x_expand = true;
		title.y_align = Clutter.ActorAlign.CENTER;

		const settingsBtn = new St.Button();
		settingsBtn.style_class = "settings-button";
		const sIcon = new St.Icon();
		sIcon.icon_name = "emblem-system-symbolic";
		sIcon.icon_size = 16;
		settingsBtn.set_child(sIcon);
		settingsBtn.connect("clicked", () => this.openPreferences());

		const newChatBtn = new St.Button();
		newChatBtn.style_class = "button";
		newChatBtn.label = "New Chat";
		newChatBtn.connect("clicked", () => this._newChat());

		header.add_child(title);
		header.add_child(settingsBtn);
		header.add_child(newChatBtn);
		this._chatContainer.add_child(header);

		this._chatScroll = new St.ScrollView();
		this._chatScroll.style_class = "chat-scroll";
		this._chatScroll.x_expand = true;
		this._chatScroll.y_expand = true;

		this._chatBox = new St.BoxLayout();
		this._chatBox.vertical = true;
		this._chatBox.style_class = "chat-box";

		this._chatScroll.add_child(this._chatBox);
		this._chatContainer.add_child(this._chatScroll);

		if (this._history) {
			this._history
				.filter(m => m.role !== "system")
				.forEach(m => this._addMessageToUi(m.role, m.content));
		}

		const inputArea = new St.BoxLayout();
		inputArea.style_class = "chat-input-area";

		this._input = new St.Entry();
		this._input.style_class = "chat-input";
		this._input.hint_text = "Type a message...";
		this._input.x_expand = true;
		this._input.clutter_text.connect("activate", () => this._sendMessage());

		inputArea.add_child(this._input);
		this._chatContainer.add_child(inputArea);

		this._indicator.menu.box.add_child(this._chatContainer);
	}

	async _sendMessage() {
		const text = this._input.get_text();
		if (!text) return;
		this._input.set_text("");

		if (this._history.length === 0 || this._history[0].role !== "system") {
			this._history.unshift({role: "system", content: SYSTEM_PROMPT});
		}

		// Use global setting only
		if (
			this._history.filter(m => m.role !== "system").length === 0 &&
			this._settings.get_boolean("send-device-info")
		) {
			const info = Device.getDeviceInfo();
			if (!this._history[0].content.includes("User System Info:")) {
				this._history[0].content += "\n\nUser System Info:\n" + info;
			}
		}

		this._history.push({role: "user", content: text});
		this._addMessageToUi("user", text);

		await this._getAiResponse();
	}

	async _getAiResponse() {
		try {
			const provider = this._settings.get_string("api-provider");
			const apiKey = this._settings.get_string(`${provider}-api-key`);
			const model = this._settings.get_string(`${provider}-model`);

			const loadingId = this._addMessageToUi("assistant", "Thinking...");
			const response = await this._api.sendMessage(
				provider,
				apiKey,
				model,
				this._history,
			);
			if (loadingId) this._chatBox.remove_child(loadingId);

			this._history.push({role: "assistant", content: response});
			this._addMessageToUi("assistant", response);
			History.saveHistory(this._history, this._settings.get_int("history-limit"));
		} catch (e) {
			this._addMessageToUi("assistant", `Error: ${e.message}`);
		}
	}

	_newChat() {
		this._history = [];
		History.clearHistory();
		this._chatBox.destroy_all_children();
	}

	_addMessageToUi(role, content) {
		if (!content) return null;

		const msgBox = new St.BoxLayout();
		msgBox.vertical = true;
		msgBox.style_class = `message-box ${role}-message`;

		const label = new St.Label();
		label.style_class = "message-text";
		try {
			label.clutter_text.set_markup(Utils.formatMessage(content));
		} catch (e) {
			label.clutter_text.set_text(content);
		}
		label.clutter_text.line_wrap = true;
		label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
		msgBox.add_child(label);

		const matches = content.matchAll(/\[RUN: (.*?)\]/g);
		for (const m of matches) {
			const cmd = m[1];
			const btn = new St.Button();
			btn.style_class = "run-button";
			btn.label = `Run: ${cmd.length > 25 ? cmd.substring(0, 25) + "..." : cmd}`;
			btn.connect("clicked", () => {
				btn.hide();
				this._runCommand(cmd, msgBox);
			});
			msgBox.add_child(btn);
		}

		this._chatBox.add_child(msgBox);

		// Improved scrolling logic
		GLib.idle_add(GLib.PRIORITY_LOW, () => {
			if (this._chatScroll) {
				const adj = this._chatScroll.vscroll.adjustment;
				adj.value = adj.upper - adj.page_size;
			}
			return false;
		});
		return msgBox;
	}

	async _runCommand(cmd, msgBox) {
		const box = new St.BoxLayout();
		box.vertical = true;
		box.style_class = "terminal-box";

		const label = new St.Label();
		label.text = "Executing...";
		label.style_class = "terminal-text";

		box.add_child(label);
		msgBox.add_child(box);

		try {
			const [res, stdout, stderr] = await this._spawnCommandLineAsync(cmd);
			const decoder = new TextDecoder("utf-8");
			const out = decoder.decode(new Uint8Array(stdout.get_data())).trim();
			const err = decoder.decode(new Uint8Array(stderr.get_data())).trim();
			const result = out || err || "Done (no output)";

			label.text = result.split("\n").slice(-3).join("\n");

			this._history.push({
				role: "user",
				content: `COMMAND OUTPUT for "${cmd}":\n${result}`,
			});
			await this._getAiResponse();
		} catch (e) {
			label.text = `Error: ${e.message}`;
		}
	}

	_spawnCommandLineAsync(cmd) {
		return new Promise((resolve, reject) => {
			try {
				const [success, argv] = GLib.shell_parse_argv(cmd);
				const [res, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
					null,
					argv,
					null,
					GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
					null,
				);
				const outStream = new Gio.DataInputStream({
					base_stream: new Gio.UnixInputStream({fd: stdout, close_fd: true}),
				});
				const errStream = new Gio.DataInputStream({
					base_stream: new Gio.UnixInputStream({fd: stderr, close_fd: true}),
				});
				const ob = [],
					eb = [];
				const read = (s, d) =>
					new Promise(r => {
						const f = () =>
							s.read_line_async(GLib.PRIORITY_LOW, null, (st, res) => {
								try {
									const [l] = st.read_line_finish(res);
									if (l !== null) {
										d.push(l);
										f();
									} else r();
								} catch (e) {
									r();
								}
							});
						f();
					});
				Promise.all([read(outStream, ob), read(errStream, eb)]).then(() => {
					const merge = bufs => {
						const total = bufs.reduce((a, b) => a + b.length + 1, 0);
						const u = new Uint8Array(total);
						let p = 0;
						for (const b of bufs) {
							u.set(b, p);
							p += b.length;
							u[p++] = 10;
						}
						return GLib.Bytes.new(u);
					};
					resolve([true, merge(ob), merge(eb)]);
				});
			} catch (e) {
				reject(e);
			}
		});
	}
}
