import { describe, expect, it } from "vitest";

/**
 * 冒烟测试：验证 vitest 运行器与 TS 管线可用。
 * 真实行为测试（围栏剥离 / 防抖 / RenderBackend）在 T2–T4 落地。
 */
describe("smoke", () => {
  it("test runner works", () => {
    expect(1 + 1).toBe(2);
  });
});
