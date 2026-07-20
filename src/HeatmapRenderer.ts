import { App } from "obsidian";
import { DataManager } from "./DataManager";
import dayjs from "dayjs";
import { HeatmapConfig, mapThemeToRules, CellStyleRule } from "./types";
import { t } from "./i18n";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import "dayjs/locale/zh-cn";

dayjs.extend(isSameOrAfter);
dayjs.locale("zh-cn");

export class HeatmapRenderer {
    static render(app: App, container: HTMLElement, dataManager: DataManager, config: HeatmapConfig) {
        container.empty();
        
        const themeName = config.theme || 'Default';
        const rules = config.cellStyleRules || mapThemeToRules(themeName);
        const startOfWeek = config.startOfWeek ?? 0;
        const lang = config.language || dataManager.data.language || 'auto';
        
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
            graphEl.createEl("div", { cls: "heatmap-title", text: config.title });
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
                label.innerHTML = "&nbsp;"; 
            }
        }

        const contentContainer = mainContainer.createDiv({ cls: "heatmap-content" });
        const gridContainer = contentContainer.createDiv({ cls: "heatmap-grid" });

        let loopDate = startDate.day(startOfWeek);
        if (loopDate.isAfter(startDate)) loopDate = loopDate.subtract(7, 'day');
        const endLoopDate = endDate.endOf('week').day(startOfWeek === 0 ? 6 : startOfWeek - 1);
        let currentMonth = -1;

        while (loopDate.isBefore(endLoopDate) || loopDate.isSame(endLoopDate, 'day')) {
            const weekColumn = gridContainer.createDiv({ cls: "heatmap-column" });
            const firstDayOfWeek = loopDate;
            const monthOfThisWeek = firstDayOfWeek.month();
            
            if (monthOfThisWeek !== currentMonth && firstDayOfWeek.isSameOrAfter(startDate)) {
                currentMonth = monthOfThisWeek;
                const monthLabel = weekColumn.createDiv({ cls: "month-label" });
                monthLabel.innerText = firstDayOfWeek.format("MMM"); 
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
                        // Toggle off
                        const panel = graphEl.querySelector(".heatmap-interaction-panel") as HTMLElement;
                        if (panel) panel.style.display = "none";
                    }
                };

                if (count === 0) {
                    cell.addClass("empty");
                } else {
                    const matchRule = this.matchRule(count, rules);
                    cell.style.backgroundColor = matchRule.color;
                }
                
                const unitText = t("words", lang);
                cell.setAttribute("aria-label", `${dayStr}: ${count}${unitText}`);

                if (loopDate.isBefore(startDate) || loopDate.isAfter(endDate)) {
                    cell.addClass("hidden-cell");
                }

                loopDate = loopDate.add(1, 'day');
            }
        }

        if (config.showCellRuleIndicators !== false) {
             this.renderIndicators(graphEl, rules, lang);
        }

        this.renderInteractionPanel(graphEl);
    }

    private static renderInteractionPanel(container: HTMLElement) {
        const panel = container.createDiv({ cls: "heatmap-interaction-panel" });
        panel.style.display = "none"; 

        panel.createDiv({ cls: "interaction-summary" });
        panel.createDiv({ cls: "interaction-list" });
        
        const closeBtn = panel.createDiv({ cls: "interaction-close-btn", title: "Close" });
        closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            panel.style.display = "none";
            container.querySelectorAll('.heatmap-cell.selected').forEach(el => el.removeClass('selected'));
        };
    }

    private static updateInteractionPanel(app: App, date: string, dayStats: any, container: HTMLElement, excludeFolders: string[] = [], langSetting?: any) {
        const panel = container.querySelector(".heatmap-interaction-panel") as HTMLElement;
        const summaryEl = panel.querySelector(".interaction-summary");
        const listEl = panel.querySelector(".interaction-list");
        
        if (!panel || !summaryEl || !listEl) return;

        const wordsLabel = t("words", langSetting);
        const filesLabel = t("files", langSetting);

        const files = dayStats ? (dayStats.files || {}) : {};
        const entries = Object.entries(files) as [string, number][];
        
        const validEntries = entries.filter(([path, count]) => {
            if (count <= 0) return false; 
            return !excludeFolders.some(f => path.startsWith(f));
        });
        
        validEntries.sort((a, b) => b[1] - a[1]);

        let totalWords = validEntries.reduce((acc, cur) => acc + cur[1], 0);
        let fileCount = validEntries.length;

        // 如果包含历史归档总字数 (files 已经被清理，但 totalWords 存在)
        const isArchived = dayStats && Object.keys(files).length === 0 && dayStats.totalWords > 0;
        if (isArchived) {
            totalWords = dayStats.totalWords;
        }

        summaryEl.innerHTML = `
            <div class="summary-date">${date}</div>
            <div class="summary-details">
                <span class="summary-val">${totalWords}</span> <span class="summary-unit">${wordsLabel}</span>
                <span class="summary-sep">·</span>
                <span class="summary-val">${fileCount}</span> <span class="summary-unit">${filesLabel}</span>
            </div>
        `;

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
                
                const nameEl = li.createEl("span", { 
                    cls: "file-name clickable",
                    text: displayName, 
                    title: path 
                });
                
                nameEl.onclick = (e) => {
                    e.stopPropagation();
                    app.workspace.openLinkText(path, "", false);
                };

                li.createSpan({ cls: "file-count positive", text: `+${count}` });
            }
        }

        panel.style.display = "flex";
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

    private static renderIndicators(container: HTMLElement, rules: CellStyleRule[], langSetting?: any) {
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