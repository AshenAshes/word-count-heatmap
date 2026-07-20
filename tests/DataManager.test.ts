import { describe, it, expect, beforeEach } from "vitest";
import { DataManager } from "../src/DataManager";

describe("DataManager", () => {
    let dataManager: DataManager;

    beforeEach(() => {
        const mockApp = {} as any;
        const mockPlugin = {} as any;
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
            expect(dataManager.getCount("Obsidian 热力图 插件")).toBe(6); // Obsidian (1) + 热力图 (3) + 插件 (2) = 6
        });

        it("should count total characters in 'char' mode", () => {
            dataManager.data.countType = 'char';
            expect(dataManager.getCount("Hello world")).toBe(11);
            expect(dataManager.getCount("你好世界")).toBe(4);
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

        it("should ignore negative word changes (deletions) and not subtract from total", () => {
            const dateKey = "2026-07-21";
            dataManager.data.history[dateKey] = {
                totalWords: 0,
                files: {
                    "Folder/Note1.md": -200, // file shrank
                    "Folder/Note2.md": 500,  // file grew
                }
            };
            dataManager.recalculateTotal(dateKey);
            expect(dataManager.data.history[dateKey].totalWords).toBe(500);
        });
    });

    describe("getHeatmapData (Folder Exclusion Filter)", () => {
        it("should filter out files in excluded folders", () => {
            const dateKey = "2026-07-21";
            dataManager.data.history[dateKey] = {
                totalWords: 1000,
                files: {
                    "Public/Article.md": 400,
                    "Private/Secret.md": 600,
                }
            };

            const fullData = dataManager.getHeatmapData([]);
            expect(fullData).toEqual([{ date: "2026-07-21", value: 1000 }]);

            const filteredData = dataManager.getHeatmapData(["Private/"]);
            expect(filteredData).toEqual([{ date: "2026-07-21", value: 400 }]);
        });
    });
});
