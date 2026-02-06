import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Pango from "gi://Pango";
import Shell from "gi://Shell";
import St from "gi://St";

import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";

import * as Api from "./api.js";
import * as Device from "./device.js";
import * as History from "./history.js";
import {SYSTEM_PROMPT} from "./prompts.js";
import * as Utils from "./utils.js";

const TIMEOUT_SECONDS = 60;

export default class SimpleAiAssistantExtension extends Extension {
	enable() {
		try {
			this._settings = this.getSettings();
			this._api = new Api.ApiClient();
			this._history = History.loadHistory() || [];
			this._cancellable = null;
			this._commandCancellable = null;

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
				console.warn(`Simple AI Assistant: Failed to load icon: ${e.message}`);
			}

			this._buildUi();
			Main.panel.addToStatusArea("simple-ai-assistant", this._indicator);

			this._heightId = this._settings.connect("changed::chat-height", () =>
				this._updateSize(),
			);
			this._widthId = this._settings.connect("changed::chat-width", () =>
				this._updateSize(),
			);

			this._providerId = this._settings.connect("changed::api-provider", () =>
				this._updateApiReminder(),
			);
			this._updateApiReminder();

			// Register keyboard shortcut
			this._shortcutId = this._settings.connect("changed::keyboard-shortcut", () =>
				this._updateShortcut(),
			);
			this._updateShortcut();
		} catch (e) {
			console.error(`Simple AI Assistant: Enable Error: ${e.message}`);
		}
	}

	disable() {
		// Cancel any pending operations
		if (this._cancellable) {
			this._cancellable.cancel();
			this._cancellable = null;
		}
		if (this._commandCancellable) {
			this._commandCancellable.cancel();
			this._commandCancellable = null;
		}

		// Remove keyboard shortcut
		Main.wm.removeKeybinding("keyboard-shortcut");

		if (this._heightId) this._settings.disconnect(this._heightId);
		if (this._widthId) this._settings.disconnect(this._widthId);
		if (this._providerId) this._settings.disconnect(this._providerId);
		if (this._shortcutId) this._settings.disconnect(this._shortcutId);
		if (this._indicator) this._indicator.destroy();
		this._indicator = null;
		this._settings = null;
		this._api = null;
		this._chatContainer = null;
	}

	_updateShortcut() {
		// Remove existing binding
		Main.wm.removeKeybinding("keyboard-shortcut");

		const shortcut = this._settings.get_strv("keyboard-shortcut");
		if (shortcut && shortcut.length > 0 && shortcut[0]) {
			Main.wm.addKeybinding(
				"keyboard-shortcut",
				this._settings,
				Meta.KeyBindingFlags.NONE,
				Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
				() => {
					if (this._indicator) {
						this._indicator.menu.toggle();
					}
				},
			);
		}
	}

	_updateSize() {
		if (!this._chatContainer) return;

		const monitor = Main.layoutManager.primaryMonitor;
		const maxWidth = monitor.width * 0.9;
		const maxHeight = monitor.height * 0.9;

		// Default to 40% height if unset or too small, otherwise use setting
		let targetHeight = this._settings.get_int("chat-height");
		if (targetHeight < 100) targetHeight = Math.floor(monitor.height * 0.4);

		let targetWidth = this._settings.get_int("chat-width");
		if (targetWidth < 100) targetWidth = 500;

		this._chatContainer.width = Math.min(targetWidth, maxWidth);
		this._chatContainer.height = Math.min(targetHeight, maxHeight);
	}

	_buildUi() {
		this._chatContainer = new St.BoxLayout();
		this._chatContainer.vertical = true;
		this._chatContainer.style_class = "chat-container";

		this._updateSize();

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

		// Input Area + API Reminder
		const bottomArea = new St.BoxLayout();
		bottomArea.vertical = true;

		this._apiReminder = new St.Label({
			style_class: "api-reminder",
			text: "⚠️ Please add your API Key in settings if you haven't already",
			visible: false,
		});
		bottomArea.add_child(this._apiReminder);

		const inputArea = new St.BoxLayout();
		inputArea.style_class = "chat-input-area";
		this._input = new St.Entry();
		this._input.style_class = "chat-input";
		this._input.hint_text = "Type a message...";
		this._input.x_expand = true;
		this._input.clutter_text.connect("activate", () => this._sendMessage());
		inputArea.add_child(this._input);
		bottomArea.add_child(inputArea);

		this._chatContainer.add_child(bottomArea);

		// Populate content
		if (this._history && this._history.filter(m => m.role !== "system").length > 0) {
			this._history
				.filter(m => m.role !== "system")
				.forEach(m => this._addMessageToUi(m.role, m.content));
		} else {
			this._showEmptyState();
		}

		this._indicator.menu.box.add_child(this._chatContainer);
	}

	_showEmptyState() {
		this._chatBox.destroy_all_children();

		this._emptyState = new St.BoxLayout();
		this._emptyState.vertical = true;
		this._emptyState.style_class = "empty-state";
		this._emptyState.x_expand = true;
		this._emptyState.y_expand = true;
		this._emptyState.y_align = Clutter.ActorAlign.CENTER;

		const title = new St.Label({
			text: "What can I help with today?",
			style_class: "empty-state-title",
		});
		this._emptyState.add_child(title);

		const examples = [
			"My bluetooth doesn't turn on",
			"Check why my system's resource usage is high",
			"How to take a screenshot in GNOME?",
		];

		examples.forEach(ex => {
			const btn = new St.Button({
				label: ex,
				style_class: "example-chip",
				x_align: Clutter.ActorAlign.CENTER,
			});
			btn.connect("clicked", () => {
				this._input.text = ex;
				this._sendMessage();
			});
			this._emptyState.add_child(btn);
		});

		this._chatBox.add_child(this._emptyState);
	}

	_updateApiReminder() {
		if (!this._apiReminder) return;
		const provider = this._settings.get_string("api-provider");
		const key = this._settings.get_string(`${provider}-api-key`);
		this._apiReminder.visible = !key;
	}

	async _sendMessage() {
		const text = this._input.get_text();
		if (!text) return;
		this._input.set_text("");

		if (this._emptyState) {
			this._chatBox.remove_child(this._emptyState);
			this._emptyState = null;
		}

		if (this._history.length === 0 || this._history[0].role !== "system") {
			this._history.unshift({role: "system", content: SYSTEM_PROMPT});
		}

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
			this._updateApiReminder();
			const provider = this._settings.get_string("api-provider");
			const apiKey = this._settings.get_string(`${provider}-api-key`);
			const model = this._settings.get_string(`${provider}-model`);

			if (!apiKey) {
				this._addMessageToUi(
					"assistant",
					"<b>API Key missing!</b> Please go to settings.",
				);
				return;
			}

			// Create loading message with cancel button
			const loadingBox = new St.BoxLayout({
				vertical: false,
				style_class: "message-box assistant-message",
			});
			const loadingLabel = new St.Label({
				text: "Thinking...",
				style_class: "message-text",
			});
			loadingBox.add_child(loadingLabel);

			const cancelBtn = new St.Button({
				label: "Cancel",
				style_class: "cancel-button",
			});
			this._cancellable = new Gio.Cancellable();
			cancelBtn.connect("clicked", () => {
				if (this._cancellable) {
					this._cancellable.cancel();
				}
			});
			loadingBox.add_child(cancelBtn);
			this._chatBox.add_child(loadingBox);
			this._scrollToBottom();

			try {
				const response = await this._api.sendMessage(
					provider,
					apiKey,
					model,
					this._history,
					this._cancellable,
				);

				this._chatBox.remove_child(loadingBox);
				this._cancellable = null;

				this._history.push({role: "assistant", content: response});
				this._addMessageToUi("assistant", response);
				History.saveHistory(
					this._history,
					this._settings.get_int("history-limit"),
				);
			} catch (e) {
				this._chatBox.remove_child(loadingBox);
				this._cancellable = null;

				if (e.matches && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
					this._addMessageToUi("assistant", "<i>Request cancelled.</i>");
				} else {
					this._addMessageToUi("assistant", `Error: ${e.message}`);
				}
			}
		} catch (e) {
			this._addMessageToUi("assistant", `Error: ${e.message}`);
		}
	}

	_newChat() {
		// Cancel any pending operations
		if (this._cancellable) {
			this._cancellable.cancel();
			this._cancellable = null;
		}
		if (this._commandCancellable) {
			this._commandCancellable.cancel();
			this._commandCancellable = null;
		}

		this._history = [];
		History.clearHistory();
		this._chatBox.destroy_all_children();
		this._showEmptyState();
	}

	_addMessageToUi(role, content) {
		if (!content) return null;
		if (this._emptyState) {
			this._chatBox.remove_child(this._emptyState);
			this._emptyState = null;
		}

		const msgBox = new St.BoxLayout();
		msgBox.vertical = true;
		msgBox.style_class = `message-box ${role}-message`;

		// Header with copy button
		const headerBox = new St.BoxLayout({style_class: "message-header"});
		headerBox.x_expand = true;

		const spacer = new St.Widget({x_expand: true});
		headerBox.add_child(spacer);

		const copyBtn = new St.Button({style_class: "copy-button"});
		const copyIcon = new St.Icon({icon_name: "edit-copy-symbolic", icon_size: 14});
		copyBtn.set_child(copyIcon);
		copyBtn.connect("clicked", () => {
			// Copy plain text content to clipboard
			const clipboard = St.Clipboard.get_default();
			clipboard.set_text(St.ClipboardType.CLIPBOARD, content);
			// Visual feedback
			copyIcon.icon_name = "emblem-ok-symbolic";
			GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
				copyIcon.icon_name = "edit-copy-symbolic";
				return false;
			});
		});
		headerBox.add_child(copyBtn);
		msgBox.add_child(headerBox);

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
		this._scrollToBottom();
		return msgBox;
	}

	_scrollToBottom() {
		GLib.idle_add(GLib.PRIORITY_LOW, () => {
			if (this._chatScroll) {
				const adj = this._chatScroll.vadjustment;
				adj.value = adj.upper - adj.page_size;
			}
			return false;
		});
	}

	async _runCommand(cmd, msgBox) {
		const box = new St.BoxLayout();
		box.vertical = true;
		box.style_class = "terminal-box";

		const headerBox = new St.BoxLayout();
		const label = new St.Label({
			text: "Executing...",
			style_class: "terminal-text",
			x_expand: true,
		});
		headerBox.add_child(label);

		// Cancel button for command execution
		const cancelBtn = new St.Button({label: "Cancel", style_class: "cancel-button"});
		this._commandCancellable = new Gio.Cancellable();
		let commandPid = null;

		cancelBtn.connect("clicked", () => {
			if (this._commandCancellable) {
				this._commandCancellable.cancel();
			}
			if (commandPid) {
				try {
					GLib.spawn_command_line_async(`kill ${commandPid}`);
				} catch (e) {
					// Ignore kill errors
				}
			}
			label.text = "Cancelled";
		});
		headerBox.add_child(cancelBtn);
		box.add_child(headerBox);
		msgBox.add_child(box);

		try {
			// Check if command requires sudo - wrap in gnome-terminal for password prompt
			let actualCmd = cmd;
			if (cmd.trim().startsWith("sudo ")) {
				// Use gnome-terminal for sudo commands so password prompt works
				actualCmd = `gnome-terminal -- bash -c '${cmd.replace(/'/g, "'\\''")}; echo ""; echo "Press Enter to close..."; read'`;
				label.text = "Opening terminal for sudo command...";
				GLib.spawn_command_line_async(actualCmd);

				// For sudo commands opened in terminal, we don't get output back
				// So we just note that we opened it
				GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
					label.text = "Command opened in terminal (check the terminal window)";
					cancelBtn.hide();
					return false;
				});
				return;
			}

			const [res, stdout, stderr] = await this._spawnCommandLineAsyncWithTimeout(
				actualCmd,
				TIMEOUT_SECONDS,
			);
			cancelBtn.hide();

			const decoder = new TextDecoder("utf-8");
			const out = decoder.decode(new Uint8Array(stdout.get_data())).trim();
			const err = decoder.decode(new Uint8Array(stderr.get_data())).trim();
			const result = out || err || "Done (no output)";
			label.text = result.split("\n").slice(-5).join("\n");
			this._history.push({
				role: "user",
				content: `COMMAND OUTPUT for "${cmd}":\n${result}`,
			});
			await this._getAiResponse();
		} catch (e) {
			cancelBtn.hide();
			if (e.message === "Command timed out") {
				label.text = `Timeout: Command exceeded ${TIMEOUT_SECONDS}s limit`;
				this._history.push({
					role: "user",
					content: `COMMAND TIMEOUT for "${cmd}": Exceeded ${TIMEOUT_SECONDS} seconds`,
				});
			} else if (e.message === "Cancelled") {
				label.text = "Command cancelled";
			} else {
				const errorMsg = `COMMAND ERROR for "${cmd}":\n${e.message}`;
				label.text = `Error: ${e.message}`;
				this._history.push({role: "user", content: errorMsg});
			}
			await this._getAiResponse();
		} finally {
			this._commandCancellable = null;
		}
	}

	_spawnCommandLineAsyncWithTimeout(cmd, timeoutSeconds) {
		return new Promise((resolve, reject) => {
			try {
				const [success, argv] = GLib.shell_parse_argv(cmd);
				const [res, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
					null,
					argv,
					null,
					GLib.SpawnFlags.SEARCH_PATH,
					null,
				);

				const os = new Gio.DataInputStream({
					base_stream: new Gio.UnixInputStream({fd: stdout, close_fd: true}),
				});
				const es = new Gio.DataInputStream({
					base_stream: new Gio.UnixInputStream({fd: stderr, close_fd: true}),
				});

				let timedOut = false;
				let completed = false;

				// Set up timeout
				const timeoutId = GLib.timeout_add_seconds(
					GLib.PRIORITY_DEFAULT,
					timeoutSeconds,
					() => {
						if (!completed) {
							timedOut = true;
							try {
								GLib.spawn_command_line_async(`kill ${pid}`);
							} catch (e) {
								// Ignore
							}
						}
						return false;
					},
				);

				// Add child watch to reap the process
				GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {
					completed = true;
					GLib.Source.remove(timeoutId);
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

				Promise.all([read(os, ob), read(es, eb)]).then(() => {
					if (timedOut) {
						reject(new Error("Command timed out"));
						return;
					}

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
