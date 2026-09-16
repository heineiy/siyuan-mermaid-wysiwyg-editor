/**
 * 双向同步协调器（REQ-READ-001 / REQ-WRITE-001 / REQ-DEBOUNCE-001 / design.md D3/D4）。
 *
 * 本文件是插件「正向读取 + 反向写回」的闭环核心（T11）：
 *
 * 正向流（REQ-READ-001）：blockId → 注入的 getBlockMarkdown → stripFence 剥离围栏
 * → route(code, registry) 三路路由：
 * - full：注册表 full 适配器 init 可编辑画布（backend 由适配器缺省工厂提供）；
 *   会话的 onGraphChange 接防抖写回通道。
 * - readonly：已注册 readonly 适配器（无则 new ReadOnlyAdapter）只读渲染，
 *   不建立写回通道（不调用 updateBlock）。
 * - unknown：兜底 ReadOnlyAdapter 只读渲染 + 把提示 message 渲染进画布容器，
 *   不建立写回通道。
 *
 * 反向流（REQ-WRITE-001 / REQ-DEBOUNCE-001）：onGraphChange(newCode) 绝不在回调内
 * 同步写回——拖拽等高帧变更经 createDebounce(fn, 500) 聚合，停顿 500ms 后写回一次；
 * 文字修改 onBlur / 关闭 Dialog 经 flushWrite() 立即写回一次。写回组装严格
 * wrapFence(newCode)：```mermaid\n${newCode}\n``` → updateBlock(blockId, fenced)。
 *
 * 写回串行化：防抖天然聚合 + flush 与定时器互斥（createDebounce 保证），同一会话
 * 的并发写回不会叠加，无需额外锁。竞态锁 isSyncing + 版本号比对属 T12 职责，
 * 本文件只把写回函数（writeFenced）与防抖实例内聚成 seam（T12 可直接包装）。
 *
 * 错误处理（REQ-ERROR-001，T13）：backend init / adapter init 抛错或拒绝（如
 * VisimerLoadError）不抛未捕获异常，错误 message 渲染进画布容器（简单错误 div，
 * 完整 UI 样式非本期重点），且**不建立写回通道**（init 失败后 onGraphChange /
 * flushWrite 均不可达，updateBlock 零调用——保留原文本）；会话仍可 destroy 清理。
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

/** initEditorSession 注入项（真实实现由 src/index.ts 接 window.siYuan 内核 API）。 */
export interface InitEditorSessionOptions {
  /** 目标代码块 id（读写均以此定位）。 */
  blockId: string;
  /** 画布挂载容器（由 Dialog 提供，T8）。 */
  container: HTMLElement;
  /** 适配器注册表（onload 组装：FlowChartAdapter + ReadOnlyAdapter）。 */
  registry: AdapterRegistry;
  /** 读取块 Markdown（真实实现：window.siYuan.api.block.getBlockMarkdown）。 */
  getBlockMarkdown: (blockId: string) => Promise<string> | string;
  /** 写回块源码（真实实现：window.siYuan.api.block.updateBlock）。 */
  updateBlock: (blockId: string, fencedMarkdown: string) => Promise<void> | void;
  /** 反向流防抖窗口（REQ-DEBOUNCE-001：至多 debounceMs 内写回一次；缺省 500）。 */
  debounceMs?: number;
}

/** 编辑会话句柄：调用方（Dialog onDestroy / onBlur）驱动写回与销毁。 */
export interface EditorSession {
  /** 立即写回未决变更一次（onBlur / 关闭 Dialog 场景；无未决时零副作用）。 */
  flushWrite(): void;
  /** 销毁会话：flush 未决写回 + adapter.destroy + cancel 防抖；幂等。 */
  destroy(): void;
}

/** 缺省防抖窗口（REQ-DEBOUNCE-001：500ms）。 */
const DEFAULT_DEBOUNCE_MS = 500;

/** 错误提示 div 的 class（T13 将完善为正式错误 UI）。 */
const ERROR_DIV_CLASS = "mermaid-wysiwyg-error";
/** unknown 类型提示 div 的 class。 */
const HINT_DIV_CLASS = "mermaid-wysiwyg-hint";

/** readonly/unknown 会话的 noop onGraphChange：只读路径禁止任何编辑回调。 */
const noopOnGraphChange = (_newCode: string): void => {};

/** 把 message 渲染进画布容器（简单 div；T13 将完善为正式 UI）。 */
function renderMessage(container: HTMLElement, text: string, className: string): void {
  const div = document.createElement("div");
  div.className = className;
  div.textContent = text;
  container.appendChild(div);
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * 初始化编辑会话（正向流）并装配反向流写回通道。
 * @throws 仅当 getBlockMarkdown 失败或输入非 mermaid 围栏块（stripFence fail-fast，
 *   T2 契约）；调用方（index.ts）负责兜底展示。
 */
export async function initEditorSession(opts: InitEditorSessionOptions): Promise<EditorSession> {
  const { blockId, container, registry, updateBlock } = opts;
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  // ---- 正向流（REQ-READ-001）：读块源码 → 剥离围栏 → 能力路由 ----
  const markdown = await opts.getBlockMarkdown(blockId);
  const code = stripFence(markdown);
  const result = route(code, registry);

  // 会话级销毁标志：destroy 后 onGraphChange / flushWrite 一律失效（幂等 + 防泄漏）。
  let destroyed = false;

  switch (result.kind) {
    case "full": {
      const adapter = result.adapter;

      // ---- 反向流（REQ-WRITE-001 / REQ-DEBOUNCE-001 / REQ-RACE-001）：防抖写回通道 ----
      // 竞态防护（T12 / D4）：isSyncing 写回锁 + 编辑版本号比对，防止
      // "读回旧文本覆盖新编辑"——旧回调被新编辑取代时绝不写入。
      // 每次 onGraphChange 递增：新编辑意味着旧回调已过期。
      let editVersion = 0;
      // updateBlock 进行中置 true：锁内到达的写回不并发执行（思源内核并发写同块
      // 不保证顺序），记 pendingCode 由当前写回完成后补写。
      let isSyncing = false;
      // 锁内到达的最新代码：写回完成后立即补写（绝不丢弃最后一次编辑）。
      let pendingCode: string | null = null;
      // T13（REQ-ERROR-001）：init 失败后关闭写回通道——适配器残留的 onGraphChange
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
          // 版本号比对（REQ-RACE-001）：写回期间若有新编辑（editVersion > v），
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
          // 成功/拒绝两条路径（REQ-ERROR-001：拒绝侧只释放锁 + 补写 pending，
          // 不把错误扩散为未捕获异常）。
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

      // backend / adapter init 抛错或拒绝（如 VisimerLoadError）：REQ-ERROR-001
      // 错误保护——不抛未捕获异常，错误 message 渲染进画布容器（一个简单错误 div；
      // 完整 UI 样式非本期重点），**不建立写回通道**（updateBlock 零调用，保留
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
          // onBlur / 关闭场景：立即写回未决变更一次（REQ-WRITE-001 场景 2）。
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
      // 已注册 readonly 适配器优先；无则 new ReadOnlyAdapter 兜底只读渲染。
      // T13（REQ-ERROR-001）：兜底适配器注入 onError——渲染/解析失败（含语法
      // 错误）时把可读错误提示渲染进画布容器，不写回坏数据（updateBlock 零调用）。
      const adapter =
        result.adapter ??
        new ReadOnlyAdapter({
          onError: (err) =>
            renderMessage(container, `只读预览渲染失败：${errorText(err)}`, ERROR_DIV_CLASS),
        });
      try {
        await Promise.resolve(adapter.init(code, { container, onGraphChange: noopOnGraphChange }));
      } catch (err) {
        renderMessage(container, `只读预览加载失败：${errorText(err)}`, ERROR_DIV_CLASS);
      }

      return {
        // 只读会话无写回通道：flush 零副作用（不调用 updateBlock）。
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

    case "unknown": {
      // 兜底只读渲染 + 提示文案（REQ-DEGRADE-001：未知类型暂不支持可视化编辑）。
      const fallback = new ReadOnlyAdapter();
      try {
        await Promise.resolve(
          fallback.init(code, { container, onGraphChange: noopOnGraphChange })
        );
      } catch {
        // 兜底渲染自身经 onError 吞错（T7 契约）；此处双保险，不抛未捕获异常。
      }
      // 提示文案渲染进画布容器：在只读渲染完成后追加，避免被渲染产物 innerHTML 覆盖。
      renderMessage(container, result.message, HINT_DIV_CLASS);

      return {
        // unknown 会话无写回通道：flush 零副作用（不调用 updateBlock）。
        flushWrite(): void {},
        destroy(): void {
          if (destroyed) {
            return;
          }
          destroyed = true;
          fallback.destroy();
        },
      };
    }
  }
}
