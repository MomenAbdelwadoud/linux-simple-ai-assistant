/*
 * Simple AI Assistant
 * Copyright (C) 2026 Momen Elkhalifa
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

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

		const inputArea = new St.BoxLayout({
			style_class: "chat-input-area",
		});
		inputArea.style = "spacing: 8px;";

		this._input = new St.Entry();
		this._input.style_class = "chat-input";
		this._input.hint_text = "Type a message...";
		this._input.x_expand = true;
		this._input.clutter_text.connect("activate", () => this._sendMessage());

		// Send Button
		this._sendBtn = new St.Button({
			style_class: "send-button",
			can_focus: true,
			reactive: true, // starts enabled, but updated logic below
		});
		const sendIcon = new St.Icon({
			icon_name: "go-next-symbolic", // Simple arrow right
			icon_size: 16,
		});
		this._sendBtn.set_child(sendIcon);
		this._sendBtn.connect("clicked", () => this._sendMessage());

		// Monitor input to enable/disable send button
		this._input.clutter_text.connect("notify::text", () => {
			const text = this._input.get_text();
			this._sendBtn.reactive = text && text.trim().length > 0;
			this._sendBtn.opacity = this._sendBtn.reactive ? 255 : 128;
		});
		// Initial state
		this._sendBtn.reactive = false;
		this._sendBtn.opacity = 128;

		inputArea.add_child(this._input);
		inputArea.add_child(this._sendBtn);
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

		// Autofocus when menu opens
		this._indicator.menu.connect("opened", () => {
			this._input.grab_key_focus();
		});
	}

	_showEmptyState() {
		this._chatBox.destroy_all_children();

		this._emptyState = new St.BoxLayout({
			vertical: true,
			style_class: "empty-state",
			x_expand: true,
			y_expand: true,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this._emptyState.style = "spacing: 15px;";

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
		if (!text || !text.trim()) return;
		this._input.set_text("");

		// Reset send button state
		this._sendBtn.reactive = false;
		this._sendBtn.opacity = 128;

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
				y_align: Clutter.ActorAlign.CENTER,
			});
			loadingBox.add_child(loadingLabel);

			const cancelBtn = new St.Button({
				label: "Cancel",
				style_class: "cancel-button",
				x_align: Clutter.ActorAlign.START,
				y_align: Clutter.ActorAlign.CENTER,
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
					this._addMessageToUi("assistant", "_Request cancelled._");
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

		// Main container for the message row (handles alignment and width)
		// For user: right aligned, max 90% width (handled by CSS + alignment)
		// For assistant: full width
		const msgRow = new St.BoxLayout({
			vertical: true,
			x_expand: true,
			x_align: role === "user" ? Clutter.ActorAlign.END : Clutter.ActorAlign.FILL,
		});
		msgRow.style_class =
			role === "user" ? "user-msg-container" : "assistant-msg-container";

		// The bubble itself (visual container)
		const bubbleWidget = new St.Widget({
			layout_manager: new Clutter.BinLayout(),
			x_expand: false,
			y_expand: false,
			x_align: role === "user" ? Clutter.ActorAlign.END : Clutter.ActorAlign.START,
		});
		// Apply style class to the bubble widget
		bubbleWidget.style_class = role === "user" ? "user-bubble" : "assistant-bubble";

		// 1. Message Text
		const label = new St.Label({
			style_class: "message-text",
			x_expand: true,
			y_expand: false,
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.START,
		});
		try {
			label.clutter_text.set_markup(Utils.formatMessage(content));
		} catch (e) {
			label.clutter_text.set_text(content);
		}
		label.clutter_text.line_wrap = true;
		label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

		bubbleWidget.add_child(label);

		// 2. Copy Button (Overlay - Top Right)
		const copyBtn = new St.Button({
			style_class: "copy-button",
			x_align: Clutter.ActorAlign.END,
			y_align: Clutter.ActorAlign.START,
			x_expand: false,
			y_expand: false,
		});
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

		bubbleWidget.add_child(copyBtn);

		msgRow.add_child(bubbleWidget);

		// Run Buttons and such (Append below the text, inside the row but outside the 'bubble' text area if needed,
		// but typically we want them associated.
		// If we put them in msgRow, they stack vertically below the bubbleWidget.
		const matches = content.matchAll(/\[RUN: (.*?)\]/g);
		for (const m of matches) {
			const cmd = m[1];
			const btn = new St.Button();
			btn.style_class = "run-button";
			btn.label = `Run: ${cmd.length > 25 ? cmd.substring(0, 25) + "..." : cmd}`;
			// Ensure it doesn't stretch to full width
			btn.x_align = Clutter.ActorAlign.START;

			btn.connect("clicked", () => {
				btn.hide();
				this._runCommand(cmd, msgRow);
			});
			msgRow.add_child(btn);
		}

		this._chatBox.add_child(msgRow);
		this._scrollToBottom();
		return msgRow;
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
			y_align: Clutter.ActorAlign.CENTER,
		});
		headerBox.add_child(label);

		// Cancel button for command execution
		const cancelBtn = new St.Button({
			label: "Cancel",
			style_class: "cancel-button",
			x_align: Clutter.ActorAlign.START,
		});
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
			// Check if command requires sudo - use pkexec for native password dialog and output capture
			let actualCmd = cmd;
			if (cmd.trim().startsWith("sudo ")) {
				const innerCmd = cmd.trim().substring(5);
				actualCmd = `pkexec bash -c '${innerCmd.replace(/'/g, "'\\''")}'`;
				label.text = "Authentication required...";
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
