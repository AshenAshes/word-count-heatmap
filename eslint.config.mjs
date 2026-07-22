import obsidianmd from "eslint-plugin-obsidianmd";

export default [
    ...obsidianmd.configs.recommended,
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.json"
            }
        },
        rules: {
            "eslint-comments/no-restricted-disable": "off",
            "eslint-comments/require-description": "off",
            "eslint-comments/disable-enable-pair": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-misused-promises": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "obsidianmd/no-static-styles-assignment": "off"
        }
    }
];
