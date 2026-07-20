import { App, TFile, Plugin, debounce, Debouncer } from "obsidian";
import dayjs from "dayjs";
import { CountType, PluginData } from "./types";

const DEFAULT_DATA: PluginData = {
    history: {},
    todaySession: {},
    lastSaveTime: 0,
    sessionDate: "",
    countType: 'word' // 默认值
};

export class DataManager {
    private app: App;
    private plugin: Plugin;
    public data: PluginData;
    private debouncedSave: Debouncer<[], void>;

    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
        this.data = DEFAULT_DATA;
        this.debouncedSave = debounce(() => this.saveData(), 1000, false);
    }

    async loadData() {
        const loaded = await this.plugin.loadData();
        this.data = Object.assign({}, DEFAULT_DATA, loaded);
        
        // 确保 countType 有值 (处理旧数据)
        if (!this.data.countType) {
            this.data.countType = 'word';
        }

        // 检查跨日逻辑
        this.checkDateAndReset();
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
            // 容错：如果 sessionDate 为空但 history 里有今天的数据，尝试恢复而不是清空
            if (!this.data.sessionDate && this.data.history[todayKey]) {
                console.log(`[Word Heatmap] Recovering session for ${todayKey}...`);
                this.data.sessionDate = todayKey;
                this.saveData();
                return;
            }

            console.log(`[Word Heatmap] New day: ${todayKey}. Resetting session.`);
            this.data.todaySession = {};
            this.data.sessionDate = todayKey;
            this.saveData();
        }
    }

    // [核心修复]：重启后不再误删数据
    setCountType(type: CountType) {
        // 只有当传入的类型 与 硬盘里保存的类型 不一致时，才重置
        if (this.data.countType !== type) {
            console.log(`[Word Heatmap] Switching count type from ${this.data.countType} to ${type}. Resetting stats.`);
            
            this.data.countType = type; // 更新持久化状态
            
            // 重置今日数据
            this.data.todaySession = {};
            const todayKey = dayjs().format("YYYY-MM-DD");
            if (this.data.history[todayKey]) {
                delete this.data.history[todayKey];
            }
            this.saveData();
        }
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
        
        // 如果今天已经记录过该文件的基准值，绝对不要覆盖它！
        // 这样重启后，initial 依然是重启前第一次打开时的值。
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

        // 容错初始化
        if (!this.data.todaySession[filePath]) {
            this.data.todaySession[filePath] = { initial: currentCount, current: currentCount };
        }

        this.data.todaySession[filePath].current = currentCount;

        const diff = this.data.todaySession[filePath].current - this.data.todaySession[filePath].initial;

        if (!this.data.history[todayKey]) {
            this.data.history[todayKey] = { totalWords: 0, files: {} };
        }
        
        // 记录该文件的净变化量 (可以是负数)
        this.data.history[todayKey].files[filePath] = diff;
        
        this.recalculateTotal(todayKey);
        this.debouncedSave();
    }

    // [核心修复]：只统计正数贡献
    recalculateTotal(dateKey: string) {
        let dailyTotal = 0;
        const files = this.data.history[dateKey].files;
        for (const f in files) {
            // 如果单个文件变化量为负（删减内容），视为 0 贡献，不扣减总字数
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
                for (const [filepath, count] of Object.entries(stats.files)) {
                    const shouldExclude = excludeFolders.some(folder => filepath.startsWith(folder));
                    // 同样，热力图渲染时也忽略负数
                    if (!shouldExclude && count > 0) {
                        value += count;
                    }
                }
            } else {
                value = stats.totalWords; // totalWords 已经是处理过的正数累加了
            }
            return { date: date, value: value };
        });
    }
}