import { LanguageOption } from "./i18n";

export interface CellStyleRule {
    min: number;
    max: number;
    color: string;
    text?: string;
}

export type GraphTheme = 'Default' | 'Ocean' | 'Halloween' | 'Lovely' | 'Wine';
export type CountType = 'word' | 'char';

export interface DayStats {
    totalWords: number;
    files: Record<string, number>;
}

export interface PluginData {
    history: Record<string, DayStats>;
    // 保存每个文件的【当日初始字数】和【当前字数】
    todaySession: Record<string, { initial: number; current: number }>; 
    lastSaveTime: number;
    // 显式记录当前 Session 属于哪一天
    sessionDate: string; 
    // 持久化保存统计类型
    countType?: CountType;
    // 历史路径明细保留天数（0 表示永久保留，默认 0）
    historyRetentionDays?: number;
    // 语言设置
    language?: LanguageOption;
}

export interface HeatmapConfig {
    title?: string;
    dateRangeType?: 'latest_days' | 'fixed_year';
    year?: number;
    days?: number;
    excludeFolders?: string[];
    theme?: GraphTheme;
    startOfWeek?: number;
    showCellRuleIndicators?: boolean;
    fillTheScreen?: boolean;
    countType?: CountType;
    cellStyleRules?: CellStyleRule[];
    historyRetentionDays?: number;
    language?: LanguageOption;
}

export const THEMES: Record<GraphTheme, string[]> = {
    Default: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    Ocean:   ["#ebedf0", "#8dd1e2", "#63a1be", "#376d93", "#012f60"],
    Halloween: ["#ebedf0", "#fdd577", "#faaa53", "#f07c44", "#d94e49"],
    Lovely:  ["#ebedf0", "#fedcdc", "#fdb8bf", "#f892a9", "#ec6a97"],
    Wine:    ["#ebedf0", "#d8b0b3", "#c78089", "#ac4c61", "#830738"]
};

export const mapThemeToRules = (theme: GraphTheme): CellStyleRule[] => {
    const colors = THEMES[theme] || THEMES.Default;
    return [
        { min: 0, max: 1, color: colors[0], text: "" },
        { min: 1, max: 200, color: colors[1], text: "" },
        { min: 200, max: 1000, color: colors[2], text: "" },
        { min: 1000, max: 3000, color: colors[3], text: "" },
        { min: 3000, max: 9999999, color: colors[4], text: "" }
    ];
};