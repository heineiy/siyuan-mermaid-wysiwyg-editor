/**
 * 双向同步协调器。
 *
 * 本文件是插件「正向读取 + 反向写回」的闭环核心：
 *
 * 正向流：blockId → 注入的 getBlockMarkdown → stripFence 剥离围栏
 * → route(code, registry) 三路路由：
 * - full：注册表 full 适配器 init 可编辑画布（backend 由适配器缺省工厂提供）；
 *   会话的 onGraphChange 接防抖写回通道。
 * - readonly：已注册 readonly 适配器（无则 new ReadOnlyAdapter）只读渲染，
 *   不建立写回通道（不调用 updateBlock）。
 * - unknown：兜底 ReadOnlyAdapter 只读渲染 + 把提示 message 渲染进画布容器，
 *   不建立写回通道。
 *
 * 反向流：onGraphChange(newCode) 绝不在回调内同步写回——拖拽等高帧变更经
 * createDebounce(fn, 500) 聚合，停顿 500ms 后写回一次；
 * 文字修改 onBlur / 关闭 Dialog 经 flushWrite() 立即写回一次。写回组装严格
 * wrapFence(newCode)：```mermaid\n${newCode}\n``` → updateBlock(blockId, fenced)。
 *
 * 写回串行化：防抖天然聚合 + flush 与定时器互斥（createDebounce 保证），同一会话
 * 的并发写回不会叠加，无需额外锁。竞态锁 isSyncing + 版本号比对在本文件内聚成 seam，
 * 供包装者直接注入。
 *
 * 错误处理：backend init / adapter init 抛错或拒绝（如 VisimerLoadError）不抛
 * 未捕获异常，错误 message 渲染进画布容器（简单错误 div），且**不建立写回通道**
 * （init 失败后 onGraphChange / flushWrite 均不可达，updateBlock 零调用——保留原文本）；
 * 会话仍可 destroy 清理。
 * 只读路径：兜底 ReadOnlyAdapter 注入 onError，渲染/解析失败（含语法错误）时把
 * 可读错误提示渲染进画布容器，不写回坏数据。
 *
 * 会话生命周期：destroy() = flush 未决写回 + adapter.destroy + cancel 防抖，幂等；
 * destroy 后 onGraphChange / flushWrite 不再触发写回。
 */

import { createDebounce } from "./debounce";
import { stripFence, wrapFence } from "../utils/fence";
import { route } from "../adapters/router";
import { ReadOnlyAdapter } from "../adapters/readonly-adapter";
import type { AdapterRegistry } from "../adapters/registry";

/** initEditorSession 注入项（真实实现由 src/index.ts 接 window.siyuan 内核 API）。 */
export interface InitEditorSessionOptions {
  /** 目标代码块 id（读写均以此定位）。 */
  blockId: string;
  /** 画布挂载容器（由 Dialog 提供）。 */
  container: HTMLElement;
  /** 适配器注册表（onload 组装：VisimerFullAdapter × 22 + ReadOnlyAdapter 通配）。 */
  registry: AdapterRegistry;
  /** 读取块 Markdown（真实实现：window.siyuan.api.block.getBlockMarkdown）。 */
  getBlockMarkdown: (blockId: string) => Promise<string> | string;
  /** 写回块源码（真实实现：window.siyuan.api.block.updateBlock）。 */
  updateBlock: (blockId: string, fencedMarkdown: string) => Promise<void> | void;
  /** 反向流防抖窗口（至多 debounceMs 内写回一次；缺省 500）。 */
  debounceMs?: number;
}

/** 编辑会话句柄：调用方（Dialog onDestroy / onBlur）驱动写回与销毁。 */
export interface EditorSession {
  /** 立即写回未决变更一次（onBlur / 关闭 Dialog 场景；无未决时零副作用）。 */
  flushWrite(): void;
  /** 销毁会话：flush 未决写回 + adapter.destroy + cancel 防抖；幂等。 */
  destroy(): void;
}

/** 缺省防抖窗口（500ms）。 */
const DEFAULT_DEBOUNCE_MS = 500;

/** 错误提示 div 的 class（简单 UI 容器）。 */
const ERROR_DIV_CLASS = "mermaid-wysiwyg-error";
/** unknown 类型提示 div 的 class。 */
const HINT_DIV_CLASS = "mermaid-wysiwyg-hint";

/** readonly/unknown 会话的 noop onGraphChange：只读路径禁止任何编辑回调。 */
const noopOnGraphChange = (_newCode: string): void => {};

/** 把 message 渲染进画布容器（简单 div）。 */
function renderMessage(container: HTMLElement, text: string, className: string): void {
  const div = document.createElement("div");
  div.className = className;
  div.textContent = text;
  container.appendChild(div);
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * 初始化编辑会话（正向流）并装配反向流写回通道。
 * @throws 仅当 getBlockMarkdown 失败或输入非 mermaid 围栏块（stripFence fail-fast）；
 *   调用方（index.ts）负责兜底展示。
 */
export async function initEditorSession(opts: InitEditorSessionOptions): Promise<EditorSession> {
  const { blockId, container, registry, updateBlock } = opts;
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  // ---- 正向流：读块源码 → 剥离围栏 → 能力路由 ----
  const markdown = await opts.getBlockMarkdown(blockId);
  const code = stripFence(markdown);
  const result = route(code, registry);

  // 会话级销毁标志：destroy 后 onGraphChange / flushWrite 一律失效（幂等 + 防泄漏）。
  let destroyed = false;

  switch (result.kind) {
    case "full": {
      const adapter = result.adapter;

      // ---- 反向流：防抖写回通道 ----
      // 竞态防护：isSyncing 写回锁 + 编辑版本号比对，防止
      // "读回旧文本覆盖新编辑"——旧回调被新编辑取代时绝不写入。
      // 每次 onGraphChange 递增：新编辑意味着旧回调已过期。
      let editVersion = 0;
      // updateBlock 进行中置 true：锁内到达的写回不并发执行（思源内核并发写同块
      // 不保证顺序），记 pendingCode 由当前写回完成后补写。
      let isSyncing = false;
      // 锁内到达的最新代码：写回完成后立即补写（绝不丢弃最后一次编辑）。
      let pendingCode: string | null = null;
      // init 失败后关闭写回通道——适配器残留的 onGraphChange
      // 回调不可达、flushWrite 无副作用，updateBlock 保持零调用（保留原文本）。
      let writeClosed = false;

      const writeFenced = (newCode: string): void => {
        if (isSyncing) {
          // 锁内到达的写回：不并发执行第二个 updateBlock，记 pending 由当前写回
          // 完成后补写（pendingCode 只存最新到达者，防抖已保证其为最新内容）。
          pendingCode = newCode;
          return;
        }
        // 版本快照 v：本次写回触发时的编辑版本号。
        const versionAtTrigger = editVersion;
        isSyncing = true;
        const fenced = wrapFence(newCode);
        const complete = (): void => {
          isSyncing = false;
          // 版本号比对：写回期间若有新编辑（editVersion > v），
          // 旧结果不得"收尾"——只允许补写锁内到达的最新版本（pendingCode），
          // 否则留给下一次防抖/flush 周期；绝不把旧版本当最终态覆盖新编辑。
          if (editVersion > versionAtTrigger && pendingCode !== null) {
            const latest = pendingCode;
            pendingCode = null;
            writeFenced(latest);
          }
        };
        try {
          // Promise.resolve 吸收同步返回与异步 Promise 两种形态；then 双参统一
          // 成功/拒绝两条路径（拒绝侧只释放锁 + 补写 pending，不把错误扩散为未捕获异常）。
          void Promise.resolve(updateBlock(blockId, fenced)).then(complete, complete);
        } catch {
          complete(); // 同步抛错兜底：释放锁，不卡死会话（不扩散未捕获异常）。
        }
      };
      const writeDebounce = createDebounce(writeFenced, debounceMs);
      const onGraphChange = (newCode: string): void => {
        if (destroyed || writeClosed) {
          return; // 会话已销毁 / init 失败关闭写回通道：不再聚合新的写回
        }
        editVersion += 1; // 每次编辑递增版本号：后续写回完成时据此识别"期间有新编辑"
        writeDebounce.call(newCode);
      };

      // backend / adapter init 抛错或拒绝（如 VisimerLoadError）：错误保护——
      // 不抛未捕获异常，错误 message 渲染进画布容器（一个简单错误 div），
      // **不建立写回通道**（updateBlock 零调用，保留
      // 原文本），会话仍可 destroy 清理（adapter.destroy 幂等）。
      try {
        // Promise.resolve 吸收同步抛错与拒绝的 Promise 两种形态。
        await Promise.resolve(adapter.init(code, { container, onGraphChange }));
      } catch (err) {
        renderMessage(container, `可视化编辑器加载失败：${errorText(err)}`, ERROR_DIV_CLASS);
        writeClosed = true;
        // 清掉 init 期间可能已聚合的变更（防御性：写回通道自此关闭）。
        writeDebounce.cancel();
        return {
          // 失败会话无写回通道：flush 零副作用（不调用 updateBlock）。
          flushWrite(): void {},
          destroy(): void {
            if (destroyed) {
              return;
            }
            destroyed = true;
            adapter.destroy();
          },
        };
      }

      return {
        flushWrite(): void {
          if (destroyed) {
            return;
          }
          // onBlur / 关闭场景：立即写回未决变更一次。
          writeDebounce.flush();
        },
        destroy(): void {
          if (destroyed) {
            return;
          }
          destroyed = true;
          // 关闭 Dialog：先 flush 未决写回（立即写回一次），再销毁画布，最后清理防抖定时器。
          writeDebounce.flush();
          adapter.destroy();
          writeDebounce.cancel();
        },
      };
    }

    case "readonly": {
      // 可编辑降级：ReadonlyAdapter 内部建 textarea + preview-split，用户修代码成功后
      // 自动回调 onGraphChange 写回思源。这里必须给真实的 debounce 写回通道。
      const adapter =
        result.adapter ??
        new ReadOnlyAdapter({
          // ReadOnlyAdapter 内部已通过 showError() 渲染错误 UI（preview-slot 红框 + 状态指示器），
          // 但仍保留 onError 给宿主做日志/埋点/未来扩展。不调 renderMessage 避免重复提示。
          onError: (err) => {
            console.debug("[mermaid-editor] readonly render failed:", err);
          },
        });
      // 复用 full 分支的 debounce + 竞态防护模式（写回锁 + 版本号 + pendingCode）
      let editVersion = 0;
      let isSyncing = false;
      let pendingCode: string | null = null;

      const writeFenced = (newCode: string): void => {
        if (isSyncing) {
          pendingCode = newCode;
          return;
        }
        const versionAtTrigger = editVersion;
        isSyncing = true;
        const fenced = wrapFence(newCode);
        const complete = (): void => {
          isSyncing = false;
          if (editVersion > versionAtTrigger && pendingCode !== null) {
            const latest = pendingCode;
            pendingCode = null;
            writeFenced(latest);
          }
        };
        void Promise.resolve(updateBlock(blockId, fenced)).then(complete, complete);
      };
      const writeDebounce = createDebounce(writeFenced, debounceMs);
      const onGraphChange = (newCode: string): void => {
        if (destroyed) {
          return;
        }
        editVersion += 1;
        writeDebounce.call(newCode);
      };

      try {
        await Promise.resolve(adapter.init(code, { container, onGraphChange }));
      } catch (err) {
        renderMessage(container, `只读预览加载失败：${errorText(err)}`, ERROR_DIV_CLASS);
      }

      return {
        flushWrite(): void {
          if (destroyed) {
            return;
          }
          writeDebounce.flush();
        },
        destroy(): void {
          if (destroyed) {
            return;
          }
          destroyed = true;
          writeDebounce.cancel();
          adapter.destroy();
        },
      };
    }

    case "unknown": {
      // 未知图类型 → ReadOnlyAdapter 可编辑降级（textarea + preview），用户能在
      // textarea 里改成合法类型后自动写回。和 readonly 分支共用同一套 debounce
      // + 竞态防护模式。
      const fallback = new ReadOnlyAdapter();
      let editVersion = 0;
      let isSyncing = false;
      let pendingCode: string | null = null;

      const writeFenced = (newCode: string): void => {
        if (isSyncing) {
          pendingCode = newCode;
          return;
        }
        const versionAtTrigger = editVersion;
        isSyncing = true;
        const fenced = wrapFence(newCode);
        const complete = (): void => {
          isSyncing = false;
          if (editVersion > versionAtTrigger && pendingCode !== null) {
            const latest = pendingCode;
            pendingCode = null;
            writeFenced(latest);
          }
        };
        void Promise.resolve(updateBlock(blockId, fenced)).then(complete, complete);
      };
      const writeDebounce = createDebounce(writeFenced, debounceMs);
      const onGraphChange = (newCode: string): void => {
        if (destroyed) {
          return;
        }
        editVersion += 1;
        writeDebounce.call(newCode);
      };

      try {
        await Promise.resolve(fallback.init(code, { container, onGraphChange }));
      } catch {
        // 兜底渲染自身经 onError 吞错；此处双保险，不抛未捕获异常。
      }

      return {
        flushWrite(): void {
          if (destroyed) {
            return;
          }
          writeDebounce.flush();
        },
        destroy(): void {
          if (destroyed) {
            return;
          }
          destroyed = true;
          writeDebounce.cancel();
          fallback.destroy();
        },
      };
    }
  }
}
