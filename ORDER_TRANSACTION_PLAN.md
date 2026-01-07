# 下单服务端事务方案（MySQL / 方案A：条件 UPDATE 扣库存）

本文档用于将“小程序端创建订单逻辑”迁移到当前 Node.js 服务端，并利用 MySQL 事务特性保证数据一致性、利用条件 UPDATE 实现并发安全扣库存。文档先作为评审稿，后续按步骤改代码。

## 0. 当前数据库准备情况（已完成）

已在 CloudBase MySQL 中完成以下结构准备：

- `shop_order` 新增字段 `client_order_no`，并新增唯一索引 `uniq_shop_order_client_order_no(client_order_no)`
  - 当前字段允许 `NULL`，业务侧应确保创建订单时必填（避免多条 `NULL` 绕过唯一性）。
- `shop_order_item` 新增普通索引 `idx_shop_order_item_order(\`order\`)`
- `shop_sku(_id)` 为主键
- `llpay_v2(orderId)` 已有唯一索引（字段允许 `NULL`，建议业务侧必填；是否需要改 `NOT NULL` 再评估）

## 1. 目标与原则

### 1.1 目标

- 幂等：同一笔“下单意图”重复提交（多次点击、网络重试）只生成一笔订单，不重复扣库存，不重复生成支付单。
- 一致性：订单、订单明细、库存扣减、支付单记录要么全部成功，要么全部失败回滚。
- 并发安全：并发下单不会超卖（库存不会被扣成负数）。

### 1.2 关键原则

- 事务内只做数据库读写，不做外部网络调用（例如真正请求连连支付的接口）。
- 幂等由“数据库唯一索引 + 服务端冲突处理”共同完成。
- 扣库存采用方案A：条件 UPDATE（`stock >= qty`），以 affectedRows 判断成功与否。

## 2. 表与字段约定（与现有库对齐）

### 2.1 `shop_order`

必须字段（按现有表进行扩展）：

- `_id`：主键（已有）
- `client_order_no`：幂等键（已新增）
- `status`：订单状态（已有）
- `totalPrice`：订单金额（已有）
- `user`：下单用户（已有）
- `orderExpireTime`：过期时间（已有）
- `paymentType`：支付类型（已有）
- `delivery_info`：收货信息（已有）

前端订单状态枚举（与现网对齐）：

- `TO_PAY`：待付款
- `TO_SEND`：待发货
- `TO_RECEIVE`：待收货
- `FINISHED`：已完成
- `CANCELED`：已取消
- `RETURN_APPLIED`：申请退货
- `RETURN_REFUSED`：拒绝退货申请
- `RETURN_FINISH`：退货完成
- `RETURN_MONEY_REFUSED`：拒绝退款

建议的主链路状态流（下单到履约完成）：

- 创建订单成功：`TO_PAY`
- 支付成功：`TO_SEND`
- 发货完成：`TO_RECEIVE`
- 确认收货/自动收货：`FINISHED`

取消/超时关闭：

- 未支付取消/超时：`TO_PAY` → `CANCELED`

退货链路（示例，按你业务规则触发）：

- `TO_RECEIVE`/`FINISHED` → `RETURN_APPLIED` → `RETURN_REFUSED` 或 `RETURN_FINISH`
- 若进入退款审核但拒绝：`RETURN_APPLIED` → `RETURN_MONEY_REFUSED`

### 2.2 `shop_sku`

库存相关字段（现表同时存在 `count` 与 `stock`）：

- 以 `stock` 作为“可售库存”的唯一来源（全链路统一使用 `stock` 扣减/回补/展示）。
- `count` 不作为库存口径使用，避免出现扣减口径与展示口径不一致。

### 2.3 `shop_order_item`

现有字段中用于关联订单：

- `order`：订单引用（varchar(64)）
- `sku`：SKU 引用
- `count`：购买数量

当前已新增索引：`idx_shop_order_item_order(\`order\`)`，用于“按订单查明细”加速。

### 2.4 `llpay_v2`

关键字段：

- `_id`：主键
- `orderId`：订单 ID（唯一索引已存在）
- `txnSeqno`、`platform_txno`：支付流水（唯一索引已存在）
- `status`：支付单状态
- `payParams`：支付参数（可存下发给小程序的参数/或预下单响应）

## 3. 事务边界（核心）

### 3.1 服务端新增接口（建议）

- `POST /api/shop/orders`
  - 功能：创建订单 + 扣库存 + 写订单明细 + 创建/获取 llpay_v2（数据库记录）
  - 返回：订单信息 + 支付单信息（或后续支付调用所需的占位信息）

可选扩展：

- `POST /api/shop/orders/:id/cancel`：取消订单并回补库存（用于支付失败/超时）
- `POST /api/llpay/notify`：支付回调落库（将订单状态置为已支付）

### 3.2 事务内要做的事（必须一起成败）

在一个 `sequelize.transaction(...)` 中完成：

1. 幂等检查：按 `client_order_no` 查订单是否已存在
2. 创建订单 `shop_order`（状态 `TO_PAY`）
3. 批量读取 SKU（用于校验存在性、取价、取当前库存）
4. 扣库存（方案A：条件 UPDATE，逐个 SKU 扣减）
5. 写入订单明细 `shop_order_item`（多行）
6. 幂等检查：按订单 `_id` 查 `llpay_v2` 是否已存在
7. 创建 `llpay_v2` 记录（状态 `INIT`，保存订单 ID、金额、openid、过期时间等）

### 3.3 事务外要做的事（不要放事务里）

事务提交后再做：

- 若需要调用连连支付“预下单/下单”接口：在事务外发起请求
- 将支付响应写回 `llpay_v2.payParams`、更新 `llpay_v2.status=REQUESTED`

原因：外部请求不可控且可能很慢，放事务里会长时间持锁，放大锁等待/死锁风险。

## 4. 并发安全扣库存（方案A：条件 UPDATE）

### 4.1 基本语句

对每个 SKU 扣减数量 `qty`：

```sql
UPDATE shop_sku
SET `stock` = COALESCE(`stock`, 0) - :qty
WHERE `_id` = :skuId
  AND COALESCE(`stock`, 0) >= :qty;
```

判断方式：

- affectedRows = 1：扣减成功
- affectedRows = 0：SKU 不存在或库存不足 → 立即抛错 → 事务回滚

### 4.2 多 SKU 扣减顺序（降低死锁）

对 `items` 按 `skuId` 做稳定排序（字典序/数字序），按顺序逐个执行 UPDATE，降低并发下死锁概率。

## 5. 幂等策略（服务端与数据库配合）

### 5.1 `client_order_no` 的生成与生命周期

- 由小程序端在“确认订单页第一次点击提交”生成，并在页面状态/本地缓存中复用
- 同一笔下单意图（同一份商品、地址、优惠、金额）复用同一个 `client_order_no`
- 若用户修改了关键下单要素，应生成新的 `client_order_no`

### 5.2 服务端处理流程（推荐写法）

事务开始后：

1. 先查：`SELECT ... FROM shop_order WHERE client_order_no = ? LIMIT 1`
2. 若存在：直接返回该订单（必要时再查 `llpay_v2` 并返回）
3. 若不存在：尝试插入订单

并发下可能出现“同时插入”的竞态，依赖唯一索引兜底：

- 如果插入时触发唯一索引冲突：捕获冲突错误 → 再次按 `client_order_no` 查询订单并返回

## 6. 失败与补偿（建议后续做）

### 6.1 典型失败场景

- 库存不足：事务内扣库存 affectedRows=0 → 回滚 → 返回明确错误（例如 400：库存不足）
- 支付预下单失败：事务已提交，订单存在且库存已扣 → 需要“取消/关单”回补库存

### 6.2 取消订单与回补库存（建议）

新增“取消订单”动作（可由用户取消、支付失败回调、或定时任务触发）：

在事务内完成：

1. 校验订单状态仍为 `TO_PAY`（避免重复回补）
2. 将订单状态改为 `CANCELED`
3. 按订单明细把 `shop_sku.stock` 加回去（同样建议排序后逐条 UPDATE）
4. 更新 `llpay_v2.status=FAILED/CANCELLED`

## 7. 分步骤改代码建议（你审核后再实施）

### 第 1 步：新增下单接口骨架

- 在 Express 中新增路由：`POST /api/shop/orders`
- 仅做参数校验与返回结构，不做业务写入

### 第 2 步：落地事务内逻辑（不含外部支付调用）

- 用 `sequelize.transaction` 包裹：
  - 幂等查单（client_order_no）
  - 插入 `shop_order`
  - 读取 `shop_sku`
  - 条件 UPDATE 扣库存
  - 批量插入 `shop_order_item`
  - 创建/查询 `llpay_v2`

### 第 3 步：补齐外部支付调用与回写

- 事务提交后调用连连支付预下单
- 回写 `llpay_v2.payParams` 与状态

### 第 4 步：实现取消与超时机制（推荐）

- `cancel` 接口 +（可选）定时任务扫描超时订单自动关闭并回补库存

## 8. 校验点（上线前）

- 并发压测：同一 SKU 多并发下单，确认不会出现负库存/超卖
- 幂等验证：同 `client_order_no` 重复请求只返回同一订单，库存只扣一次
- 回补验证：支付失败/取消后库存正确恢复
