import { catalogCities, catalogLanguages } from "./catalog-options.ts";
export type ProviderOptionKind = "languages" | "city";
export const providerOptionList = (kind: ProviderOptionKind) =>
  kind === "languages" ? catalogLanguages : catalogCities;
const aliases: Record<string, string> = {
  英语: "en",
  汉语: "zh",
  普通话: "zh",
  国语: "zh",
  中国话: "zh",
  英文: "en",
  西班牙语: "es",
  法语: "fr",
  德语: "de",
  意大利语: "it",
  阿拉伯语: "ar",
  mandarin: "zh",
};
export function providerOptions(kind: ProviderOptionKind, value: unknown) {
  const list = providerOptionList(kind),
    selected = new Set<string>(),
    unresolved = new Set<string>();
  for (const part of (typeof value === "string" ? value : "").split(/[,，、;；/|+\n]+/)) {
    const token = part.trim();
    if (!token) continue;
    const lower = token.toLowerCase(),
      match = list.find((row) => Object.values(row).some((v) => v.toLowerCase() === lower)),
      code =
        match?.code ??
        (kind === "languages" && Object.hasOwn(aliases, lower) ? aliases[lower] : undefined);
    if (code) selected.add(code);
    else unresolved.add(token);
  }
  return {
    selected: list.filter((row) => selected.has(row.code)).map((row) => row.code),
    unresolved: [...unresolved],
  };
}
export function providerOptionValue(
  kind: ProviderOptionKind,
  selected: string[],
  unresolved: string[],
) {
  const list = providerOptionList(kind);
  if (selected.some((code) => !list.some((row) => row.code === code)))
    throw Error("请选择标准名单中的选项");
  return [
    ...list.filter((row) => selected.includes(row.code)).map((row) => row.zh),
    ...unresolved,
  ].join("、");
}
