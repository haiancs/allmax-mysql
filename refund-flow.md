# 退款流程（含订单项状态）

```mermaid
flowchart TD
  A[用户点击退款] --> B[refund/apply]
  B --> C[生成 refund_apply: TO_AUDIT]
  C --> D[订单项状态更新: TO_AUDIT]
  D --> E[管理员审核]
  E --> F{审核结果}
  F -->|通过| G[refund/approve]
  G --> H[调用 LLPay 退款]
  H --> I[refund_apply: THE_APPROVED]
  I --> J[订单项状态更新: THE_APPROVED]
  F -->|拒绝| K[refund/reject]
  K --> L[refund_apply: CLOSED]
  L --> M[订单项状态更新: CLOSED]
  H --> N[LLPay 退款通知]
  N --> O{退款是否成功}
  O -->|成功| P[refund_apply: COMPLETE]
  O -->|失败| Q[refund_apply: CLOSED]
```

## 状态映射
- 订单项状态：TO_AUDIT(10) → THE_APPROVED(20) → CLOSED(60)
- 退款单状态：TO_AUDIT(10) → THE_APPROVED(20) → COMPLETE(50) / CLOSED(60)

## 订单项更新策略
- 优先使用订单项 ID 更新
- 若未提供订单项 ID，则按 SKU 更新
- 若以上都没有，则按订单号更新全部订单项
