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
    thresholds?: [number, number, number];
}

export const THEMES: Record<GraphTheme, string[]> = {
    Default: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    Ocean:   ["#ebedf0", "#8dd1e2", "#63a1be", "#376d93", "#012f60"],
    Halloween: ["#ebedf0", "#fdd577", "#faaa53", "#f07c44", "#d94e49"],
    Lovely:  ["#ebedf0", "#fedcdc", "#fdb8bf", "#f892a9", "#ec6a97"],
    Wine:    ["#ebedf0", "#d8b0b3", "#c78089", "#ac4c61", "#830738"]
};

export function sanitizeThresholds(raw?: any): [number, number, number] {
    let t1 = parseInt(raw?.[0], 10);
    let t2 = parseInt(raw?.[1], 10);
    let t3 = parseInt(raw?.[2], 10);

    if (isNaN(t1) || t1 < 1) t1 = 200;
    if (isNaN(t2) || t2 <= t1) t2 = Math.max(t1 + 1, 1000);
    if (isNaN(t3) || t3 <= t2) t3 = Math.max(t2 + 1, 3000);

    return [t1, t2, t3];
}

export const mapThemeToRules = (theme: GraphTheme, rawThresholds?: any): CellStyleRule[] => {
    const colors = THEMES[theme] || THEMES.Default;
    const [t1, t2, t3] = sanitizeThresholds(rawThresholds);
    return [
        { min: 0, max: 1, color: colors[0], text: "" },
        { min: 1, max: t1, color: colors[1], text: "" },
        { min: t1, max: t2, color: colors[2], text: "" },
        { min: t2, max: t3, color: colors[3], text: "" },
        { min: t3, max: 9999999, color: colors[4], text: "" }
    ];
};