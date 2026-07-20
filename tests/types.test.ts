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
});
