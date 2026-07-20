import { describe, it, expect } from "vitest";
import { mapThemeToRules, THEMES } from "../src/types";

describe("types & mapThemeToRules", () => {
    it("should return Default theme rules when unknown theme is provided", () => {
        // @ts-ignore
        const rules = mapThemeToRules("NonExistentTheme");
        expect(rules).toHaveLength(5);
        expect(rules[0].color).toBe(THEMES.Default[0]);
    });

    it("should map colors correctly for Ocean theme", () => {
        const rules = mapThemeToRules("Ocean");
        expect(rules).toHaveLength(5);
        expect(rules[0].color).toBe("#ebedf0");
        expect(rules[1].color).toBe("#8dd1e2");
        expect(rules[4].color).toBe("#012f60");
    });

    it("should define correct min/max ranges in CellStyleRules", () => {
        const rules = mapThemeToRules("Default");
        expect(rules[0]).toEqual({ min: 0, max: 1, color: THEMES.Default[0], text: "" });
        expect(rules[1]).toEqual({ min: 1, max: 200, color: THEMES.Default[1], text: "" });
        expect(rules[2]).toEqual({ min: 200, max: 1000, color: THEMES.Default[2], text: "" });
        expect(rules[3]).toEqual({ min: 1000, max: 3000, color: THEMES.Default[3], text: "" });
        expect(rules[4]).toEqual({ min: 3000, max: 9999999, color: THEMES.Default[4], text: "" });
    });

    it("should accept valid custom thresholds and map them into rules", () => {
        const rules = mapThemeToRules("Default", [100, 500, 1500]);
        expect(rules[1]).toEqual({ min: 1, max: 100, color: THEMES.Default[1], text: "" });
        expect(rules[2]).toEqual({ min: 100, max: 500, color: THEMES.Default[2], text: "" });
        expect(rules[3]).toEqual({ min: 500, max: 1500, color: THEMES.Default[3], text: "" });
        expect(rules[4]).toEqual({ min: 1500, max: 9999999, color: THEMES.Default[4], text: "" });
    });

    it("should sanitize and auto-correct contradictory user thresholds (e.g. non-increasing or negative)", () => {
        const rules = mapThemeToRules("Default", [500, 300, 200]);
        expect(rules[1].max).toBe(500);
        expect(rules[2].min).toBe(500);
        expect(rules[2].max).toBe(1000);
        expect(rules[3].min).toBe(1000);
        expect(rules[3].max).toBe(3000);
        expect(rules[4].min).toBe(3000);
    });
});
