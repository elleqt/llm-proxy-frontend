import { describe, expect, it } from "vitest";
import { providerLevels } from "./levels";

const D = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

describe("providerLevels", () => {
  it("reads a provider list from per-model storage", () => {
    expect(providerLevels([{}, {}], D)).toEqual({ kind: "default" });
    expect(providerLevels([{ reasoningLevels: ["low", "high"] }, { reasoningLevels: ["high", "low"] }], D)).toEqual({
      kind: "own",
      levels: ["low", "high"],
    });
    expect(providerLevels([{}, { reasoningLevels: ["low"] }], D)).toEqual({ kind: "mixed" });
    expect(providerLevels([], D)).toEqual({ kind: "default" });
  });

  it("counts a stored copy of the default set as following the default", () => {
    expect(providerLevels([{}, { reasoningLevels: [...D].reverse() }], D)).toEqual({ kind: "default" });
  });

  it("calls two different own lists mixed", () => {
    expect(providerLevels([{ reasoningLevels: ["low"] }, { reasoningLevels: ["high"] }], D)).toEqual({ kind: "mixed" });
  });
});
