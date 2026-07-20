import { describe, it, expect, beforeEach, vi } from "vitest";
import dayjs from "dayjs";
import { DataManager } from "../src/DataManager";

describe("DataManager", () => {
    let dataManager: DataManager;

    beforeEach(() => {
        const mockApp = {} as any;
        const mockPlugin = {
            saveData: vi.fn(),
            loadData: vi.fn().mockResolvedValue({})
        } as any;
        dataManager = new DataManager(mockApp, mockPlugin);
    });

    describe("getCount (Word vs Character count)", () => {
        it("should count English words correctly in 'word' mode", () => {
            dataManager.data.countType = 'word';
            expect(dataManager.getCount("Hello world")).toBe(2);
            expect(dataManager.getCount("Obsidian Word Heatmap Plugin")).toBe(4);
        });

        it("should count Chinese characters as words in 'word' mode", () => {
            dataManager.data.countType = 'word';
            expect(dataManager.getCount("你好世界")).toBe(4);
            expect(dataManager.getCount("Obsidian 热力图 插件")).toBe(6);
        });

        it("should count total characters in 'char' mode", () => {
            dataManager.data.countType = 'char';
            expect(dataManager.getCount("Hello world")).toBe(11);
            expect(dataManager.getCount("你好世界")).toBe(4);
        });

        it("should default to 'char' for Chinese language and 'word' for English when unconfigured", async () => {
            const dmZh = new DataManager({} as any, { saveData: vi.fn(), loadData: vi.fn().mockResolvedValue({ language: 'zh' }) } as any);
            await dmZh.loadData();
            expect(dmZh.data.countType).toBe("char");

            const dmEn = new DataManager({} as any, { saveData: vi.fn(), loadData: vi.fn().mockResolvedValue({ language: 'en' }) } as any);
            await dmEn.loadData();
            expect(dmEn.data.countType).toBe("word");
        });
    });

    describe("recalculateTotal (Positive Contribution Logic)", () => {
        it("should sum positive word changes for a given date", () => {
            const dateKey = "2026-07-21";
            dataManager.data.history[dateKey] = {
                totalWords: 0,
                files: {
                    "Folder/Note1.md": 150,
                    "Folder/Note2.md": 300,
                }
            };
            dataManager.recalculateTotal(dateKey);
            expect(dataManager.data.history[dateKey].totalWords).toBe(450);
        });

        it("should ignore negative word changes (deletions)", () => {
            const dateKey = "2026-07-21";
            dataManager.data.history[dateKey] = {
                totalWords: 0,
                files: {
                    "Folder/Note1.md": -200,
                    "Folder/Note2.md": 500,
                }
            };
            dataManager.recalculateTotal(dateKey);
            expect(dataManager.data.history[dateKey].totalWords).toBe(500);
        });
    });

    describe("archiveOldHistory (Storage Cleanup)", () => {
        it("should NOT clean up any details when retentionDays is 0 (Forever)", () => {
            const oldDateStr = dayjs().subtract(100, "day").format("YYYY-MM-DD");
            dataManager.data.history[oldDateStr] = {
                totalWords: 800,
                files: { "Old/Note.md": 800 }
            };

            dataManager.archiveOldHistory(0);

            expect(dataManager.data.history[oldDateStr].files).toEqual({ "Old/Note.md": 800 });
            expect(dataManager.data.history[oldDateStr].totalWords).toBe(800);
        });

        it("should clean up file details older than retentionDays while keeping totalWords", () => {
            const oldDateStr = dayjs().subtract(100, "day").format("YYYY-MM-DD");
            const recentDateStr = dayjs().subtract(10, "day").format("YYYY-MM-DD");

            dataManager.data.history[oldDateStr] = {
                totalWords: 800,
                files: { "Old/Note.md": 800 }
            };
            dataManager.data.history[recentDateStr] = {
                totalWords: 300,
                files: { "Recent/Note.md": 300 }
            };

            // Archive older than 90 days
            dataManager.archiveOldHistory(90);

            // Old entry should have files cleared
            expect(dataManager.data.history[oldDateStr].files).toEqual({});
            expect(dataManager.data.history[oldDateStr].totalWords).toBe(800);

            // Recent entry should remain untouched
            expect(dataManager.data.history[recentDateStr].files).toEqual({ "Recent/Note.md": 300 });
        });
    });

    describe("debouncedUpdateFileStats", () => {
        it("should have debouncedUpdateFileStats defined", () => {
            expect(dataManager.debouncedUpdateFileStats).toBeDefined();
            expect(typeof dataManager.debouncedUpdateFileStats).toBe("function");
        });
    });
});
