import { Plugin, MarkdownView, parseYaml, stringifyYaml, MarkdownPostProcessorContext, Modal, Setting, getIcon, App, TFile, Notice } from "obsidian";
import { DataManager } from "./DataManager";
import { HeatmapRenderer } from "./HeatmapRenderer";
import { HeatmapConfig } from "./types";
import { HeatmapConfigurationModal } from "./HeatmapConfigurationModal";

class SourceCodeModal extends Modal {
    content: string;
    constructor(app: App, content: string) { super(app); this.content = content; }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Heatmap Source Code" });
        const textArea = contentEl.createEl("textarea", { cls: "heatmap-source-textarea" });
        textArea.value = this.content;
        textArea.readOnly = true;
        new Setting(contentEl).setDesc("Copy this block to share or edit manually.");
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
            // 传递 el 本身，用于后续的空间定位
            this.mountButtons(el, config, source, ctx);
        });

        this.registerEvent(
            this.app.workspace.on("editor-change", (editor, info) => {
                if (info instanceof MarkdownView && info.file) {
                    this.dataManager.updateFileStats(info.file, editor.getValue());
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
    }

    mountButtons(el: HTMLElement, config: HeatmapConfig, sourceCode: string, ctx: MarkdownPostProcessorContext) {
        const btnContainer = document.createElement("div");
        btnContainer.className = "heatmap-buttons-container";
        
        // 1. 配置按钮
        const configBtn = document.createElement("div");
        configBtn.className = "heatmap-btn";
        configBtn.setAttribute("aria-label", "Configure");
        
        const settingsIcon = getIcon("settings") || getIcon("gear");
        if (settingsIcon) {
            configBtn.appendChild(settingsIcon);
        } else {
            configBtn.innerText = "Set";
        }

        configBtn.onclick = (e) => {
            e.stopPropagation();
            new HeatmapConfigurationModal(this.app, config, (newConfig) => {
                this.updateCodeBlock(el, newConfig, ctx, sourceCode);
            }).open();
        };

        // 2. 源码按钮
        const codeBtn = document.createElement("div");
        codeBtn.className = "heatmap-btn";
        codeBtn.setAttribute("aria-label", "View Source");

        const codeIcon = getIcon("code"); 
        if (codeIcon) {
            codeBtn.appendChild(codeIcon);
        } else {
            codeBtn.innerText = "Src";
        }

        codeBtn.onclick = (e) => {
            e.stopPropagation();
            new SourceCodeModal(this.app, "```word-heatmap\n" + sourceCode + "\n```").open();
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

    // [核心修复]：统一的保存逻辑，不预设场景，按能力降级处理
    async updateCodeBlock(el: HTMLElement, config: HeatmapConfig, ctx: MarkdownPostProcessorContext, oldSource: string) {
        const cleanConfig = JSON.parse(JSON.stringify(config));
        const yamlString = stringifyYaml(cleanConfig);
        const newCodeBlockContent = `\`\`\`word-heatmap\n${yamlString}\`\`\``;

        // ---------------------------------------------------------
        // 方案 A: 尝试通过标准 API 定位 (适用于: 普通文档, Canvas 嵌入文档, Live Preview)
        // ---------------------------------------------------------
        const sectionInfo = ctx.getSectionInfo(el);
        const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);

        if (file instanceof TFile && sectionInfo) {
            try {
                const content = await this.app.vault.read(file);
                const lines = content.split("\n");
                
                // 双重检查：确保行号范围内的内容确实是 heatmap (防止行号错位)
                // 这一步对于频繁变动的文档很重要
                const targetLines = lines.slice(sectionInfo.lineStart, sectionInfo.lineEnd + 1).join("\n");
                if (!targetLines.includes("word-heatmap")) {
                    throw new Error("Section info mismatch");
                }

                const before = lines.slice(0, sectionInfo.lineStart);
                const after = lines.slice(sectionInfo.lineEnd + 1);
                
                const newFileContent = [...before, newCodeBlockContent, ...after].join("\n");
                await this.app.vault.modify(file, newFileContent);
                return; // 成功，直接结束
            } catch (error) {
                // 如果标准方案失败（例如行号对不上），不要报错，继续尝试方案 B
                console.debug("Word Heatmap: File update skipped, trying Canvas lookup...", error);
            }
        }

        // ---------------------------------------------------------
        // 方案 B: 尝试 Canvas 节点直接查找 (适用于: Canvas 纯文本卡片)
        // ---------------------------------------------------------
        // 根本不需要读 ID，直接遍历所有 Canvas，问节点："这个代码块是你家的吗？"
        const leaves = this.app.workspace.getLeavesOfType("canvas");
        
        for (const leaf of leaves) {
            const canvas = (leaf.view as any).canvas;
            if (!canvas) continue;

            // 遍历当前 Canvas 的所有节点
            // canvas.nodes 是一个 Map<string, CanvasNode>
            for (const [id, node] of canvas.nodes.entries()) {
                // [关键逻辑]：判断当前代码块的 DOM 元素 (el) 是否包含在这个节点的 DOM 树里
                if (node.contentEl && node.contentEl.contains(el)) {
                    
                    const text = node.text;
                    if (!text) continue;

                    // 找到了宿主节点！现在替换文本。
                    // 为了安全，我们尝试替换包含 oldSource 的最长匹配串
                    
                    // 构造可能的旧文本块 (加上```包裹)
                    const exactOldBlock = `\`\`\`word-heatmap\n${oldSource}\`\`\``;
                    
                    if (text.includes(exactOldBlock)) {
                        node.setText(text.replace(exactOldBlock, newCodeBlockContent));
                    } else {
                        // 如果精确匹配失败（可能有格式化差异），使用正则匹配任意 word-heatmap 块
                        // 这是一个安全的兜底，因为在这个 Text Node 里，el 已经证明了这里确实有一个热力图
                        const regex = /```word-heatmap[\s\S]*?```/;
                        node.setText(text.replace(regex, newCodeBlockContent));
                    }
                    
                    canvas.requestSave();
                    return; // 成功，结束
                }
            }
        }

        // 如果两种方案都失败了
        new Notice("Word Heatmap: 保存失败。无法定位代码块来源。");
    }

    async onunload() { await this.dataManager.saveData(); }
}