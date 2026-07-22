import { App, TFile, Plugin, debounce, Debouncer } from "obsidian";
import dayjs from "dayjs";
import { CountType, PluginData, createDefaultData } from "./types";
import { LanguageOption, getLanguage } from "./i18n";

export class DataManager {
    private app: App;
    private plugin: Plugin;
    public data: PluginData;
    private debouncedSave: Debouncer<[], void>;
    public debouncedUpdateFileStats: Debouncer<[TFile, string], void>;

    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
        this.data = createDefaultData();
        this.debouncedSave = debounce(() => this.saveData(), 1000, false);
        // [打字性能优化] 300ms 防抖包装，解决高频打字主线程卡顿
        this.debouncedUpdateFileStats = debounce(
            (file: TFile, content: string) => this.updateFileStats(file, content),
            300,
            false
        );
    }

    async loadData() {
        const loaded = (await this.plugin.loadData()) as Partial<PluginData> | null;
        this.data = Object.assign(createDefaultData(), loaded);
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
            if (!this.data.sessionDate && (this.data.history[todayKey] || Object.keys(this.data.todaySession).length > 0)) {
                this.data.sessionDate = todayKey;
                void this.saveData();
                return;
            }

            this.data.todaySession = {};
            this.data.sessionDate = todayKey;
            
            void this.saveData();
        }
    }

    flush() {
        this.debouncedUpdateFileStats.run();
        this.debouncedSave.run();
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
            this.debouncedSave();
        }
    }

    setCountType(type: CountType) {
        if (this.data.countType !== type) {
            this.data.countType = type;
            this.data.todaySession = {};
            const todayKey = dayjs().format("YYYY-MM-DD");
            if (this.data.history[todayKey]) {
                delete this.data.history[todayKey];
            }
            void this.saveData();
        }
    }

    setLanguage(lang: LanguageOption) {
        this.data.language = lang;
        void this.saveData();
    }

    setHistoryRetentionDays(days: number) {
        this.data.historyRetentionDays = days;
        this.archiveOldHistory(days);
        void this.saveData();
    }

    getCount(text: string): number {
        if (this.data.countType === 'char') {
            return text.length;
        } else {
            return this.getWordCount(text);
        }
    }

    private isCJK(char: string): boolean {
        const code = char.codePointAt(0);
        if (code === undefined) return false;
        return (code >= 0x4E00 && code <= 0x9FFF) ||   // 汉字 / CJK 统一表意文字
               (code >= 0x3400 && code <= 0x4DBF) ||   // CJK 扩展 A
               (code >= 0xF900 && code <= 0xFAFF) ||   // CJK 兼容表意文字
               (code >= 0x3040 && code <= 0x309F) ||   // 日文平假名
               (code >= 0x30A0 && code <= 0x30FF) ||   // 日文片假名
               (code >= 0xAC00 && code <= 0xD7AF) ||   // 韩文音节
               (code >= 0x20000 && code <= 0x323AF);   // CJK 扩展 B~H + 兼容扩展区
    }

    private getWordCount(text: string): number {
        const pattern = /[a-zA-Z0-9_\u0392-\u03c9\u0400-\u04FF\u00E0-\u00FC]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af]+/g;
        const m = text.match(pattern);
        let count = 0;
        if (m === null) return 0;
        for (let i = 0; i < m.length; i++) {
            if (this.isCJK(m[i][0])) {
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
        
        if (diff <= 0) {
            delete this.data.history[todayKey].files[filePath];
        } else {
            this.data.history[todayKey].files[filePath] = diff;
        }
        
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
        const normalizedFolders = (excludeFolders || []).map(f => f.replace(/^\/+|\/+$/g, ""));
        return Object.entries(this.data.history).map(([date, stats]) => {
            let value = 0;
            if (normalizedFolders.length > 0) {
                if (stats.files && Object.keys(stats.files).length > 0) {
                    for (const [filepath, count] of Object.entries(stats.files)) {
                        const cleanPath = filepath.replace(/^\/+|\/+$/g, "");
                        const shouldExclude = normalizedFolders.some(folder => 
                            cleanPath === folder || cleanPath.startsWith(folder + "/")
                        );
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