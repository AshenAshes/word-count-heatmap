import { App, TFile, Plugin, debounce, Debouncer } from "obsidian";
import dayjs from "dayjs";
import { CountType, PluginData } from "./types";
import { LanguageOption, getLanguage } from "./i18n";

const DEFAULT_DATA: PluginData = {
    history: {},
    todaySession: {},
    lastSaveTime: 0,
    sessionDate: "",
    countType: 'word',
    historyRetentionDays: 0, // 默认 0 (永久保留)
    language: 'auto'
};

export class DataManager {
    private app: App;
    private plugin: Plugin;
    public data: PluginData;
    private debouncedSave: Debouncer<[], void>;
    public debouncedUpdateFileStats: Debouncer<[TFile, string], void>;

    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
        this.data = DEFAULT_DATA;
        this.debouncedSave = debounce(() => this.saveData(), 1000, false);
        // [打字性能优化] 300ms 防抖包装，解决高频打字主线程卡顿
        this.debouncedUpdateFileStats = debounce(
            (file: TFile, content: string) => this.updateFileStats(file, content),
            300,
            false
        );
    }

    async loadData() {
        const loaded = await this.plugin.loadData();
        this.data = Object.assign({}, DEFAULT_DATA, loaded);
        if (!this.data.language) {
            this.data.language = 'auto';
        }
        if (!loaded || !loaded.countType) {
            const currentLang = getLanguage(this.data.language);
            this.data.countType = currentLang === 'zh' ? 'char' : 'word';
        }
        if (this.data.historyRetentionDays === undefined) {
            this.data.historyRetentionDays = 0;
        }

        // 跨日检测与历史数据归档瘦身
        this.checkDateAndReset();
        this.archiveOldHistory(this.data.historyRetentionDays);
    }

    async saveData() {
        this.data.lastSaveTime = Date.now();
        if (!this.data.sessionDate) {
            this.data.sessionDate = dayjs().format("YYYY-MM-DD");
        }
        await this.plugin.saveData(this.data);
    }

    private checkDateAndReset() {
        const todayKey = dayjs().format("YYYY-MM-DD");
        
        if (this.data.sessionDate !== todayKey) {
            if (!this.data.sessionDate && this.data.history[todayKey]) {
                console.log(`[Word Heatmap] Recovering session for ${todayKey}...`);
                this.data.sessionDate = todayKey;
                this.saveData();
                return;
            }

            console.log(`[Word Heatmap] New day: ${todayKey}. Resetting session.`);
            this.data.todaySession = {};
            this.data.sessionDate = todayKey;
            
            // 跨天时自动触发历史瘦身归档
            this.archiveOldHistory(this.data.historyRetentionDays);
            this.saveData();
        }
    }

    /**
     * 历史明细自动瘦身归档
     * @param retentionDays 保留天数。0 表示永久保留。大于 0 时将清理超出天数的笔记路径明细 files 字段，保留 totalWords 汇总
     */
    archiveOldHistory(retentionDays: number = 0) {
        if (!retentionDays || retentionDays <= 0) {
            return; // 0 表示永久保留，不做任何清理
        }

        const cutoffDate = dayjs().subtract(retentionDays, 'day');
        let archivedCount = 0;

        for (const [dateStr, stats] of Object.entries(this.data.history)) {
            if (dayjs(dateStr).isBefore(cutoffDate, 'day')) {
                // 如果存在详细路径映射，则清空明细字典（保留 totalWords）
                if (stats.files && Object.keys(stats.files).length > 0) {
                    stats.files = {};
                    archivedCount++;
                }
            }
        }

        if (archivedCount > 0) {
            console.log(`[Word Heatmap] Archived details for ${archivedCount} old dates (older than ${retentionDays} days).`);
            this.debouncedSave();
        }
    }

    setCountType(type: CountType) {
        if (this.data.countType !== type) {
            console.log(`[Word Heatmap] Switching count type from ${this.data.countType} to ${type}. Resetting stats.`);
            
            this.data.countType = type;
            this.data.todaySession = {};
            const todayKey = dayjs().format("YYYY-MM-DD");
            if (this.data.history[todayKey]) {
                delete this.data.history[todayKey];
            }
            this.saveData();
        }
    }

    public onLanguageChange?: () => void;

    setLanguage(lang: LanguageOption) {
        this.data.language = lang;
        this.saveData();
        if (this.onLanguageChange) {
            this.onLanguageChange();
        }
    }

    setHistoryRetentionDays(days: number) {
        this.data.historyRetentionDays = days;
        this.archiveOldHistory(days);
        this.saveData();
    }

    getCount(text: string): number {
        if (this.data.countType === 'char') {
            return text.length;
        } else {
            return this.getWordCount(text);
        }
    }

    private getWordCount(text: string): number {
        const pattern = /[a-zA-Z0-9_\u0392-\u03c9\u0400-\u04FF]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|[\u00E0-\u00FC]/g;
        const m = text.match(pattern);
        let count = 0;
        if (m === null) return 0;
        for (let i = 0; i < m.length; i++) {
            if (m[i].charCodeAt(0) >= 0x4e00) {
                count += m[i].length;
            } else {
                count += 1;
            }
        }
        return count;
    }

    updateFileBaseline(file: TFile, content: string) {
        this.checkDateAndReset();
        
        const filePath = file.path;
        
        if (!this.data.todaySession[filePath]) {
            const currentCount = this.getCount(content);
            this.data.todaySession[filePath] = { 
                initial: currentCount, 
                current: currentCount 
            };
            this.debouncedSave(); 
        }
    }

    updateFileStats(file: TFile, content: string) {
        this.checkDateAndReset();
        
        const todayKey = dayjs().format("YYYY-MM-DD");
        const filePath = file.path;
        const currentCount = this.getCount(content);

        if (!this.data.todaySession[filePath]) {
            this.data.todaySession[filePath] = { initial: currentCount, current: currentCount };
        }

        this.data.todaySession[filePath].current = currentCount;

        const diff = this.data.todaySession[filePath].current - this.data.todaySession[filePath].initial;

        if (!this.data.history[todayKey]) {
            this.data.history[todayKey] = { totalWords: 0, files: {} };
        }
        
        this.data.history[todayKey].files[filePath] = diff;
        
        this.recalculateTotal(todayKey);
        this.debouncedSave();
    }

    recalculateTotal(dateKey: string) {
        let dailyTotal = 0;
        const files = this.data.history[dateKey].files;
        for (const f in files) {
            if (files[f] > 0) {
                dailyTotal += files[f];
            }
        }
        this.data.history[dateKey].totalWords = dailyTotal;
    }
    
    getHeatmapData(excludeFolders: string[] = []) {
        return Object.entries(this.data.history).map(([date, stats]) => {
            let value = 0;
            if (excludeFolders && excludeFolders.length > 0) {
                if (stats.files && Object.keys(stats.files).length > 0) {
                    for (const [filepath, count] of Object.entries(stats.files)) {
                        const shouldExclude = excludeFolders.some(folder => filepath.startsWith(folder));
                        if (!shouldExclude && count > 0) {
                            value += count;
                        }
                    }
                } else {
                    // 若已归档无 files 字典，使用 totalWords
                    value = stats.totalWords;
                }
            } else {
                value = stats.totalWords;
            }
            return { date: date, value: value };
        });
    }
}