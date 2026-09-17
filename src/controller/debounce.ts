/**
 * 防抖调度器。
 *
 * 核心红线：拖拽 / onMouseMove 等高帧事件绝不在回调中同步调用 `updateBlock`，
 * 节点拖拽类变更必须经本原语（waitMs 防抖）或 onDragEnd flush 聚合后写回。
 * 本文件只交付防抖原语；写回调度由上层组装。
 *
 * 语义：
 * - `call`：重置定时器并缓存参数，停顿 waitMs 后仅执行一次 fn（携带最后一次参数）；
 * - `cancel`：取消未执行的定时器（防抖期间不触发）；
 * - `flush`：立即执行待处理调用并清除定时器（onDragEnd 强制写回兜底）；
 * - 已 flush / 执行后再次 `call` 重新开始计时（新周期）。
 *
 * 泛型 `Args`：fn 的参数类型被透传到 `call`（类型化方法可直接传入，
 * 例如 `createDebounce(block.updateBlock.bind(block), 500)`），
 * 无需将具体签名收窄为 `unknown[]` 再断言。
 */
export function createDebounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number
): {
  call: (...args: Args) => void;
  cancel: () => void;
  flush: () => void;
  getPending: () => boolean;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 最近一次 call 的参数；仅当存在未执行定时器时才有意义（flush 兜底用）。
  let lastArgs: Args | undefined;

  const invoke = (args: Args): void => {
    timer = undefined;
    fn(...args);
  };

  return {
    call(...args: Args): void {
      lastArgs = args;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      // 只有最后一次 call 的定时器能存活；其闭包参数即"最后一次调用的参数"。
      timer = setTimeout(() => invoke(args), waitMs);
    },

    cancel(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },

    flush(): void {
      if (timer !== undefined && lastArgs !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        invoke(lastArgs);
      }
    },

    getPending(): boolean {
      return timer !== undefined;
    },
  };
}
