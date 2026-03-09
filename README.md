# Obsidian Copilot

[![GitHub](https://img.shields.io/badge/GitHub-Obsidian--Copilot-blue?style=for-the-badge&logo=github)](https://github.com/reallygood83/obsidian-copilot)

Your AI coding assistant inside Obsidian, powered by **GitHub Copilot CLI**.

Have meaningful conversations with your codebase. Copilot understands your notes, reads your files, and helps you write better content—all directly within Obsidian sidebar.

---

## 🌟 Key Features

*   **💬 Chat with Context**: Chat with GitHub Copilot right in your sidebar.
*   **🧠 Context-Aware**: Copilot knows about your current note and conversation history.
*   **⚡ Fast & Lightweight**: Uses the official `copilot` CLI for speed and reliability.
*   **📎 Smart Attachments**: Reference other notes using `@` to give Copilot more context.
*   **✏️ Inline Edits**: Select text and ask Copilot to rewrite, summarize, or fix it in place.

---

## 🚀 Prerequisites

This plugin requires **GitHub Copilot CLI**.

1.  **Install Node.js** (v22 or higher)
2.  **Install Copilot CLI**:
    ```bash
    npm install -g @github/copilot
    ```
3.  **Authenticate**:
    Run this command in your terminal and follow the instructions:
    ```bash
    copilot login
    ```

---

## 📦 Installation

### Via BRAT (Recommended for Beta)

1.  Install **BRAT** from the Obsidian Community Plugins.
2.  Open command palette (`Cmd/Ctrl + P`) -> `BRAT: Add a beta plugin for testing`.
3.  Enter the repository URL: `https://github.com/reallygood83/obsidian-copilot`.
4.  Enable "Obsidian Copilot" in Community Plugins settings.

### Manual Installation

1.  Clone this repository into your `.obsidian/plugins` folder.
2.  Run `npm install && npm run build`.
3.  Enable the plugin in Obsidian settings.

---

## 🎮 Usage

1.  **Open Chat**: Click the robot icon in the left ribbon or run "Open chat view" command.
2.  **Ask Questions**: Type your question. Copilot will answer based on the context.
3.  **Attach Files**: Type `@` to link specific notes or folders to the conversation.
4.  **Inline Edit**: Select text in any note -> Run "Inline edit" command -> Describe changes.

---

## ⚙️ Configuration

*   **Copilot CLI Path**: If Copilot is not found automatically, enter the full path to the executable (e.g., `/usr/local/bin/copilot`).
*   **GitHub Token** (Optional): Provide a `GH_TOKEN` if you prefer not to use the global auth session.

---

## 📜 License

[MIT License](LICENSE)
