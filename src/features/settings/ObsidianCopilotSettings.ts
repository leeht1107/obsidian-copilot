import * as fs from 'fs';

import type { App } from 'obsidian';
import { Notice, PluginSettingTab, Setting, setIcon } from 'obsidian';

import { getCurrentPlatformKey } from '../../core/types';
import { COPILOT_MODELS } from '../../core/types/models';
import type ObsidianCopilotPlugin from '../../main';
import { EnvSnippetManager, McpSettingsManager, SlashCommandSettings } from '../../ui';
import { setupCollapsible } from '../../ui/utils/collapsible';
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

interface ObsidianAppInternals {
  setting?: {
    open: () => void;
    openTabById: (id: string) => void;
    activeTab?: {
      searchInputEl?: HTMLInputElement;
      searchComponent?: { inputEl?: HTMLInputElement };
      updateHotkeyVisibility?: () => void;
    };
  };
  hotkeyManager?: {
    customKeys?: Record<string, Array<{ modifiers: string[]; key: string }>>;
    defaultKeys?: Record<string, Array<{ modifiers: string[]; key: string }>>;
  };
}

function openHotkeySettings(app: App): void {
  const setting = (app as unknown as ObsidianAppInternals).setting;
  if (!setting) return;
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
  const hotkeyManager = (app as unknown as ObsidianAppInternals).hotkeyManager;
  if (!hotkeyManager) return null;

  const customHotkeys = hotkeyManager.customKeys?.[commandId];
  const defaultHotkeys = hotkeyManager.defaultKeys?.[commandId];
  const hotkeys = customHotkeys && customHotkeys.length > 0 ? customHotkeys : defaultHotkeys;
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

    // Copilot CLI path — essential for first-time setup
    const cliPathSetting = new Setting(containerEl)
      .setName('Copilot CLI path')
      .setDesc('Leave empty for auto-detection. Paste "which copilot" output (macOS/Linux) or full path on Windows.');

    const cliPathValidationEl = containerEl.createDiv({ cls: 'ocop-cli-path-validation' });
    cliPathValidationEl.style.color = 'var(--text-error)';
    cliPathValidationEl.style.fontSize = '0.85em';
    cliPathValidationEl.style.marginTop = '-0.5em';
    cliPathValidationEl.style.marginBottom = '0.5em';
    cliPathValidationEl.style.display = 'none';

    const validateCliPath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === 'copilot') return null;
      const expandedPath = expandHomePath(trimmed);
      if (!fs.existsSync(expandedPath)) return 'Path does not exist';
      return fs.statSync(expandedPath).isFile() ? null : 'Path is a directory, not a file';
    };

    cliPathSetting.addText((text) => {
      const placeholder = process.platform === 'win32'
        ? 'C:\\Program Files\\GitHub Copilot\\copilot.exe'
        : '/usr/local/bin/copilot';
      text
        .setPlaceholder(placeholder)
        .setValue(this.plugin.settings.copilotCliPath || '')
        .onChange(async (value) => {
          const error = validateCliPath(value);
          if (error) {
            cliPathValidationEl.setText(error);
            cliPathValidationEl.style.display = 'block';
            text.inputEl.style.borderColor = 'var(--text-error)';
          } else {
            cliPathValidationEl.style.display = 'none';
            text.inputEl.style.borderColor = '';
          }
          this.plugin.settings.copilotCliPath = value.trim();
          await this.plugin.saveSettings();
          this.plugin.cliResolver?.reset();
          this.plugin.agentService?.cleanup();
        });
      text.inputEl.addClass('ocop-settings-cli-path-input');
      text.inputEl.style.width = '100%';
      const initialCliError = validateCliPath(this.plugin.settings.copilotCliPath || '');
      if (initialCliError) {
        cliPathValidationEl.setText(initialCliError);
        cliPathValidationEl.style.display = 'block';
        text.inputEl.style.borderColor = 'var(--text-error)';
      }
    });

    // Skills & Obsidian Context — collapsible, default collapsed
    const skillsWrapperEl = containerEl.createDiv({ cls: 'ocop-settings-advanced-wrapper' });
    const skillsHeaderEl = skillsWrapperEl.createDiv({ cls: 'ocop-settings-advanced-header' });
    skillsHeaderEl.setAttribute('tabindex', '0');
    skillsHeaderEl.createSpan({ cls: 'ocop-settings-advanced-title', text: 'Skills & Obsidian Context' });
    skillsHeaderEl.createSpan({ cls: 'ocop-settings-advanced-toggle', text: 'Show' });
    const skillsContentEl = skillsWrapperEl.createDiv({ cls: 'ocop-settings-advanced-content' });
    setupCollapsible(skillsWrapperEl, skillsHeaderEl, skillsContentEl, { isExpanded: false }, {
      initiallyExpanded: false,
      onToggle: (isExpanded) => {
        const toggleEl = skillsHeaderEl.querySelector('.ocop-settings-advanced-toggle');
        if (toggleEl) toggleEl.textContent = isExpanded ? 'Hide' : 'Show';
      },
      baseAriaLabel: 'Skills & Obsidian Context settings',
    });

    skillsContentEl.createDiv({
      cls: 'setting-item-description',
      text: 'Install Obsidian-specific skills so Copilot understands wikilinks, callouts, properties, and canvas files.',
    });

    const skillsInstalled = isObsidianSkillsInstalled(this.app);
    new Setting(skillsContentEl)
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
    new Setting(skillsContentEl)
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

    // Skill suggestion chips
    const SKILL_SUGGESTIONS = [
      {
        label: 'Obsidian MCP',
        url: 'https://github.com/MarkusPfworlds/copilot-obsidian-mcp',
        icon: 'box',
      },
      {
        label: 'Prompt 모음',
        url: 'https://github.com/MarkusPfworlds/copilot-prompt-skills',
        icon: 'message-square',
      },
      {
        label: 'Markdown 도우미',
        url: 'https://github.com/MarkusPfworlds/copilot-markdown-skills',
        icon: 'file-text',
      },
    ];

    const suggestionsEl = skillsContentEl.createDiv({ cls: 'ocop-skill-suggestions' });
    for (const suggestion of SKILL_SUGGESTIONS) {
      const chipEl = suggestionsEl.createDiv({ cls: 'ocop-skill-chip' });
      const iconEl = chipEl.createSpan({ cls: 'ocop-skill-chip-icon' });
      setIcon(iconEl, suggestion.icon);
      chipEl.createSpan({ text: suggestion.label });
      chipEl.addEventListener('click', () => {
        if (textInput) {
          textInput.value = suggestion.url;
          textInput.dispatchEvent(new Event('input'));
          skillUrl = suggestion.url;
        }
      });
    }

    const installedSkills = getInstalledSkills(this.app);
    if (installedSkills.length > 0) {
      const installedSkillsDesc = skillsContentEl.createDiv({ cls: 'ocop-skills-installed-desc' });
      installedSkillsDesc.createEl('p', {
        text: `Installed Skills (${installedSkills.length}):`,
        cls: 'setting-item-description',
      });

      const skillsListEl = skillsContentEl.createDiv({ cls: 'ocop-skills-list' });
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
      skillsContentEl.createDiv({ cls: 'ocop-skills-empty', text: 'No skills installed. Install Obsidian context skills above or add a custom skill from GitHub.' });
    }

    // MCP Tools — collapsible, default collapsed
    const mcpWrapperEl = containerEl.createDiv({ cls: 'ocop-settings-advanced-wrapper' });
    const mcpHeaderEl = mcpWrapperEl.createDiv({ cls: 'ocop-settings-advanced-header' });
    mcpHeaderEl.setAttribute('tabindex', '0');
    mcpHeaderEl.createSpan({ cls: 'ocop-settings-advanced-title', text: 'MCP Tools' });
    mcpHeaderEl.createSpan({ cls: 'ocop-settings-advanced-toggle', text: 'Show' });
    const mcpContentEl = mcpWrapperEl.createDiv({ cls: 'ocop-settings-advanced-content' });
    setupCollapsible(mcpWrapperEl, mcpHeaderEl, mcpContentEl, { isExpanded: false }, {
      initiallyExpanded: false,
      onToggle: (isExpanded) => {
        const toggleEl = mcpHeaderEl.querySelector('.ocop-settings-advanced-toggle');
        if (toggleEl) toggleEl.textContent = isExpanded ? 'Hide' : 'Show';
      },
      baseAriaLabel: 'MCP Tools settings',
    });

    mcpContentEl.createDiv({
      cls: 'setting-item-description',
      text: 'Connect external MCP tools here. Beginners can use the built-in import flow with a GitHub URL or pasted JSON.',
    });

    const mcpContainer = mcpContentEl.createDiv({ cls: 'ocop-mcp-container' });
    new McpSettingsManager(mcpContainer, this.plugin);

    // Chat Behavior — collapsible, default collapsed
    const chatWrapperEl = containerEl.createDiv({ cls: 'ocop-settings-advanced-wrapper' });
    const chatHeaderEl = chatWrapperEl.createDiv({ cls: 'ocop-settings-advanced-header' });
    chatHeaderEl.setAttribute('tabindex', '0');
    chatHeaderEl.createSpan({ cls: 'ocop-settings-advanced-title', text: 'Chat Behavior' });
    chatHeaderEl.createSpan({ cls: 'ocop-settings-advanced-toggle', text: 'Show' });
    const chatContentEl = chatWrapperEl.createDiv({ cls: 'ocop-settings-advanced-content' });
    setupCollapsible(chatWrapperEl, chatHeaderEl, chatContentEl, { isExpanded: false }, {
      initiallyExpanded: false,
      onToggle: (isExpanded) => {
        const toggleEl = chatHeaderEl.querySelector('.ocop-settings-advanced-toggle');
        if (toggleEl) toggleEl.textContent = isExpanded ? 'Hide' : 'Show';
      },
      baseAriaLabel: 'Chat Behavior settings',
    });

    chatContentEl.createDiv({
      cls: 'setting-item-description',
      text: 'Control how chat behaves day to day without touching advanced system settings.',
    });

    new Setting(chatContentEl)
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

    new Setting(chatContentEl)
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

    new Setting(chatContentEl)
      .setName('Web search')
      .setDesc('Allow the agent to use web search and web fetch tools. Turn off to prevent ground-truth leakage during quizzes.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableWebSearch)
          .onChange(async (value) => {
            this.plugin.settings.enableWebSearch = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(chatContentEl)
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
      new Setting(chatContentEl)
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

    const advancedWrapperEl = containerEl.createDiv({ cls: 'ocop-settings-advanced-wrapper' });
    const advancedHeaderEl = advancedWrapperEl.createDiv({ cls: 'ocop-settings-advanced-header' });
    advancedHeaderEl.setAttribute('tabindex', '0');
    advancedHeaderEl.createSpan({ cls: 'ocop-settings-advanced-title', text: 'Advanced & Power User' });
    advancedHeaderEl.createSpan({ cls: 'ocop-settings-advanced-toggle', text: 'Show' });
    const advancedContentEl = advancedWrapperEl.createDiv({ cls: 'ocop-settings-advanced-content' });
    setupCollapsible(advancedWrapperEl, advancedHeaderEl, advancedContentEl, { isExpanded: false }, {
      initiallyExpanded: false,
      onToggle: (isExpanded) => {
        const toggleEl = advancedHeaderEl.querySelector('.ocop-settings-advanced-toggle');
        if (toggleEl) toggleEl.textContent = isExpanded ? 'Hide' : 'Show';
      },
      baseAriaLabel: 'Advanced settings',
    });

    new Setting(advancedContentEl).setName('Workflows & Shortcuts').setHeading();
    advancedContentEl.createDiv({
      cls: 'setting-item-description',
      text: 'Configure optional workflow presets and keyboard shortcuts once you are comfortable with the basics.',
    });

    const inlineEditCommandId = 'obsidian-copilot:inline-edit';
    const inlineEditHotkey = getHotkeyForCommand(this.app, inlineEditCommandId);
    new Setting(advancedContentEl)
      .setName('Inline edit hotkey')
      .setDesc(inlineEditHotkey ? `Current: ${inlineEditHotkey}` : 'No hotkey set. Click to configure.')
      .addButton((button) => button.setButtonText(inlineEditHotkey ? 'Change' : 'Set hotkey').onClick(() => openHotkeySettings(this.app)));

    const openChatCommandId = 'obsidian-copilot:open-view';
    const openChatHotkey = getHotkeyForCommand(this.app, openChatCommandId);
    new Setting(advancedContentEl)
      .setName('Open chat hotkey')
      .setDesc(openChatHotkey ? `Current: ${openChatHotkey}` : 'No hotkey set. Click to configure.')
      .addButton((button) => button.setButtonText(openChatHotkey ? 'Change' : 'Set hotkey').onClick(() => openHotkeySettings(this.app)));

    new Setting(advancedContentEl).setName('Workflow Presets').setHeading();
    const slashCommandsDesc = advancedContentEl.createDiv({ cls: 'ocop-slash-settings-desc' });
    slashCommandsDesc.createEl('p', {
      text: 'Create custom prompt templates triggered by /command. Use $ARGUMENTS for all arguments, $1/$2 for positional args, @file for file content, and !`bash` for command output.',
      cls: 'setting-item-description',
    });
    const slashCommandsContainer = advancedContentEl.createDiv({ cls: 'ocop-slash-commands-container' });
    new SlashCommandSettings(slashCommandsContainer, this.plugin);

    new Setting(advancedContentEl).setName('Safety & Permissions').setHeading();
    advancedContentEl.createDiv({
      cls: 'setting-item-description',
      text: 'The toggle below is the main safety control for beginners. Detailed allow/block rules are in Advanced.',
    });

    new Setting(advancedContentEl)
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

    new Setting(advancedContentEl)
      .setName('Enable inline bash in slash commands')
      .setDesc('Allow !`command` syntax in workflow presets to execute shell commands. Disabled by default for security — enable only if you trust your slash command sources.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableInlineBash)
          .onChange(async (value) => {
            this.plugin.settings.enableInlineBash = value;
            await this.plugin.saveSettings();
          })
      );

    const platformKey = getCurrentPlatformKey();
    const isWindows = platformKey === 'windows';
    const platformLabel = isWindows ? 'Windows' : 'Unix';

    new Setting(advancedContentEl)
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
      new Setting(advancedContentEl)
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

    new Setting(advancedContentEl)
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

    const approvedDesc = advancedContentEl.createDiv({ cls: 'ocop-approved-desc' });
    approvedDesc.createEl('p', {
      text: 'Actions that have been permanently approved (via Always Allow). These will not require approval in Safe mode.',
      cls: 'setting-item-description',
    });

    if (this.plugin.settings.permissions.length === 0) {
      advancedContentEl.createDiv({
        cls: 'ocop-approved-empty',
        text: 'No approved actions yet. When you click Always Allow in the approval dialog, actions will appear here.',
      });
    } else {
      const listEl = advancedContentEl.createDiv({ cls: 'ocop-approved-list' });
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

      new Setting(advancedContentEl)
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

    new Setting(advancedContentEl).setName('Authentication & Environment').setHeading();
    advancedContentEl.createDiv({
      cls: 'setting-item-description',
      text: 'Most students can leave these alone if `copilot login` already worked in the terminal.',
    });

    new Setting(advancedContentEl)
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

    new Setting(advancedContentEl)
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

    const envSnippetsContainer = advancedContentEl.createDiv({ cls: 'ocop-env-snippets-container' });
    new EnvSnippetManager(envSnippetsContainer, this.plugin);

    new Setting(advancedContentEl).setName('Advanced & Developer').setHeading();
    advancedContentEl.createDiv({
      cls: 'setting-item-description',
      text: 'Only change these if you know why you need them. They are preserved here for power users and debugging.',
    });

    new Setting(advancedContentEl)
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

    new Setting(advancedContentEl)
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

  }
}
