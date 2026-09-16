# T2 任务报告：围栏剥离工具（fence.ts）

- **任务**：T2（tasks.md）— 围栏剥离工具（fence.ts）
- **状态**：DONE
- **执行时间**：2026-09-16
- **工作目录**：`/Users/wangj/work/myapp/siyuan-mermaid-wysiwyg-editor-siyuan-mermaid-wysiwyg-editor`（git worktree，分支 `siyuan-mermaid-wysiwyg-editor`）
- **Commit base**：`05a0cbd`（feat: 防抖调度器 debounce.ts（TDD）—— 并行子代理 T3 先落地）
- **Commit head**：`5b41f7e`（feat: 围栏剥离工具 fence.ts（TDD））

## 一、实现内容

| 文件 | 说明 |
| --- | --- |
| `src/utils/fence.ts` | 新增。纯函数工具：`stripFence(markdown)` 剥离 `` ```mermaid `` 首行围栏与结尾 `` ``` `` 得到纯文本；`wrapFence(code)` 按 `` ```mermaid\n${code}\n``` `` 组装回围栏。仅依赖字符串运算，零外部依赖。 |
| `src/utils/fence.test.ts` | 新增。vitest 单测 28 条，覆盖正常剥离、前导/尾随空行语义、CRLF、结尾无换行、空输入、只有围栏无内容、围栏内多行、内容以 `` ``` `` 结尾歧义、非 mermaid/非围栏输入抛错、wrapFence 往返、尾随行终止符规范化。 |

## 二、约定语义（决策与依据）

1. **剥离只去首行与结尾围栏**：`stripFence` 仅移除首行 `` ```mermaid `` 与其后的结构换行、结尾围栏 `` ``` `` 与其前的结构换行；内容区（含前导/尾随空行）原样返回。
2. **CRLF 规整为 LF**：输入先 `\r\n → \n` 归一化再剥离。依据：思源 `getBlockMarkdown` 恒为 LF（ProseMirror 存储），CRLF 仅为防御输入；归一化保证输出确定。孤立 `\r` 不做处理（会导致首行不匹配而抛错，属文档化限制）。
3. **非 mermaid / 非围栏输入 → 抛 Error（fail-fast）**：任务要求"选择更安全的语义"。调用方（T11 同步层）仅在已确认 mermaid 代码块后才调用 stripFence，非 mermaid 输入即不变量被违反；抛错比"原样返回"更能避免把非 mermaid 内容静默送入渲染器、或在写回方向破坏原生存储（REQ-STORAGE-001）。空输入、缺失结尾围栏、结尾围栏不在独立一行、结尾围栏后有多余内容均抛错。
4. **wrapFence 尾随换行规则**：移除**恰好一个**尾随行终止符（`\n` 或 `\r\n`）。围栏换行是结构性的，code 以换行结尾时不产生多余空行；真实尾随空行（≥2 个换行）保留空行语义。
5. **往返不变量（约定语义）**：对规范形态 code（无尾随行终止符），`stripFence(wrapFence(code)) === code` 精确成立；code 以单个终止符结尾时往返归一为无尾随换行（语义等价）；含真实尾随空行时往返保留空行（恰好一个终止符被规范化）。
6. **已知限制（文档化）**：① 结尾围栏必须是输入最后一行（`` ```mermaid\ncode\n``` `` 之后的多余换行会抛错）——规格示例即此形态，若 T11 实测 getBlockMarkdown 返回尾随换行需在此放宽；② 首行围栏必须精确为 `` ```mermaid ``（不处理缩进围栏/语言后缀）；③ 内容以 `` ``` `` 结尾（Mermaid 内含代码块引用）存在歧义，本期以"最末 `` ``` `` 为结尾围栏"固定行为（测试已钉死）。

## 三、TDD 证据

**RED**（先写测试，实现缺失时运行）：

```
$ npm test -- fence
 RUN  v5.0.1
 ❯ src/utils/fence.test.ts (0 test)
 FAIL  src/utils/fence.test.ts
Error: Cannot find module './fence' imported from .../src/utils/fence.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

**GREEN**（实现后运行）：

```
$ npm test -- fence
 RUN  v5.0.1
 ✓ src/utils/fence.test.ts (28 tests) 11ms
 Test Files  1 passed (1)
      Tests  28 passed (28)

$ npx tsc --noEmit   # 退出码 0，类型干净

$ npm test           # 全量套件（含并行子代理的 T3/T4 测试）
 Test Files  4 passed (4)
      Tests  47 passed (47)
```

**TDD 过程说明**：首轮 GREEN 尝试中往返用例 2 条失败（RED→GREEN 迭代的一部分）——失败原因是测试数据用了带尾随行终止符的 code（`"\n\nflowchart LR\n\n"`），与已文档化的 wrapFence"恰好移除一个终止符"规则冲突；实现行为符合设计，修正测试数据为规范形态并补充"尾随行终止符规范化"两组显式钉死测试后全绿。

## 四、变更文件清单

- 新增：`src/utils/fence.ts`、`src/utils/fence.test.ts`（git commit `5b41f7e`，仅含本任务 2 文件）
- 未触碰：`changes/` 下规划工件、`.spec-superflow.yaml`（既有未提交修改）、并行子代理的 `src/controller/debounce.test.ts` 与 `src/render/`（T3/T4 工作）

## 五、自审

- **可证伪**：28 条测试逐条钉死行为（正常/空行/CRLF/无换行/空输入/无内容/歧义/抛错/往返），`stripFence(wrapFence(code)) === code` 与抛错路径均有显式断言；无 mock、无内部实现窥探。
- **边界覆盖**：任务列举边界全部覆盖：空输入（抛错）、只有围栏无内容（→ `""`）、围栏内多行、内容以 `` ``` `` 结尾（最末 `` ``` `` 收尾，文档化）、CRLF 行尾（归一化）、结尾无换行。
- **最小**：仅 2 个纯函数 + 常量，未引入依赖、未建抽象类、未实现后续任务逻辑（YAGNI）；错误信息明确但测试用 `.toThrow()` 不耦合消息文本。
- **零失真核验**：剥离/包回只动围栏行；内容区逐字节保留（除 CRLF→LF 防御归一化）；往返不变量在约定语义内精确成立。

## 六、顾虑 / 需后续留意

1. **结尾围栏后尾随换行（strict 抛错）**：当前 `"```mermaid\ncode\n```\n"` 抛错。规格示例为无尾随换行形态，但 T11 接入真实 `getBlockMarkdown` 时应验证其输出形态；若实测带尾随换行，需在 fence.ts 放宽（trim 尾部一个换行后再剥离）并同步改测试。
2. **wrapFence 尾随空行字节非精确**：code 以 `\n\n` 结尾（真实尾随空行）写回后保留空行语义但字节数减一（`stripFence(wrapFence("X\n\n")) === "X\n"`）。Mermaid/Visimer 对尾随空行不敏感，且 Visimer 序列化通常已归一化；若未来要求字节级精确需重新评估该规则。
3. **并行子代理共享 worktree**：T3 已提交（`05a0cbd`）、T4 尚在工作区（`src/render/`）；本任务提交仅含自身 2 文件，无冲突。
