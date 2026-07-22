import { describe, it, expect } from "vitest";
import { getLanguage, t } from "../src/i18n";

describe("i18n module", () => {
    it("should respect explicit 'zh' or 'en' settings", () => {
        expect(getLanguage("zh")).toBe("zh");
        expect(getLanguage("en")).toBe("en");
    });

    it("should translate keys correctly for zh and en without mixed languages", () => {
        expect(t("configTitle", "zh")).toBe("热力图配置");
        expect(t("configTitle", "en")).toBe("Heatmap Configuration");
        expect(t("confirmCleanupBtn", "zh")).toBe("确认并清理");
        expect(t("confirmCleanupBtn", "en")).toBe("Confirm & Clean Up");

        // Verify pure Chinese translations without mixed English
        expect(t("languageAuto", "zh")).toBe("自动");
        expect(t("languageAuto", "en")).toBe("Auto");
        expect(t("sunday", "zh")).toBe("周日");
        expect(t("sunday", "en")).toBe("Sunday");
        expect(t("retentionForever", "zh")).toBe("永久保留");
        expect(t("retentionForever", "en")).toBe("Forever");
        expect(t("countTypeWord", "zh")).toBe("词数");
        expect(t("countTypeWord", "en")).toBe("Word Count");
        expect(t("insertCommandName", "zh")).toBe("插入字数热力图");
        expect(t("insertCommandName", "en")).toBe("Insert Word Heatmap");
    });

    it("should fallback to 'en' when auto detects non-Chinese environment such as French or German", () => {
        const mockWindow = {
            moment: {
                locale: () => "fr"
            }
        };
        (globalThis as any).window = mockWindow;
        expect(getLanguage("auto")).toBe("en");

        mockWindow.moment.locale = () => "ja";
        expect(getLanguage("auto")).toBe("en");

        delete (globalThis as any).window;
    });
});
