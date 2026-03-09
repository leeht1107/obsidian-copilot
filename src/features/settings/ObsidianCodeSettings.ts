import * as fs from 'fs';

import type { App } from 'obsidian';
import { Notice, PluginSettingTab, Setting } from 'obsidian';

import { COPILOT_MODELS, DEFAULT_MODEL } from '../../core/types/models';
import type ObsidianCodePlugin from '../../main';
import { expandHomePath } from '../../utils/path';

export class ObsidianCodeSettingTab extends PluginSettingTab {
  plugin: ObsidianCodePlugin;

  constructor(app: App, plugin: ObsidianCodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('oc-settings');

    new Setting(containerEl).setName('Copilot').setHeading();

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Choose the default GitHub Copilot model. Auto lets Copilot pick for you.')
      .addDropdown((dropdown) => {
        for (const model of COPILOT_MODELS) {
          dropdown.addOption(model.value, `${model.label} - ${model.costLabel}`);
        }

        dropdown
          .setValue(this.plugin.settings.model || DEFAULT_MODEL)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();

            const selectedModel = COPILOT_MODELS.find((model) => model.value === value);
            if (selectedModel?.requiresEnablement) {
              new Notice('This model may require enablement in GitHub Copilot settings.', 5000);
            }
          });
      });

    new Setting(containerEl)
      .setName('Display name')
      .setDesc('Used for the welcome message.')
      .addText((text) =>
        text
          .setPlaceholder('Your name')
          .setValue(this.plugin.settings.userName)
          .onChange(async (value) => {
            this.plugin.settings.userName = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Excluded tags')
      .setDesc('Notes with these tags will not auto-attach as context. One tag per line, without #.')
      .addTextArea((text) => {
        text
          .setPlaceholder('private\ndraft\narchive')
          .setValue(this.plugin.settings.excludedTags.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludedTags = value
              .split(/\r?\n/)
              .map((entry) => entry.trim().replace(/^#/, ''))
              .filter((entry) => entry.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 30;
      });

    new Setting(containerEl)
      .setName('Custom system prompt')
      .setDesc('Optional instructions appended to the built-in Copilot prompt.')
      .addTextArea((text) => {
        text
          .setPlaceholder('Keep answers concise and use markdown tables sparingly.')
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 50;
      });

    new Setting(containerEl).setName('Authentication').setHeading();

    new Setting(containerEl)
      .setName('GitHub token')
      .setDesc('Optional. Uses `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, and `GITHUB_TOKEN` for the child process when set.')
      .addText((text) =>
        text
          .setPlaceholder('github_pat_...')
          .setValue(this.plugin.settings.githubToken)
          .onChange(async (value) => {
            this.plugin.settings.githubToken = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName('Advanced').setHeading();

    const cliPathSetting = new Setting(containerEl)
      .setName('Copilot CLI path')
      .setDesc('Leave empty to use `copilot` from PATH.')
      .addText((text) => {
        text
          .setPlaceholder('copilot')
          .setValue(this.plugin.settings.copilotCliPath)
          .onChange(async (value) => {
            this.plugin.settings.copilotCliPath = value.trim();
            await this.plugin.saveSettings();
            validateCliPath(value, cliPathSetting);
          });
      });

    validateCliPath(this.plugin.settings.copilotCliPath, cliPathSetting);

    new Setting(containerEl)
      .setName('Environment variables')
      .setDesc('Optional extra environment variables passed to the Copilot CLI child process.')
      .addTextArea((text) => {
        text
          .setPlaceholder('KEY=value')
          .setValue(this.plugin.settings.environmentVariables)
          .onChange(async (value) => {
            this.plugin.settings.environmentVariables = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 50;
      });
  }
}

function validateCliPath(rawPath: string, setting: Setting): void {
  const pathValue = rawPath.trim();

  if (!pathValue || pathValue === 'copilot') {
    setting.descEl.setText('Leave empty to use `copilot` from PATH.');
    return;
  }

  const expandedPath = expandHomePath(pathValue);
  if (fs.existsSync(expandedPath)) {
    setting.descEl.setText(`Using custom Copilot CLI: ${expandedPath}`);
    return;
  }

  setting.descEl.setText(`Warning: path not found - ${expandedPath}`);
}
