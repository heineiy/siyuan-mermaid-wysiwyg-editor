import { describe, expect, it } from "vitest";
import { stripFence, stripKramdownIal, wrapFence } from "./fence";

/**
 * 围栏剥离/包回工具测试（REQ-READ-001 / design.md 数据约束）。
 *
 * 约定语义（与 fence.ts 文档一致）：
 * - code 的规范形态为「围栏之间、无结构性尾随换行」的文本；围栏换行是结构性的。
 * - 剥离只去首行 ```mermaid 与结尾 ```；内容区（含前导/尾随空行）原样保留，CRLF 规整为 LF。
 * - 非 mermaid 围栏 / 缺失结尾围栏 / 非围栏输入：调用方违反不变量，抛错（fail-fast）。
 */
describe("stripFence: 正常 mermaid 代码块", () => {
  it("剥离首行与结尾围栏，输出纯文本（REQ-READ-001 正常场景）", () => {
    const markdown = "```mermaid\nflowchart LR\n  A-->B\n```";
    expect(stripFence(markdown)).toBe("flowchart LR\n  A-->B");
  });

  it("围栏内多行内容", () => {
    const markdown = "```mermaid\nflowchart LR\n  A-->B\n  B-->C\n```";
    expect(stripFence(markdown)).toBe("flowchart LR\n  A-->B\n  B-->C");
  });

  it("结尾无换行输入（结尾围栏即最后一行）", () => {
    const markdown = "```mermaid\nflowchart LR\n```";
    expect(stripFence(markdown)).toBe("flowchart LR");
  });
});

describe("stripFence: 前导/尾随空行语义保留（REQ-READ-001 场景 2）", () => {
  it("前导空行保留", () => {
    expect(stripFence("```mermaid\n\nflowchart LR\n```")).toBe(
      "\nflowchart LR"
    );
  });

  it("尾随空行保留", () => {
    expect(stripFence("```mermaid\nflowchart LR\n\n```")).toBe(
      "flowchart LR\n"
    );
  });

  it("前导与尾随空行同时保留", () => {
    expect(stripFence("```mermaid\n\nflowchart LR\n\n```")).toBe(
      "\nflowchart LR\n"
    );
  });
});

describe("stripFence: CRLF 行尾", () => {
  it("CRLF 输入归一化为 LF 并剥离围栏", () => {
    expect(stripFence("```mermaid\r\nflowchart LR\r\n  A-->B\r\n```")).toBe(
      "flowchart LR\n  A-->B"
    );
  });

  it("CRLF 下的空行语义保留", () => {
    expect(stripFence("```mermaid\r\n\r\nflowchart LR\r\n\r\n```")).toBe(
      "\nflowchart LR\n"
    );
  });
});

describe("stripFence: 边界输入", () => {
  it("只有围栏没有内容 → 空字符串", () => {
    expect(stripFence("```mermaid\n```")).toBe("");
  });

  it("内容以 ``` 结尾（Mermaid 内含代码块引用）→ 以最末 ``` 为结尾围栏（文档化限制）", () => {
    expect(stripFence("```mermaid\nflowchart LR\n```\n```")).toBe(
      "flowchart LR\n```"
    );
  });

  it("非 mermaid 围栏 → 抛出", () => {
    expect(() => stripFence("```js\nconst a = 1;\n```")).toThrow();
  });

  it("非围栏纯文本 → 抛出", () => {
    expect(() => stripFence("plain text")).toThrow();
  });

  it("空输入 → 抛出", () => {
    expect(() => stripFence("")).toThrow();
  });

  it("缺失结尾围栏 → 抛出", () => {
    expect(() => stripFence("```mermaid\nflowchart LR")).toThrow();
  });

  it("结尾围栏不在独立一行 → 抛出", () => {
    expect(() => stripFence("```mermaid\nflowchart LR```")).toThrow();
  });

  it("结尾围栏后存在多余内容 → 抛出（结尾围栏必须是最后一行）", () => {
    expect(() => stripFence("```mermaid\nflowchart LR\n```\n")).toThrow();
  });
});

describe("wrapFence: 围栏包回", () => {
  it("标准包回 ```mermaid\\n${code}\\n```", () => {
    expect(wrapFence("flowchart LR\n  A-->B")).toBe(
      "```mermaid\nflowchart LR\n  A-->B\n```"
    );
  });

  it("空内容包回", () => {
    expect(wrapFence("")).toBe("```mermaid\n\n```");
  });

  it("code 以换行结尾 → 移除恰好一个行终止符，不产生多余空行", () => {
    expect(wrapFence("flowchart LR\n")).toBe("```mermaid\nflowchart LR\n```");
  });

  it("code 以 CRLF 结尾 → 移除行终止符", () => {
    expect(wrapFence("flowchart LR\r\n")).toBe("```mermaid\nflowchart LR\n```");
  });

  it("code 含真实尾随空行（≥2 换行）→ 空行保留", () => {
    expect(wrapFence("flowchart LR\n\n")).toBe("```mermaid\nflowchart LR\n\n```");
  });
});

describe("wrapFence 往返（约定语义：code 规范形态无尾随行终止符）", () => {
  it.each([
    ["flowchart LR\n  A-->B"],
    ["flowchart LR"],
    [""],
    ["\n\nflowchart LR"],
    ["  A-->B\n\n\nflowchart LR"],
  ])("stripFence(wrapFence(%j)) === %j", (code) => {
    expect(stripFence(wrapFence(code))).toBe(code);
  });
});

describe("wrapFence 往返：尾随行终止符的规范化（文档化规则）", () => {
  it("code 以单个换行结尾 → 视为结构性换行，往返归一为无尾随换行", () => {
    expect(stripFence(wrapFence("flowchart LR\n"))).toBe("flowchart LR");
  });

  it("code 含真实尾随空行（≥2 换行）→ 往返后空行语义保留（恰好一个终止符被规范化）", () => {
    expect(stripFence(wrapFence("flowchart LR\n\n"))).toBe("flowchart LR\n");
  });
});

describe("stripKramdownIal（思源 getBlockKramdown 尾部 IAL 剥离）", () => {
  it("剥离代码块后的块级 IAL 行（3.8.3 实测形态）", () => {
    const kramdown =
      '```mermaid\nflowchart LR\n  A[开始] --> B{判断}\n```\n{: id="20260916172156-y2qif38" updated="20260916172156"}';
    expect(stripKramdownIal(kramdown)).toBe(
      "```mermaid\nflowchart LR\n  A[开始] --> B{判断}\n```",
    );
  });

  it("无 IAL → 原样返回", () => {
    const md = "```mermaid\nflowchart LR\n  A-->B\n```";
    expect(stripKramdownIal(md)).toBe(md);
  });

  it("正文含 Mermaid 判断节点 {判断}（非 IAL 形态）→ 不误删", () => {
    const md = "```mermaid\nflowchart LR\n  A --> B{x}\n```";
    expect(stripKramdownIal(md)).toBe(md);
  });

  it("剥离 IAL 后可直接 stripFence（联调链路闭环）", () => {
    const kramdown =
      '```mermaid\nflowchart LR\n  A[开始] --> B{判断}\n```\n{: id="x" updated="y"}';
    expect(stripFence(stripKramdownIal(kramdown))).toBe("flowchart LR\n  A[开始] --> B{判断}");
  });
});
