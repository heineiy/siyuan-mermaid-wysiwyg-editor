/**
 * 围栏剥离 / 包回工具：`` ```mermaid `` 代码块 ↔ 纯 Mermaid 文本。
 *
 * 数据约束（REQ-READ-001 / design.md）：
 * - 插件经 `block.getBlockMarkdown({id})` 拿到形如 `` ```mermaid\ncode\n``` `` 的源码；
 *   必须剥离首行围栏（`` ```mermaid ``）与结尾围栏（`` ``` ``）得到纯文本。
 * - 写回时严格组装回围栏：`` ```mermaid\n${newCode}\n``` ``。
 *
 * 约定语义：
 * - code 的规范形态为「围栏之间、无结构性尾随换行」的文本；围栏换行是结构性的。
 * - 剥离只去首行围栏与结尾围栏；内容区（含前导/尾随空行）原样保留，仅将 CRLF 规整为 LF
 *   （思源存储恒为 LF，CRLF 仅为防御输入）。
 * - wrapFence 移除「恰好一个」尾随行终止符（\n 或 \r\n），避免 code 以换行结尾时产生多余空行；
 *   真实的尾随空行（≥2 个换行）仍被保留，符合「尾随空行语义保留」。
 * - 非 mermaid 围栏 / 缺失结尾围栏 / 非围栏输入：视为调用方违反不变量，抛错（fail-fast），
 *   避免把非 mermaid 内容静默送入渲染器或在写回方向破坏原生存储（REQ-STORAGE-001）。
 *
 * 已知限制（本期接受，文档化）：
 * - 结尾围栏必须是输入的最后一行（`` ```mermaid\ncode\n``` `` 结尾无换行；末尾多余换行会抛错）。
 * - 首行围栏必须精确为 `` ```mermaid ``（不处理缩进围栏 / 语言后缀）。
 * - 内容以 `` ``` `` 结尾（Mermaid 内含代码块引用）存在歧义：以「最末 ```」为结尾围栏，
 *   内容中同处一行的 `` ``` `` 会被保留（见测试）。
 */

const OPEN_FENCE = "```mermaid";
const CLOSE_FENCE = "```";

/** 行尾归一化：CRLF → LF（只处理 CRLF；孤立的 CR 不做处理，会因首行不匹配而抛错）。 */
const normalizeEol = (s: string): string => s.replace(/\r\n/g, "\n");

/**
 * 剥离 mermaid 代码块的围栏，返回围栏之间的纯文本。
 * @throws 输入不是「以 ```mermaid 开头、以 ``` 结尾」的代码块时抛出 Error。
 */
export function stripFence(markdown: string): string {
  const text = normalizeEol(markdown);
  const firstNl = text.indexOf("\n");
  if (firstNl === -1 || text.slice(0, firstNl) !== OPEN_FENCE) {
    throw new Error("stripFence: 输入不是 mermaid 围栏代码块（首行必须为 ```mermaid）");
  }

  // 首行围栏之后的内容（含结尾围栏）。
  const rest = text.slice(firstNl + 1);
  if (rest === CLOSE_FENCE) {
    return ""; // 只有围栏没有内容
  }
  if (!rest.endsWith("\n" + CLOSE_FENCE)) {
    throw new Error("stripFence: 缺少以最后一行 ``` 结尾的围栏");
  }

  // 去除结尾围栏及其前一个结构性换行；内容区（含前导/尾随空行）原样返回。
  return rest.slice(0, rest.length - (1 + CLOSE_FENCE.length));
}

/**
 * 将纯 Mermaid 文本包回 mermaid 代码块：`` ```mermaid\n${code}\n``` ``。
 * code 以换行结尾时移除恰好一个行终止符，避免围栏前产生多余空行；
 * 真实尾随空行（≥2 个换行）保留。
 */
export function wrapFence(code: string): string {
  const trimmed = code.replace(/\r?\n$/, "");
  return `${OPEN_FENCE}\n${trimmed}\n${CLOSE_FENCE}`;
}

/**
 * 剥离 kramdown 尾部的块级 IAL（{: id="..." updated="..."}）。
 *
 * 思源内核 API `/api/block/getBlockKramdown` 返回的 kramdown 在代码块围栏后
 * 携带块属性 IAL 行（实测 3.8.3：`` ...\n```\n{: id="..." updated="..."} ``）；
 * stripFence 要求输入以结尾围栏收束，故先剥离 IAL 再喂入。
 *
 * 仅当最后一行（trim 后）以 "{:" 开头且以 "}" 结尾时剥离，防止误删正文中
 * 形如 {...} 的内容（如 Mermaid 判断节点 `B{判断}` 不满足该形态）。
 */
export function stripKramdownIal(kramdown: string): string {
  const text = kramdown.replace(/\r\n/g, "\n");
  const lastNl = text.lastIndexOf("\n");
  const lastLine = (lastNl === -1 ? text : text.slice(lastNl + 1)).trim();
  if (text.endsWith("}") && lastLine.startsWith("{:")) {
    return lastNl === -1 ? "" : text.slice(0, lastNl);
  }
  return kramdown;
}
