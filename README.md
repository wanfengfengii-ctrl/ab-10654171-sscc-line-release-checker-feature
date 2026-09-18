# SSCC 出库复核

供仓库出库口复核员使用的纯前端单页工具：逐行粘贴或键入 SSCC，一次判断整批能否放行。
无任何在线服务调用与业务后端，全部计算在浏览器内完成。

## 复核规则

- 忽略空行（含纯空白行），非空行保留原始行号；空输入或仅含空行明确拒绝放行。
- 每个非空行用声明式正则 `/^[0-9]{18}$/` 验证为恰好 18 个 ASCII 数字，不做自定义格式解释。
- 前 17 位为载荷（保持字符串形态以保留前导零），第 18 位为实收校验位。
- 校验位算法（唯一自定义算法）：从载荷最右位起依次乘 3、1、3、1……，
  计算 `(10 - (加权和 mod 10)) mod 10`。
- 批内重复识别：只有格式与校验位均合格的 SSCC 才参与比较，首次出现保留通过，
  后续相同值标记为重复（结果显示“与第 N 行重复”，N 为首次出现的原始行号）并阻断整批；
  格式或校验错误行保留自身原因，不因相同原文被改写为重复。
- 页面逐行显示实收校验位、计算值与状态；任一格式、校验或重复失败即整批阻断并聚焦首个问题行，
  汇总给出重复行数量；校验错误同时显示实收值与计算值；输入改变立即清除旧结论；
  全部非空行合格且批内无重复才提示可送上传送带。

## 本地开发

```bash
npm install
npm run dev        # Vite 开发服务器
npm test           # Vitest：校验位计算边界与批次规则
npm run test:e2e   # Playwright：真实浏览器输入流程（自动构建并预览）
npm run verify     # 单元 + 端到端一次跑完
```

## Docker Compose 运行

```bash
docker compose up --build        # 默认 http://localhost:8080
WEB_PORT=9000 docker compose up  # 宿主端口可由 WEB_PORT 覆盖
```

## 一次性验收

`verify` 服务在 compose 网络内启动 `web`，运行 Vitest 与 Playwright（Chromium）
对真实页面做完整验收，结束后退出：

```bash
docker compose --profile verify up --build --exit-code-from verify
```
