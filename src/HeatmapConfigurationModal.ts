import { App, Modal, Setting } from "obsidian";
import { HeatmapConfig, GraphTheme, THEMES } from "./types";
import { DataManager } from "./DataManager";
import { t, LanguageOption } from "./i18n";

class ConfirmationModal extends Modal {
    private titleText: string;
    private messageText: string;
    private confirmText: string;
    private cancelText: string;
    private onConfirm: () => void;

    constructor(app: App, titleText: string, messageText: string, confirmText: string, cancelText: string, onConfirm: () => void) {
        super(app);
        this.titleText = titleText;
        this.messageText = messageText;
        this.confirmText = confirmText;
        this.cancelText = cancelText;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: this.titleText });
        contentEl.createEl("p", { text: this.messageText, cls: "heatmap-warning-desc" });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(this.cancelText)
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText(this.confirmText)
                .setWarning()
                .onClick(() => {
                    this.close();
                    this.onConfirm();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class HeatmapConfigurationModal extends Modal {
    config: HeatmapConfig;
    dataManager: DataManager;
    onSubmit: (result: HeatmapConfig) => void;
    private originalRetention: number;

    constructor(app: App, dataManager: DataManager, config: HeatmapConfig, onSubmit: (result: HeatmapConfig) => void) {
        super(app);
        this.dataManager = dataManager;
        this.config = Object.assign({}, config);
        
        // 如果配置中没有明确属性，尝试同步 dataManager 现有的全局设置
        if (this.config.historyRetentionDays === undefined) {
            this.config.historyRetentionDays = dataManager.data.historyRetentionDays ?? 0;
        }
        if (!this.config.language) {
            this.config.language = dataManager.data.language ?? 'auto';
        }

        this.originalRetention = this.config.historyRetentionDays ?? 0;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        const lang = this.config.language || 'auto';

        contentEl.addClass("heatmap-config-modal");
        contentEl.createEl("h2", { text: t("configTitle", lang) });

        // --- 1. Basic Settings ---
        this.createSection(contentEl, t("basicSettings", lang), (container) => {
            new Setting(container)
                .setName(t("title", lang))
                .addText(text => text.setValue(this.config.title || "").onChange(v => this.config.title = v));

            new Setting(container)
                .setName(t("language", lang))
                .addDropdown(drop => drop
                    .addOption("auto", t("languageAuto", lang))
                    .addOption("zh", t("languageZh", lang))
                    .addOption("en", t("languageEn", lang))
                    .setValue(this.config.language || "auto")
                    .onChange(v => {
                        this.config.language = v as LanguageOption;
                        this.dataManager.setLanguage(this.config.language);
                        this.display(); // 刷新界面语言
                    }));

            new Setting(container)
                .setName(t("countType", lang))
                .setDesc(t("countTypeDesc", lang))
                .addDropdown(drop => drop
                    .addOption("word", t("countTypeWord", lang))
                    .addOption("char", t("countTypeChar", lang))
                    .setValue(this.config.countType || (getLanguage(lang) === 'zh' ? 'char' : 'word'))
                    .onChange(v => this.config.countType = v as any));

            new Setting(container)
                .setName(t("dateRangeMode", lang))
                .addDropdown(drop => drop
                    .addOption("latest_days", t("latestDays", lang))
                    .addOption("fixed_year", t("fixedYear", lang))
                    .setValue(this.config.dateRangeType || "latest_days")
                    .onChange(v => {
                        this.config.dateRangeType = v as any;
                        this.display(); 
                    }));

            if (this.config.dateRangeType === 'fixed_year') {
                new Setting(container)
                    .setName(t("year", lang))
                    .addText(text => text
                        .setValue((this.config.year || new Date().getFullYear()).toString())
                        .onChange(v => this.config.year = parseInt(v)));
            } else {
                new Setting(container)
                    .setName(t("days", lang))
                    .addText(text => text
                        .setValue((this.config.days || 365).toString())
                        .onChange(v => this.config.days = parseInt(v)));
            }
        });

        // --- 2. Data Filter & Storage ---
        this.createSection(contentEl, t("dataFilter", lang), (container) => {
            new Setting(container)
                .setName(t("excludeFolders", lang))
                .setDesc(t("excludeFoldersDesc", lang))
                .addTextArea(text => text
                    .setPlaceholder(t("excludeFoldersPlaceholder", lang)) 
                    .setValue((this.config.excludeFolders || []).join("\n"))
                    .onChange(v => {
                        this.config.excludeFolders = v.split("\n").map(s => s.trim()).filter(s => s.length > 0);
                    }));

            new Setting(container)
                .setName(t("retentionDays", lang))
                .setDesc(t("retentionDaysDesc", lang))
                .addDropdown(drop => drop
                    .addOption("0", t("retentionForever", lang))
                    .addOption("30", t("retention30", lang))
                    .addOption("90", t("retention90", lang))
                    .addOption("180", t("retention180", lang))
                    .addOption("365", t("retention365", lang))
                    .setValue((this.config.historyRetentionDays ?? 0).toString())
                    .onChange(v => {
                        this.config.historyRetentionDays = parseInt(v);
                    }));
        });

        // --- 3. Style & Layout ---
        this.createSection(contentEl, t("styleLayout", lang), (container) => {
            new Setting(container)
                .setName(t("theme", lang))
                .addDropdown(drop => {
                    Object.keys(THEMES).forEach(theme => drop.addOption(theme, theme));
                    drop.setValue(this.config.theme || "Default");
                    drop.onChange(v => {
                        this.config.theme = v as GraphTheme;
                        this.config.cellStyleRules = undefined;
                    });
                });

            new Setting(container)
                .setName(t("startOfWeek", lang))
                .addDropdown(drop => drop
                    .addOption("0", t("sunday", lang))
                    .addOption("1", t("monday", lang))
                    .addOption("6", t("saturday", lang))
                    .setValue((this.config.startOfWeek ?? 0).toString())
                    .onChange(v => this.config.startOfWeek = parseInt(v)));

            new Setting(container)
                .setName(t("fillScreen", lang))
                .addToggle(t => t.setValue(this.config.fillTheScreen || false).onChange(v => this.config.fillTheScreen = v));

            new Setting(container)
                .setName(t("showLegend", lang))
                .addToggle(t => t.setValue(this.config.showCellRuleIndicators !== false).onChange(v => this.config.showCellRuleIndicators = v));
        });

        // Save Button
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t("saveRender", lang))
                .setCta()
                .onClick(() => {
                    this.handleSave(lang);
                }));
    }

    private handleSave(lang: LanguageOption) {
        const newRetention = this.config.historyRetentionDays ?? 0;

        // 如果用户将保留期从“永久(0)”修改为了具体天数，或者将天数改小了（意味着要物理清理历史明细）
        const isReducingRetention = newRetention > 0 && (this.originalRetention === 0 || newRetention < this.originalRetention);

        if (isReducingRetention) {
            new ConfirmationModal(
                this.app,
                t("confirmCleanupTitle", lang),
                t("confirmCleanupMsg", lang),
                t("confirmCleanupBtn", lang), // “确认并清理”
                t("cancelBtn", lang),
                () => {
                    this.executeSave();
                }
            ).open();
        } else {
            this.executeSave();
        }
    }

    private executeSave() {
        if (this.config.historyRetentionDays !== undefined) {
            this.dataManager.setHistoryRetentionDays(this.config.historyRetentionDays);
        }
        if (this.config.language) {
            this.dataManager.setLanguage(this.config.language);
        }
        this.close();
        this.onSubmit(this.config);
    }

    createSection(parent: HTMLElement, title: string, renderBody: (container: HTMLElement) => void) {
        const details = parent.createEl("details", { cls: "config-section" });
        details.setAttribute("open", ""); 
        details.createEl("summary", { text: title });
        const container = details.createDiv({ cls: "config-section-body" });
        renderBody(container);
    }

    display() { this.contentEl.empty(); this.onOpen(); }
    onClose() { this.contentEl.empty(); }
}