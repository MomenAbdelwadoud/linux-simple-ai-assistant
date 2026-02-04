# Simple AI Assistant GNOME Extension

A lightweight, modular chat assistant for your GNOME desktop.

## ✨ Features

- **Dual API Support**: OpenAI (`gpt-4o-mini`) and Gemini (`gemini-1.5-flash`).
- **🐚 Terminal Integration**: AI can suggest commands that you can run with a single click.
- **🌗 Theme Support**: Follow the system theme or choose "Simple Light" / "Simple Dark".
- **💾 Lightweight History**: Persistent JSON storage with automatic truncation (keeps last 20 messages).
- **💻 Device Info Helper**: Toggleable system spec sharing for better debugging assistance.
- **🧩 Modular Architecture**: Cleanly separated logic for prompts, history, and system integration.

## 🚀 Installation

1. Create the extension directory:

    ```bash
    mkdir -p ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes
    ```

2. Copy the files to that directory:

    ```bash
    cp -r * ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes/
    ```

3. Compile the GSettings schema:

    ```bash
    glib-compile-schemas ~/.local/share/gnome-shell/extensions/simple-ai-assistant@momen.codes/schemas/
    ```

4. Restart GNOME Shell:
    - **Wayland**: Log out and log back in.
    - **X11**: Press `Alt+F2`, type `r`, and press `Enter`.

5. Enable the extension:
    ```bash
    gnome-extensions enable simple-ai-assistant@momen.codes
    ```

## 🛡 Security

Commands provided by the AI are **never run automatically**. You must explicitly click the "Run Command" button in the chat UI. Always review commands before running them.
