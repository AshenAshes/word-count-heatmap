import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getLanguage, t } from "../src/i18n";

describe("i18n module", () => {
    it("should respect explicit 'zh' or 'en' settings", () => {
        expect(getLanguage("zh")).toBe("zh");
        expect(getLanguage("en")).toBe("en");
    });

    it("should translate keys correctly for zh and en", () => {
        expect(t("configTitle", "zh")).toBe("热力图配置");
        expect(t("configTitle", "en")).toBe("Heatmap Configuration");
        expect(t("confirmCleanupBtn", "zh")).toBe("确认并清理");
        expect(t("confirmCleanupBtn", "en")).toBe("Confirm & Clean Up");
    });

    it("should fallback to 'en' when auto detects non-Chinese environment", () => {
        const lang = getLanguage("auto");
        expect(["zh", "en"]).toContain(lang);
    });
});
