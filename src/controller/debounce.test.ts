import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebounce } from "./debounce";

/**
 * REQ-DEBOUNCE-001 / D4 防抖调度器测试。
 * 核心红线：高频事件绝不同步触发 fn；停顿 waitMs 后仅触发一次（携带最后一次参数）；
 * cancel 可取消；flush 立即触发并清除定时器（onDragEnd 写回兜底）。
 */
describe("createDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("连续高频调用（间隔 < waitMs）在停顿前零触发，停顿 waitMs 后恰好触发一次", () => {
    const fn = vi.fn();
    const debounce = createDebounce(fn, 500);

    for (let i = 0; i < 100; i++) {
      debounce.call(i);
      vi.advanceTimersByTime(10); // 每次调用后仅推进 10ms，始终不足 500ms
    }

    expect(fn).not.toHaveBeenCalled();
    expect(debounce.getPending()).toBe(true);

    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(debounce.getPending()).toBe(false);
  });

  it("参数透传：执行时携带最后一次调用的参数", () => {
    const fn = vi.fn();
    const debounce = createDebounce(fn, 100);

    debounce.call("a", 1);
    debounce.call("b", 2);
    debounce.call("c", 3);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c", 3);
  });

  it("cancel 后即使等待也不触发，且无待处理状态", () => {
    const fn = vi.fn();
    const debounce = createDebounce(fn, 100);

    debounce.call("x");
    debounce.cancel();

    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    expect(debounce.getPending()).toBe(false);
  });

  it("cancel 后 flush 也不触发（已无待处理调用）", () => {
    const fn = vi.fn();
    const debounce = createDebounce(fn, 100);

    debounce.call("x");
    debounce.cancel();
    debounce.flush();

    expect(fn).not.toHaveBeenCalled();
  });

  it("flush 立即触发且只触发一次（定时器已清除，等待也不重复）", () => {
    const fn = vi.fn();
    const debounce = createDebounce(fn, 100);

    debounce.call("v1");
    debounce.flush();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("v1");
    expect(debounce.getPending()).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush 无待处理调用时不触发", () => {
    const fn = vi.fn();
    const debounce = createDebounce(fn, 100);

    debounce.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("触发后再 call 重新计时（新周期）", () => {
    const fn = vi.fn();
    const debounce = createDebounce(fn, 100);

    debounce.call(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    // 执行后再次 call：进入新周期，50ms 时不应触发，满 100ms 后再触发一次
    debounce.call(2);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  it("flush 后再 call 重新开始计时（新周期）", () => {
    const fn = vi.fn();
    const debounce = createDebounce(fn, 100);

    debounce.call(1);
    debounce.flush();
    expect(fn).toHaveBeenCalledTimes(1);

    debounce.call(2);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  it("fn 为方法时经 bind 传入，this 绑定正确", () => {
    const holder = {
      count: 0,
      add(n: number) {
        this.count += n;
      },
    };
    const debounce = createDebounce(holder.add.bind(holder), 100);

    debounce.call(5);
    vi.advanceTimersByTime(100);

    expect(holder.count).toBe(5);
  });
});
