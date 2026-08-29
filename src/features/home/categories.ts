import type { Category } from "../../domain/types";

/** 「人気」「初心者向け」は Strategy.category そのものではないため、専用のキーを足して扱う。 */
export type CategoryFilterKey = "popular" | "beginner" | Category;

export const CATEGORY_TABS: { key: CategoryFilterKey; label: string; glyph: string }[] = [
  { key: "popular", label: "人気", glyph: "★" },
  { key: "beginner", label: "初心者向け", glyph: "歩" },
  { key: "ibisha", label: "居飛車", glyph: "飛" },
  { key: "furibisha", label: "振り飛車", glyph: "飛" },
  { key: "nakabisha", label: "中飛車", glyph: "飛" },
  { key: "kishu", label: "奇襲戦法", glyph: "桂" },
];
