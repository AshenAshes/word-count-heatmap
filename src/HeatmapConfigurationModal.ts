import { App, Modal, Setting } from "obsidian";
import { HeatmapConfig, GraphTheme, THEMES } from "./types";

export class HeatmapConfigurationModal extends Modal {
    config: HeatmapConfig;
    onSubmit: (result: HeatmapConfig) => void;

    constructor(app: App, config: HeatmapConfig, onSubmit: (result: HeatmapConfig) => void) {
        super(app);
        this.config = config;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("heatmap-config-modal");
        contentEl.createEl("h2", { text: "Heatmap Configuration" });

        // --- 1. Basic Settings ---
        this.createSection(contentEl, "Basic Settings", (container) => {
            new Setting(container)
                .setName("Title")
                .addText(text => text.setValue(this.config.title || "").onChange(v => this.config.title = v));
                
            new Setting(container)
                .setName("Count Type")
                .setDesc("Warning: Switching this will reset today's statistics.")
                .addDropdown(drop => drop
                    .addOption("word", "Word Count (词数)")
                    .addOption("char", "Character Count (字符数)")
                    .setValue(this.config.countType || "word")
                    .onChange(v => this.config.countType = v as any));

            new Setting(container)
                .setName("Date Range Mode")
                .addDropdown(drop => drop
                    .addOption("latest_days", "Latest Days")
                    .addOption("fixed_year", "Fixed Year")
                    .setValue(this.config.dateRangeType || "latest_days")
                    .onChange(v => {
                        this.config.dateRangeType = v as any;
                        this.display(); 
                    }));

            if (this.config.dateRangeType === 'fixed_year') {
                new Setting(container)
                    .setName("Year")
                    .addText(text => text
                        .setValue((this.config.year || new Date().getFullYear()).toString())
                        .onChange(v => this.config.year = parseInt(v)));
            }
        });

        // --- 2. Data Filter ---
        this.createSection(contentEl, "Data Filter", (container) => {
            new Setting(container)
                .setName("Exclude Folders")
                .setDesc("Folders to ignore. Enter one folder path per line.")
                .addTextArea(text => text
                    // 核心修改：明确的占位符提示
                    .setPlaceholder("Example:\nPrivate/Diary\nArchive/\nTemplates") 
                    .setValue((this.config.excludeFolders || []).join("\n"))
                    .onChange(v => {
                        this.config.excludeFolders = v.split("\n").map(s => s.trim()).filter(s => s.length > 0);
                    }));
        });

        // --- 3. Style & Layout ---
        this.createSection(contentEl, "Style & Layout", (container) => {
            new Setting(container)
                .setName("Theme")
                .addDropdown(drop => {
                    Object.keys(THEMES).forEach(theme => drop.addOption(theme, theme));
                    drop.setValue(this.config.theme || "Default");
                    drop.onChange(v => {
                        this.config.theme = v as GraphTheme;
                        this.config.cellStyleRules = undefined;
                    });
                });

            new Setting(container)
                .setName("Start of Week")
                .addDropdown(drop => drop
                    .addOption("0", "Sunday")
                    .addOption("1", "Monday")
                    .addOption("6", "Saturday")
                    .setValue((this.config.startOfWeek ?? 0).toString())
                    .onChange(v => this.config.startOfWeek = parseInt(v)));

            new Setting(container)
                .setName("Fill the Screen")
                .addToggle(t => t.setValue(this.config.fillTheScreen || false).onChange(v => this.config.fillTheScreen = v));

            new Setting(container)
                .setName("Show Legend")
                .addToggle(t => t.setValue(this.config.showCellRuleIndicators !== false).onChange(v => this.config.showCellRuleIndicators = v));
        });

        // Save Button
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Save & Render")
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onSubmit(this.config);
                }));
    }

    createSection(parent: HTMLElement, title: string, renderBody: (container: HTMLElement) => void) {
        const details = parent.createEl("details", { cls: "config-section" });
        details.setAttribute("open", ""); 
        const summary = details.createEl("summary", { text: title });
        const container = details.createDiv({ cls: "config-section-body" });
        renderBody(container);
    }

    display() { this.contentEl.empty(); this.onOpen(); }
    onClose() { this.contentEl.empty(); }
}