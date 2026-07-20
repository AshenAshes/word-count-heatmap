import { Plugin, MarkdownView, parseYaml, stringifyYaml, MarkdownPostProcessorContext, Modal, Setting, getIcon, App, TFile, Notice } from "obsidian";
import { DataManager } from "./DataManager";
import { HeatmapRenderer } from "./HeatmapRenderer";
import { HeatmapConfig } from "./types";
import { HeatmapConfigurationModal } from "./HeatmapConfigurationModal";
import { t } from "./i18n";

class SourceCodeModal extends Modal {
    content: string;
    langSetting?: any;
    constructor(app: App, content: string, langSetting?: any) {
        super(app);
        this.content = content;
        this.langSetting = langSetting;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: t("sourceCodeModalTitle", this.langSetting) });
        const textArea = contentEl.createEl("textarea", { cls: "heatmap-source-textarea" });
        textArea.value = this.content;
        textArea.readOnly = true;
        new Setting(contentEl).setDesc(t("sourceCodeModalDesc", this.langSetting));
    }
    onClose() { this.contentEl.empty(); }
}

export default class WordHeatmapPlugin extends Plugin {
    dataManager: DataManager;

    async onload() {
        this.dataManager = new DataManager(this.app, this);
        await this.dataManager.loadData();

        this.registerMarkdownCodeBlockProcessor("word-heatmap", (source, el, ctx) => {
            el.addClass("word-heatmap-block");

            let config: HeatmapConfig = {};
            try {
                config = source.trim() ? parseYaml(source) : {};
            } catch (e) {
                console.error("YAML Error", e);
            }

            if (config.countType) {
                this.dataManager.setCountType(config.countType);
            }

            HeatmapRenderer.render(this.app, el, this.dataManager, config);
            this.mountButtons(el, config, source, ctx);
        });

        // [打字性能优化] 使用 300ms 防抖后的更新函数，解决打字卡顿问题
        this.registerEvent(
            this.app.workspace.on("editor-change", (editor, info) => {
                if (info instanceof MarkdownView && info.file) {
                    this.dataManager.debouncedUpdateFileStats(info.file, editor.getValue());
                }
            })
        );
        
        this.registerEvent(
             this.app.workspace.on("file-open", async (file) => {
                 if (file && file.extension === 'md') {
                     const content = await this.app.vault.read(file);
                     this.dataManager.updateFileBaseline(file, content);
                 }
             })
         );

        // 监听语言切换，实时动态刷新 Ctrl+P 命令名称
        this.dataManager.onLanguageChange = () => this.registerCommands();

        // 注册控制台命令：插入字数热力图 (Ctrl+P / Command Palette)
        this.registerCommands();
    }

    registerCommands() {
        this.addCommand({
            id: "insert-word-heatmap",
            name: t("insertCommandName", 'auto'), // 严格跟随 Obsidian 原生系统环境语言
            editorCallback: (editor) => {
                const codeBlock = "```word-heatmap\n```\n";
                editor.replaceSelection(codeBlock);
            }
        });
    }

    mountButtons(el: HTMLElement, config: HeatmapConfig, sourceCode: string, ctx: MarkdownPostProcessorContext) {
        const lang = config.language || this.dataManager.data.language || 'auto';
        const btnContainer = document.createElement("div");
        btnContainer.className = "heatmap-buttons-container";
        
        // 1. 配置按钮
        const configBtn = document.createElement("div");
        configBtn.className = "heatmap-btn";
        configBtn.setAttribute("aria-label", t("configureLabel", lang));
        
        const settingsIcon = getIcon("settings") || getIcon("gear");
        if (settingsIcon) {
            configBtn.appendChild(settingsIcon);
        } else {
            configBtn.innerText = "Set";
        }

        configBtn.onclick = (e) => {
            e.stopPropagation();
            new HeatmapConfigurationModal(this.app, this.dataManager, config, (newConfig) => {
                this.updateCodeBlock(el, newConfig, ctx, sourceCode);
            }).open();
        };

        // 2. 源码按钮
        const codeBtn = document.createElement("div");
        codeBtn.className = "heatmap-btn";
        codeBtn.setAttribute("aria-label", t("viewSourceLabel", lang));

        const codeIcon = getIcon("code"); 
        if (codeIcon) {
            codeBtn.appendChild(codeIcon);
        } else {
            codeBtn.innerText = "Src";
        }

        codeBtn.onclick = (e) => {
            e.stopPropagation();
            new SourceCodeModal(this.app, "```word-heatmap\n" + sourceCode + "\n```", lang).open();
        };

        btnContainer.appendChild(configBtn);
        btnContainer.appendChild(codeBtn);
        el.appendChild(btnContainer);

        setTimeout(() => {
            const parent = el.parentElement;
            if (parent) {
                const nativeBtn = parent.querySelector('.edit-block-button');
                if (nativeBtn) {
                    (nativeBtn as HTMLElement).style.display = 'none';
                }
            }
        }, 100); 

        btnContainer.style.opacity = "0";
        el.addEventListener("mouseenter", () => { btnContainer.style.opacity = "1"; });
        el.addEventListener("mouseleave", () => { btnContainer.style.opacity = "0"; });
    }

    async updateCodeBlock(el: HTMLElement, config: HeatmapConfig, ctx: MarkdownPostProcessorContext, oldSource: string) {
        const cleanConfig = JSON.parse(JSON.stringify(config));
        const yamlString = stringifyYaml(cleanConfig);
        const newCodeBlockContent = `\`\`\`word-heatmap\n${yamlString}\`\`\``;

        const sectionInfo = ctx.getSectionInfo(el);
        const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);

        if (file instanceof TFile && sectionInfo) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");
                
                const targetLines = lines.slice(sectionInfo.lineStart, sectionInfo.lineEnd + 1).join("\n");
                if (!targetLines.includes("word-heatmap")) {
                    throw new Error("Section info mismatch");
                }

                const before = lines.slice(0, sectionInfo.lineStart);
                const after = lines.slice(sectionInfo.lineEnd + 1);
                
                const newFileContent = [...before, newCodeBlockContent, ...after].join("\n");
                await this.app.vault.modify(file, newFileContent);
                return;
            } catch (error) {
                console.debug("Word Heatmap: File update skipped, trying Canvas lookup...", error);
            }
        }

        const leaves = this.app.workspace.getLeavesOfType("canvas");
        
        for (const leaf of leaves) {
            const canvas = (leaf.view as any).canvas;
            if (!canvas) continue;

            for (const [id, node] of canvas.nodes.entries()) {
                if (node.contentEl && node.contentEl.contains(el)) {
                    
                    const text = node.text;
                    if (!text) continue;

                    const exactOldBlock = `\`\`\`word-heatmap\n${oldSource}\`\`\``;
                    
                    if (text.includes(exactOldBlock)) {
                        node.setText(text.replace(exactOldBlock, newCodeBlockContent));
                    } else {
                        const regex = /```word-heatmap[\s\S]*?```/;
                        node.setText(text.replace(regex, newCodeBlockContent));
                    }
                    
                    canvas.requestSave();
                    return;
                }
            }
        }

        new Notice(t("saveFailedNotice", this.dataManager.data.language));
    }

    async onunload() { await this.dataManager.saveData(); }
}