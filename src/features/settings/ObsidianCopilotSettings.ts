import * as fs from 'fs';

import type { App } from 'obsidian';
import { Notice, PluginSettingTab, Setting } from 'obsidian';

import { getCurrentPlatformKey } from '../../core/types';
import { COPILOT_MODELS } from '../../core/types/models';
import type ObsidianCopilotPlugin from '../../main';
import { EnvSnippetManager, McpSettingsManager, SlashCommandSettings } from '../../ui';
import { expandHomePath } from '../../utils/path';
import { buildNavMappingText, parseNavMappings } from './keyboardNavigation';
import {
  getInstalledSkills,
  installObsidianSkills,
  installSkillFromUrl,
  isObsidianSkillsInstalled,
  removeSkill,
  uninstallObsidianSkills,
} from '../skills/ObsidianSkillsInstaller';

function formatHotkey(hotkey: { modifiers: string[]; key: string }): string {
  const isMac = navigator.platform.includes('Mac');
  const modMap: Record<string, string> = isMac
    ? { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' }
    : { Mod: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win' };

  const mods = hotkey.modifiers.map((modifier) => modMap[modifier] || modifier);
  const key = hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key;
  return isMac ? [...mods, key].join('') : [...mods, key].join('+');
}

function openHotkeySettings(app: App): void {
  const setting = (app as any).setting;
  setting.open();
  setting.openTabById('hotkeys');
  setTimeout(() => {
    const tab = setting.activeTab;
    if (!tab) return;
    const searchEl = tab.searchInputEl ?? tab.searchComponent?.inputEl;
    if (!searchEl) return;
    searchEl.value = 'Obsidian Copilot';
    tab.updateHotkeyVisibility?.();
  }, 100);
}

function getHotkeyForCommand(app: App, commandId: string): string | null {
  const hotkeyManager = (app as any).hotkeyManager;
  if (!hotkeyManager) return null;

  const customHotkeys = hotkeyManager.customKeys?.[commandId];
  const defaultHotkeys = hotkeyManager.defaultKeys?.[commandId];
  const hotkeys = customHotkeys?.length > 0 ? customHotkeys : defaultHotkeys;
  if (!hotkeys || hotkeys.length === 0) return null;
  return hotkeys.map(formatHotkey).join(', ');
}

export class ObsidianCopilotSettingTab extends PluginSettingTab {
  plugin: ObsidianCopilotPlugin;

  constructor(app: App, plugin: ObsidianCopilotPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ocop-settings');

    new Setting(containerEl).setName('Quick Start').setHeading();
    containerEl.createDiv({
      cls: 'setting-item-description',
      text: 'Start here: choose your default model, install Obsidian context support, and set up MCP if you need external tools.',
    });

    new Setting(containerEl)
      .setName('What should Obsidian Copilot call you?')
      .setDesc('Your name for personalized greetings (leave empty for generic greetings)')
      .addText((text) =>
        text
          .setPlaceholder('Enter your name')
          .setValue(this.plugin.settings.userName)
          .onChange(async (value) => {
            this.plugin.settings.userName = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default model')
      .setDesc('Choose the default GitHub Copilot model for chat and inline tasks.')
      .addDropdown((dropdown) => {
        for (const model of COPILOT_MODELS) {
          dropdown.addOption(model.value, `${model.label} - ${model.costLabel}`);
        }
        dropdown
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName('Skills & Obsidian Context').setHeading();

    const skillsDesc = containerEl.createDiv({ cls: 'ocop-skills-settings-desc' });
    skillsDesc.createEl('p', {
      text: 'Install Obsidian-specific skills so Copilot understands wikilinks, callouts, properties, and canvas files.',
      cls: 'setting-item-description',
    });

    const skillsInstalled = isObsidianSkillsInstalled(this.app);
    new Setting(containerEl)
      .setName('Obsidian context skills')
      .setDesc(
        skillsInstalled
          ? 'Installed - Copilot understands Obsidian syntax better.'
          : 'Not installed - recommended for most students.'
      )
      .addButton((button) => {
        if (skillsInstalled) {
          button.setButtonText('Reinstall').onClick(async () => {
            await installObsidianSkills(this.app);
            this.display();
          });
        } else {
          button.setButtonText('Install').setCta().onClick(async () => {
            await installObsidianSkills(this.app);
            this.display();
          });
        }
      })
      .addButton((button) => {
        if (skillsInstalled) {
          button.setButtonText('Remove').onClick(async () => {
            await uninstallObsidianSkills(this.app);
            this.display();
          });
        }
      });

    let skillUrl = '';
    let textInput: HTMLInputElement | null = null;
    new Setting(containerEl)
      .setName('Install custom skill from GitHub')
      .setDesc('Enter a GitHub repository URL or raw SKILL.md link to add another skill to Copilot.')
      .addText((text) => {
        textInput = text.inputEl;
        text
          .setPlaceholder('https://github.com/username/repo')
          .onChange(async (value) => {
            skillUrl = value;
          });
      })
      .addButton((button) => {
        button.setButtonText('Install').setCta().onClick(async () => {
          if (!skillUrl) {
            new Notice('Please enter a URL');
            return;
          }

          button.setButtonText('Installing...').setDisabled(true);
          try {
            const success = await installSkillFromUrl(this.app, skillUrl);
            if (success) {
              if (textInput) textInput.value = '';
              skillUrl = '';
              this.display();
            }
          } finally {
            button.setButtonText('Install').setDisabled(false);
          }
        });
      });

    const installedSkills = getInstalledSkills(this.app);
    if (installedSkills.length > 0) {
      const installedSkillsDesc = containerEl.createDiv({ cls: 'ocop-skills-installed-desc' });
      installedSkillsDesc.createEl('p', {
        text: `Installed Skills (${installedSkills.length}):`,
        cls: 'setting-item-description',
      });

      const skillsListEl = containerEl.createDiv({ cls: 'ocop-skills-list' });
      for (const skill of installedSkills) {
        const skillItemEl = skillsListEl.createDiv({ cls: 'ocop-skills-item' });
        const skillInfoEl = skillItemEl.createDiv({ cls: 'ocop-skills-item-info' });
        skillInfoEl.createSpan({ cls: 'ocop-skills-item-name', text: skill.name });
        if (skill.isBuiltIn) {
          skillInfoEl.createSpan({ cls: 'ocop-skills-builtin-badge', text: 'Built-in' });
        } else if (skill.isGlobal) {
          skillInfoEl.createSpan({ cls: 'ocop-skills-builtin-badge', text: 'Global' });
        }
        skillInfoEl.createDiv({
          cls: 'ocop-skills-item-desc',
          text: skill.description.length > 100 ? `${skill.description.substring(0, 100)}...` : skill.description,
        });

        if (!skill.isBuiltIn && !skill.isGlobal) {
          const removeBtn = skillItemEl.createEl('button', {
            text: 'Remove',
            cls: 'ocop-skills-remove-btn',
          });
          removeBtn.addEventListener('click', async () => {
            await removeSkill(this.app, skill.name);
            this.display();
          });
        }
      }
    } else {
      containerEl.createDiv({ cls: 'ocop-skills-empty', text: 'No skills installed. Install Obsidian context skills above or add a custom skill from GitHub.' });
    }

    new Setting(containerEl).setName('MCP Tools').setHeading();
    const mcpDesc = containerEl.createDiv({ cls: 'ocop-mcp-settings-desc' });
    mcpDesc.createEl('p', {
      text: 'Connect external MCP tools here. Beginners can use the built-in import flow with a GitHub URL or pasted JSON.',
      cls: 'setting-item-description',
    });
    const mcpContainer = containerEl.createDiv({ cls: 'ocop-mcp-container' });
    new McpSettingsManager(mcpContainer, this.plugin);

    new Setting(containerEl).setName('Chat Behavior').setHeading();
    containerEl.createDiv({
      cls: 'setting-item-description',
      text: 'Control how chat behaves day to day without touching advanced system settings.',
    });

    new Setting(containerEl)
      .setName('Excluded tags')
      .setDesc('Notes with these tags will not auto-load as context (one per line, without #)')
      .addTextArea((text) => {
        text
          .setPlaceholder('system\nprivate\ndraft')
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
      .setName('Media folder')
      .setDesc('Folder containing attachments/images. Leave empty for vault root.')
      .addText((text) => {
        text
          .setPlaceholder('attachments')
          .setValue(this.plugin.settings.mediaFolder)
          .onChange(async (value) => {
            this.plugin.settings.mediaFolder = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.addClass('ocop-settings-media-input');
      });

    new Setting(containerEl)
      .setName('Auto-generate conversation titles')
      .setDesc('Automatically generate conversation titles after the first exchange.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAutoTitleGeneration)
          .onChange(async (value) => {
            this.plugin.settings.enableAutoTitleGeneration = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.enableAutoTitleGeneration) {
      new Setting(containerEl)
        .setName('Title generation model')
        .setDesc('Model used for auto-generating conversation titles.')
        .addDropdown((dropdown) => {
          dropdown.addOption('', 'Auto');
          for (const model of COPILOT_MODELS) {
            dropdown.addOption(model.value, model.label);
          }
          dropdown
            .setValue(this.plugin.settings.titleGenerationModel || '')
            .onChange(async (value) => {
              this.plugin.settings.titleGenerationModel = value;
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl).setName('Workflows & Shortcuts').setHeading();
    containerEl.createDiv({
      cls: 'setting-item-description',
      text: 'Configure optional workflow presets and keyboard shortcuts once you are comfortable with the basics.',
    });

    const inlineEditCommandId = 'obsidian-copilot:inline-edit';
    const inlineEditHotkey = getHotkeyForCommand(this.app, inlineEditCommandId);
    new Setting(containerEl)
      .setName('Inline edit hotkey')
      .setDesc(inlineEditHotkey ? `Current: ${inlineEditHotkey}` : 'No hotkey set. Click to configure.')
      .addButton((button) => button.setButtonText(inlineEditHotkey ? 'Change' : 'Set hotkey').onClick(() => openHotkeySettings(this.app)));

    const openChatCommandId = 'obsidian-copilot:open-view';
    const openChatHotkey = getHotkeyForCommand(this.app, openChatCommandId);
    new Setting(containerEl)
      .setName('Open chat hotkey')
      .setDesc(openChatHotkey ? `Current: ${openChatHotkey}` : 'No hotkey set. Click to configure.')
      .addButton((button) => button.setButtonText(openChatHotkey ? 'Change' : 'Set hotkey').onClick(() => openHotkeySettings(this.app)));

    new Setting(containerEl).setName('Workflow Presets').setHeading();
    const slashCommandsDesc = containerEl.createDiv({ cls: 'ocop-slash-settings-desc' });
    slashCommandsDesc.createEl('p', {
      text: 'Create custom prompt templates triggered by /command. Use $ARGUMENTS for all arguments, $1/$2 for positional args, @file for file content, and !`bash` for command output.',
      cls: 'setting-item-description',
    });
    const slashCommandsContainer = containerEl.createDiv({ cls: 'ocop-slash-commands-container' });
    new SlashCommandSettings(slashCommandsContainer, this.plugin);

    new Setting(containerEl).setName('Safety & Permissions').setHeading();
    containerEl.createDiv({
      cls: 'setting-item-description',
      text: 'The toggle below is the main safety control for beginners. Detailed allow/block rules are in Advanced.',
    });

    new Setting(containerEl)
      .setName('Enable command blocklist')
      .setDesc('Block potentially dangerous shell commands')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableBlocklist)
          .onChange(async (value) => {
            this.plugin.settings.enableBlocklist = value;
            await this.plugin.saveSettings();
          })
      );

    const platformKey = getCurrentPlatformKey();
    const isWindows = platformKey === 'windows';
    const platformLabel = isWindows ? 'Windows' : 'Unix';

    new Setting(containerEl)
      .setName(`Blocked commands (${platformLabel})`)
      .setDesc(`Patterns to block on ${platformLabel} (one per line). Supports regex.`)
      .addTextArea((text) => {
        const placeholder = isWindows
          ? 'del /s /q\nrd /s /q\nRemove-Item -Recurse -Force'
          : 'rm -rf\nchmod 777\nmkfs';
        text
          .setPlaceholder(placeholder)
          .setValue(this.plugin.settings.blockedCommands[platformKey].join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.blockedCommands[platformKey] = value
              .split(/\r?\n/)
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 40;
      });

    if (isWindows) {
      new Setting(containerEl)
        .setName('Blocked commands (Unix/Git Bash)')
        .setDesc('Unix patterns also blocked on Windows because Git Bash can invoke them.')
        .addTextArea((text) => {
          text
            .setPlaceholder('rm -rf\nchmod 777\nmkfs')
            .setValue(this.plugin.settings.blockedCommands.unix.join('\n'))
            .onChange(async (value) => {
              this.plugin.settings.blockedCommands.unix = value
                .split(/\r?\n/)
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);
              await this.plugin.saveSettings();
            });
          text.inputEl.rows = 4;
          text.inputEl.cols = 40;
        });
    }

    new Setting(containerEl)
      .setName('Allowed export paths')
      .setDesc('Paths outside the vault where files can be exported (one per line). Supports ~ for home directory.')
      .addTextArea((text) => {
        const placeholder = process.platform === 'win32' ? '~/Desktop\n~/Downloads\n%TEMP%' : '~/Desktop\n~/Downloads\n/tmp';
        text
          .setPlaceholder(placeholder)
          .setValue(this.plugin.settings.allowedExportPaths.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.allowedExportPaths = value
              .split(/\r?\n/)
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 40;
      });

    const approvedDesc = containerEl.createDiv({ cls: 'ocop-approved-desc' });
    approvedDesc.createEl('p', {
      text: 'Actions that have been permanently approved (via Always Allow). These will not require approval in Safe mode.',
      cls: 'setting-item-description',
    });

    if (this.plugin.settings.permissions.length === 0) {
      containerEl.createDiv({
        cls: 'ocop-approved-empty',
        text: 'No approved actions yet. When you click Always Allow in the approval dialog, actions will appear here.',
      });
    } else {
      const listEl = containerEl.createDiv({ cls: 'ocop-approved-list' });
      for (const action of this.plugin.settings.permissions) {
        const itemEl = listEl.createDiv({ cls: 'ocop-approved-item' });
        const infoEl = itemEl.createDiv({ cls: 'ocop-approved-item-info' });
        infoEl.createSpan({ cls: 'ocop-approved-item-tool', text: action.toolName });
        infoEl.createDiv({ cls: 'ocop-approved-item-pattern', text: action.pattern });
        infoEl.createSpan({ cls: 'ocop-approved-item-date', text: new Date(action.approvedAt).toLocaleDateString() });
        const removeBtn = itemEl.createEl('button', { text: 'Remove', cls: 'ocop-approved-remove-btn' });
        removeBtn.addEventListener('click', async () => {
          this.plugin.settings.permissions = this.plugin.settings.permissions.filter((entry: typeof action) => entry !== action);
          await this.plugin.saveSettings();
          this.display();
        });
      }

      new Setting(containerEl)
        .setName('Clear all approved actions')
        .setDesc('Remove all permanently approved actions')
        .addButton((button) =>
          button.setButtonText('Clear all').setWarning().onClick(async () => {
            this.plugin.settings.permissions = [];
            await this.plugin.saveSettings();
            this.display();
          })
        );
    }

    new Setting(containerEl).setName('Authentication & Environment').setHeading();
    containerEl.createDiv({
      cls: 'setting-item-description',
      text: 'Most students can leave these alone if `copilot login` already worked in the terminal.',
    });

    new Setting(containerEl)
      .setName('GitHub token')
      .setDesc('Optional. Uses COPILOT_GITHUB_TOKEN, GH_TOKEN, and GITHUB_TOKEN for the Copilot child process when set.')
      .addText((text) =>
        text
          .setPlaceholder('github_pat_...')
          .setValue(this.plugin.settings.githubToken)
          .onChange(async (value) => {
            this.plugin.settings.githubToken = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Custom variables')
      .setDesc('Environment variables for Copilot CLI (KEY=VALUE format, one per line)')
      .addTextArea((text) => {
        text
          .setPlaceholder('COPILOT_GITHUB_TOKEN=your-token\nGH_TOKEN=your-token')
          .setValue(this.plugin.settings.environmentVariables)
          .onChange(async (value) => {
            await this.plugin.applyEnvironmentVariables(value);
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 50;
        text.inputEl.addClass('ocop-settings-env-textarea');
      });

    const envSnippetsContainer = containerEl.createDiv({ cls: 'ocop-env-snippets-container' });
    new EnvSnippetManager(envSnippetsContainer, this.plugin);

    new Setting(containerEl).setName('Advanced & Developer').setHeading();
    containerEl.createDiv({
      cls: 'setting-item-description',
      text: 'Only change these if you know why you need them. They are preserved here for power users and debugging.',
    });

    new Setting(containerEl)
      .setName('Custom system prompt')
      .setDesc('Additional instructions appended to the default Copilot prompt')
      .addTextArea((text) => {
        text
          .setPlaceholder('Add custom instructions here...')
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 50;
      });

    new Setting(containerEl)
      .setName('Vim-style navigation mappings')
      .setDesc('One mapping per line. Format: "map <key> <action>" (actions: scrollUp, scrollDown, focusInput).')
      .addTextArea((text) => {
        let pendingValue = buildNavMappingText(this.plugin.settings.keyboardNavigation);
        let saveTimeout: number | null = null;

        const commitValue = async (showError: boolean): Promise<void> => {
          if (saveTimeout !== null) {
            window.clearTimeout(saveTimeout);
            saveTimeout = null;
          }

          const result = parseNavMappings(pendingValue);
          if (!result.settings) {
            if (showError) {
              new Notice(`Invalid navigation mappings: ${result.error}`);
              pendingValue = buildNavMappingText(this.plugin.settings.keyboardNavigation);
              text.setValue(pendingValue);
            }
            return;
          }

          this.plugin.settings.keyboardNavigation.scrollUpKey = result.settings.scrollUp;
          this.plugin.settings.keyboardNavigation.scrollDownKey = result.settings.scrollDown;
          this.plugin.settings.keyboardNavigation.focusInputKey = result.settings.focusInput;
          await this.plugin.saveSettings();
          pendingValue = buildNavMappingText(this.plugin.settings.keyboardNavigation);
          text.setValue(pendingValue);
        };

        const scheduleSave = (): void => {
          if (saveTimeout !== null) {
            window.clearTimeout(saveTimeout);
          }
          saveTimeout = window.setTimeout(() => {
            void commitValue(false);
          }, 500);
        };

        text
          .setPlaceholder('map w scrollUp\nmap s scrollDown\nmap i focusInput')
          .setValue(pendingValue)
          .onChange((value) => {
            pendingValue = value;
            scheduleSave();
          });

        text.inputEl.rows = 3;
        text.inputEl.addEventListener('blur', async () => {
          await commitValue(true);
        });
      });

    const cliPathDescription = 'Custom path to GitHub Copilot CLI. Leave empty for auto-detection. Paste the output of "which copilot" (macOS/Linux) or the full executable path on Windows. You must install the Copilot CLI (`npm install -g @github/copilot`) and run `copilot login` once in your terminal.';

    const cliPathSetting = new Setting(containerEl)
      .setName('Copilot CLI path')
      .setDesc(cliPathDescription);

    const validationEl = containerEl.createDiv({ cls: 'ocop-cli-path-validation' });
    validationEl.style.color = 'var(--text-error)';
    validationEl.style.fontSize = '0.85em';
    validationEl.style.marginTop = '-0.5em';
    validationEl.style.marginBottom = '0.5em';
    validationEl.style.display = 'none';

    const validatePath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === 'copilot') return null;
      const expandedPath = expandHomePath(trimmed);
      if (!fs.existsSync(expandedPath)) {
        return 'Path does not exist';
      }
      const stat = fs.statSync(expandedPath);
      if (!stat.isFile()) {
        return 'Path is a directory, not a file';
      }
      return null;
    };

    cliPathSetting.addText((text) => {
      const placeholder = process.platform === 'win32'
        ? 'C:\\Program Files\\GitHub Copilot\\copilot.exe'
        : '/usr/local/bin/copilot';
      text
        .setPlaceholder(placeholder)
        .setValue(this.plugin.settings.copilotCliPath || '')
        .onChange(async (value) => {
          const error = validatePath(value);
          if (error) {
            validationEl.setText(error);
            validationEl.style.display = 'block';
            text.inputEl.style.borderColor = 'var(--text-error)';
          } else {
            validationEl.style.display = 'none';
            text.inputEl.style.borderColor = '';
          }

          this.plugin.settings.copilotCliPath = value.trim();
          await this.plugin.saveSettings();
          this.plugin.cliResolver?.reset();
          this.plugin.agentService?.cleanup();
        });
      text.inputEl.addClass('ocop-settings-cli-path-input');
      text.inputEl.style.width = '100%';

      const initialError = validatePath(this.plugin.settings.copilotCliPath || '');
      if (initialError) {
        validationEl.setText(initialError);
        validationEl.style.display = 'block';
        text.inputEl.style.borderColor = 'var(--text-error)';
      }
    });
  }
}
