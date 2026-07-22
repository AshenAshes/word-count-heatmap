import { App, setIcon } from "obsidian";
import { DataManager } from "./DataManager";
import dayjs from "dayjs";
import { HeatmapConfig, mapThemeToRules, CellStyleRule, DayStats } from "./types";
import { t, getLanguage, LanguageOption } from "./i18n";
import "dayjs/locale/zh-cn";

export class HeatmapRenderer {
    static render(app: App, container: HTMLElement, dataManager: DataManager, config: HeatmapConfig) {
        container.empty();
        
        const themeName = config.theme || 'Default';
        const rules = config.cellStyleRules || mapThemeToRules(themeName, config.thresholds);
        const startOfWeek = config.startOfWeek ?? 0;
        const lang = config.language || dataManager.data.language || 'auto';
        const effectiveLang = getLanguage(lang);
        const dayjsLocale = effectiveLang === 'zh' ? 'zh-cn' : 'en';
        
        let startDate: dayjs.Dayjs;
        let endDate: dayjs.Dayjs;

        if (config.dateRangeType === 'fixed_year') {
            const year = config.year || dayjs().year();
            startDate = dayjs(`${year}-01-01`);
            endDate = dayjs(`${year}-12-31`);
        } else {
            endDate = dayjs();
            startDate = endDate.subtract(config.days || 365, 'day');
        }

        const dailyData = dataManager.data.history; 
        const heatmapData = dataManager.getHeatmapData(config.excludeFolders);
        const dateMap = new Map<string, number>();
        heatmapData.forEach(d => dateMap.set(d.date, d.value));

        const fillScreenClass = config.fillTheScreen ? "fill-the-screen" : "";
        const graphEl = container.createDiv({ 
            cls: `word-heatmap-graph theme-${themeName.toLowerCase()} ${fillScreenClass}` 
        });
        
        if (config.title) {
            graphEl.createDiv({ cls: "heatmap-title", text: config.title });
        }

        const mainContainer = graphEl.createDiv({ cls: "heatmap-main-container" });

        const weekLabelContainer = mainContainer.createDiv({ cls: "heatmap-week-labels" });
        const weekNames = t("weekNames", lang);
        const adjustedWeekNames = [...weekNames.slice(startOfWeek), ...weekNames.slice(0, startOfWeek)];
        
        for (let i = 0; i < 7; i++) {
            const label = weekLabelContainer.createDiv({ cls: "week-label" });
            if (i === 1 || i === 3 || i === 5) {
                label.innerText = adjustedWeekNames[i];
            } else {
                label.setText("\u00A0");
            }
        }

        const contentContainer = mainContainer.createDiv({ cls: "heatmap-content" });
        const gridContainer = contentContainer.createDiv({ cls: "heatmap-grid" });

        let loopDate = startDate.day(startOfWeek);
        if (loopDate.isAfter(startDate)) loopDate = loopDate.subtract(7, 'day');
        // 1. 预解析所有周列数据
        const weekColumnsData: { firstDayOfWeek: dayjs.Dayjs; month: number }[] = [];
        let tempDate = loopDate;
        while (tempDate.isBefore(endDate) || tempDate.isSame(endDate, 'day')) {
            weekColumnsData.push({
                firstDayOfWeek: tempDate,
                month: tempDate.month()
            });
            tempDate = tempDate.add(7, 'day');
        }

        // 2. 智能决定哪些周列可以安全渲染 Month Label (彻底修复跳月与重叠)
        const shouldRenderMonthLabel: boolean[] = new Array<boolean>(weekColumnsData.length).fill(false);
        let lastLabelCol = -999;
        let currentM = -1;

        for (let col = 0; col < weekColumnsData.length; col++) {
            const { month } = weekColumnsData[col];
            if (month !== currentM) {
                currentM = month;

                // 计算当前月份在后续视图中占据的总周数
                let weeksInThisMonth = 0;
                for (let k = col; k < weekColumnsData.length; k++) {
                    if (weekColumnsData[k].month === month) weeksInThisMonth++;
                    else break;
                }

                // 只有当该月份在视图中包含至少 2 周 (避免仅残存 1 周的边缘尾巴抢占位置)，
                // 且与上一个已渲染标签相隔 >= 2 列 (>= 22px) 时才渲染
                if (weeksInThisMonth >= 2) {
                    if (lastLabelCol === -999 || col - lastLabelCol >= 2) {
                        shouldRenderMonthLabel[col] = true;
                        lastLabelCol = col;
                    }
                }
            }
        }

        // 3. 兜底保护：如果整个图表中没有任何列绘制了月份标签 (如短日期范围 30 天)，确保绘制主月份标签
        if (!shouldRenderMonthLabel.includes(true) && weekColumnsData.length > 0) {
            const monthCounts: Record<number, { firstCol: number; count: number }> = {};
            for (let col = 0; col < weekColumnsData.length; col++) {
                const m = weekColumnsData[col].month;
                if (!monthCounts[m]) {
                    monthCounts[m] = { firstCol: col, count: 0 };
                }
                monthCounts[m].count++;
            }
            
            let maxCount = 0;
            let bestCol = 0;
            for (const m in monthCounts) {
                if (monthCounts[m].count > maxCount) {
                    maxCount = monthCounts[m].count;
                    bestCol = monthCounts[m].firstCol;
                }
            }
            shouldRenderMonthLabel[bestCol] = true;
        }

        // 4. 渲染 DOM 网格
        for (let col = 0; col < weekColumnsData.length; col++) {
            const weekColumn = gridContainer.createDiv({ cls: "heatmap-column" });
            const { firstDayOfWeek } = weekColumnsData[col];

            if (shouldRenderMonthLabel[col]) {
                const monthLabel = weekColumn.createDiv({ cls: "month-label" });
                monthLabel.innerText = firstDayOfWeek.locale(dayjsLocale).format("MMM");
            }

            for (let i = 0; i < 7; i++) {
                const dayStr = loopDate.format("YYYY-MM-DD");
                const count = dateMap.get(dayStr) || 0;
                
                const cell = weekColumn.createDiv({ cls: "heatmap-cell" });
                
                cell.onclick = (e) => {
                    e.stopPropagation();
                    const isSelected = cell.hasClass('selected');
                    container.querySelectorAll('.heatmap-cell.selected').forEach(el => el.removeClass('selected'));
                    
                    if (!isSelected) {
                        cell.addClass('selected');
                        this.updateInteractionPanel(app, dayStr, dailyData[dayStr], graphEl, config.excludeFolders, lang);
                    } else {
                        const panel = graphEl.querySelector<HTMLElement>(".heatmap-interaction-panel");
                        if (panel) panel.addClass("is-hidden");
                    }
                };

                if (count === 0) {
                    cell.addClass("empty");
                } else {
                    const matchRule = this.matchRule(count, rules);
                    cell.style.backgroundColor = matchRule.color;
                }
                
                const unitText = t("words", lang);
                const spacing = effectiveLang === 'en' ? ' ' : '';
                cell.setAttribute("aria-label", `${dayStr}: ${count}${spacing}${unitText}`);

                if (loopDate.isBefore(startDate) || loopDate.isAfter(endDate)) {
                    cell.addClass("hidden-cell");
                }

                loopDate = loopDate.add(1, 'day');
            }
        }

        if (config.showCellRuleIndicators !== false) {
             this.renderIndicators(graphEl, rules, lang);
        }

        this.renderInteractionPanel(graphEl, lang);

        // 动态向上遍历查找嵌入或 Canvas 容器并添加类，从而在 CSS 中彻底弃用 :has 选择器
        let ancestor = container.parentElement;
        while (ancestor) {
            if (ancestor.hasClass("markdown-embed")) {
                ancestor.addClass("word-heatmap-embed");
            }
            if (ancestor.hasClass("canvas-node")) {
                ancestor.addClass("word-heatmap-canvas-node");
            }
            ancestor = ancestor.parentElement;
        }
    }

    private static renderInteractionPanel(container: HTMLElement, langSetting?: LanguageOption) {
        const panel = container.createDiv({ cls: "heatmap-interaction-panel is-hidden" });

        panel.createDiv({ cls: "interaction-summary" });
        panel.createDiv({ cls: "interaction-list" });
        
        const closeBtn = panel.createDiv({ cls: "interaction-close-btn", title: t("cancelBtn", langSetting) });
        setIcon(closeBtn, "x");
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            panel.addClass("is-hidden");
            container.querySelectorAll('.heatmap-cell.selected').forEach(el => el.removeClass('selected'));
        };
    }

    private static updateInteractionPanel(app: App, date: string, dayStats: DayStats | null | undefined, container: HTMLElement, excludeFolders: string[] = [], langSetting?: LanguageOption) {
        const panel = container.querySelector<HTMLElement>(".heatmap-interaction-panel");
        const summaryEl = panel?.querySelector(".interaction-summary");
        const listEl = panel?.querySelector(".interaction-list");
        
        if (!panel || !summaryEl || !listEl) return;

        const wordsLabel = t("words", langSetting);
        const filesLabel = t("files", langSetting);

        const files = dayStats ? (dayStats.files || {}) : {};
        const entries = Object.entries(files);
        
        const normalizedFolders = (excludeFolders || []).map(f => f.replace(/^\/+|\/+$/g, ""));
        const validEntries = entries.filter(([path, count]) => {
            if (count <= 0) return false; 
            const cleanPath = path.replace(/^\/+|\/+$/g, "");
            return !normalizedFolders.some(folder => 
                cleanPath === folder || cleanPath.startsWith(folder + "/")
            );
        });
        
        validEntries.sort((a, b) => b[1] - a[1]);

        let totalWords = validEntries.reduce((acc, cur) => acc + cur[1], 0);
        let fileCount = validEntries.length;

        // 如果包含历史归档总字数 (files 已经被清理，但 totalWords 存在)
        const isArchived = dayStats && Object.keys(files).length === 0 && dayStats.totalWords > 0;
        if (isArchived && dayStats) {
            totalWords = dayStats.totalWords;
        }

        summaryEl.empty();
        summaryEl.createDiv({ cls: "summary-date", text: date });
        const detailsEl = summaryEl.createDiv({ cls: "summary-details" });
        detailsEl.createSpan({ cls: "summary-val", text: totalWords.toString() });
        detailsEl.createSpan({ cls: "summary-unit", text: ` ${wordsLabel} ` });
        detailsEl.createSpan({ cls: "summary-sep", text: "· " });
        detailsEl.createSpan({ cls: "summary-val", text: fileCount.toString() });
        detailsEl.createSpan({ cls: "summary-unit", text: ` ${filesLabel}` });

        listEl.empty();
        if (isArchived) {
            listEl.createDiv({ cls: "interaction-empty", text: t("archivedNotice", langSetting) });
        } else if (validEntries.length === 0) {
            listEl.createDiv({ cls: "interaction-empty", text: t("noData", langSetting) });
        } else {
            const ul = listEl.createEl("ul");
            for (const [path, count] of validEntries) {
                const li = ul.createEl("li");
                
                const displayName = path.endsWith('.md') ? path.slice(0, -3) : path;
                
                const nameEl = li.createSpan({ 
                    cls: "file-name clickable",
                    text: displayName, 
                    title: path 
                });
                
                nameEl.onclick = (e) => {
                    e.stopPropagation();
                    const newLeaf = e.ctrlKey || e.metaKey;
                    void app.workspace.openLinkText(path, "", newLeaf);
                };
                nameEl.onauxclick = (e) => {
                    if (e.button === 1) {
                        e.stopPropagation();
                        void app.workspace.openLinkText(path, "", true);
                    }
                };

                li.createSpan({ cls: "file-count positive", text: `+${count.toString()}` });
            }
        }

        panel.removeClass("is-hidden");
    }

    private static matchRule(value: number, rules: CellStyleRule[]): CellStyleRule {
        const activeRules = rules.filter(r => r.min > 0 || r.max > 1);
        for (const rule of activeRules) {
            if (value >= rule.min && value < rule.max) {
                return rule;
            }
        }
        return activeRules[activeRules.length - 1];
    }

    private static renderIndicators(container: HTMLElement, rules: CellStyleRule[], langSetting?: LanguageOption) {
        const indicatorContainer = container.createDiv({ cls: "heatmap-indicators" });
        indicatorContainer.createSpan({ text: t("less", langSetting), cls: "indicator-text" });
        
        rules.forEach((rule, index) => {
            const cell = indicatorContainer.createDiv({ cls: "indicator-cell" });
            if (index === 0) {
                cell.addClass("empty");
            } else {
                cell.style.backgroundColor = rule.color;
            }
        });
        
        indicatorContainer.createSpan({ text: t("more", langSetting), cls: "indicator-text" });
    }
}