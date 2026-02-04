# Testing Simple AI Assistant

To test your extension without restarting your main desktop session, you can use a **Nested GNOME Shell**.

## Prerequisites

- `gnome-shell` installed.
- `dbus-run-session` (usually part of `dbus-x11` or similar).

## Steps

1. **Install the extension locally**:

    ```bash
    mkdir -p ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes
    cp -r * ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes/
    glib-compile-schemas ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes/schemas/
    ```

2. **Run Nested Shell**:
   Open a terminal and run:

    ```bash
    dbus-run-session gnome-shell --nested --wayland
    ```

    A new window will open with a fresh GNOME session.

3. **Enable the extension in the nested shell**:
   In the nested shell window (or via a terminal if you can target the nested session's bus, but easier to just use the Extensions app inside if available), enable it:

    ```bash
    gnome-extensions enable simple-ai-assistant@momen.codes
    ```

4. **Debugging**:
   Check the logs for errors:
    ```bash
    journalctl -f -o cat /usr/bin/gnome-shell
    ```
    Or look at the terminal where you ran the nested shell.

## Security Review

- **Command Execution**: The extension uses `GLib.spawn_async_with_pipes` to run commands. It only runs commands when the **user explicitly clicks the "Run Command" button**.
- **API Keys**: Keys are stored in GSettings. They are not encrypted by default but are stored in your user profile. Avoid sharing your `history.json` or settings exports if they contain secrets.
- **History**: History is stored in `~/.cache/simple-ai-assistant/history.json`. It is truncated to 20 messages by default to prevent large files.
