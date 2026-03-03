---
name: "local-api-tester"
description: "用于在本地测试 API 接口。它能自动识别接口所需的参数，引导用户输入，并组装发起本地请求。当用户需要测试特定的 API 路径时调用。"
---

# Local API Tester

这个 Skill 旨在简化本地接口测试流程。它会自动分析代码以确定接口所需的参数。

## 使用场景
- 当用户想要测试本地运行的服务接口时。
- 当用户不确定某个接口需要哪些参数时。
- 当用户想要快速发起一个本地 curl 请求时。

## 工作流程

1. **识别接口定义**：
   - 使用 `Grep` 或 `SearchCodebase` 搜索用户提供的 API 路径（例如 `/api/shop/refund/apply`）。
   - 找到对应的路由定义文件（如 `routes/*.js`）和控制器逻辑。

2. **分析参数要求**：
   - 检查代码中对 `req.body`、`req.query` 或 `req.params` 的使用。
   - 寻找验证逻辑（如 `Joi` 验证、手动 `if (!param)` 检查）。
   - 区分**必填参数**（Required）和**可选参数**（Optional）。

3. **与用户交互**：
   - 列出找到的必填参数，并询问用户这些参数的具体值。
   - 提供一个 JSON 示例，包含必填项和可能的默认值。

4. **执行请求**：
   - 收到参数后，组装成完整的 `curl` 命令。
   - 使用 `RunCommand` 工具在本地执行该命令。
   - 展示接口返回的结果（JSON 格式）。

## 注意事项
- 确保本地服务已启动（通常在 8081 或 8080 端口）。
- 如果涉及数据库操作，确保数据库已连接。
- 对于复杂的嵌套对象（如 `items` 数组），可以引导用户提供 JSON 片段。

## 示例

**用户输入**：`我想测试 /api/shop/refund/apply`

**Skill 执行**：
1. 搜索 `/apply` 路径。
2. 发现 [refundRoutes.js](file:///Users/chenshuang/pp/allmax-backend/integrations/order/routes/refundRoutes.js) 中的定义。
3. 识别出 `orderId` 和 `refundReason` 为必填项。
4. 询问用户：“测试 `/api/shop/refund/apply` 需要 `orderId` 和 `refundReason`，请提供这些参数的值。”
5. 用户提供后，执行 `curl -X POST http://localhost:8081/api/shop/refund/apply -H "Content-Type: application/json" -d '{"orderId": "...", "refundReason": "..."}'`
