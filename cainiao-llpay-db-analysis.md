# 菜鸟物流下单/通关 + 连连支付（聚合收银台）数据库结构分析（仅分析）

本文目标：当需要组装菜鸟物流系统 API 请求体、以及连连支付创单/聚合收银台请求体时，尽量做到“直接从数据表读取字段”，减少在代码里二次转换、拼接与推导。

范围说明：
- 仅分析，不修改代码与数据库表
- 分析依据：菜鸟请求体字段样例（见 [json.json](file:///Users/chenshuang/pp/allmax-vason/cloudfunctions/cainiaoReqUtil/json.json)），以及 CloudBase MySQL / NoSQL 当前表结构

CloudBase 环境信息：
- EnvId：cloud1-9gaf7sks5b9ec073
- MySQL schema：cloud1-9gaf7sks5b9ec073
- NoSQL collection：llpay（少量记录，含 `idempotencyKey/txnSeqno/status` 等）

## 1. 当前已存在的核心表与关键字段（现状盘点）

### 1.1 订单与明细
- `shop_order`
  - 主键：`_id`
  - 关键字段：`delivery_info`（关联收货信息）、`user`、`client_order_no`（唯一）、`totalPrice`、`paymentType`、`status`、`createdAt/updatedAt`
- `shop_order_item`
  - 主键：`_id`
  - 关键字段：`order`（索引）、`sku`、`count`

### 1.2 收货信息（更像地址簿/用户侧信息）
- `shop_delivery_info`
  - 主键：`_id`
  - 关键字段：`name/phone/address/idCard`、`user`
  - 缺口：缺 `country/province/city/district/town` 等结构化行政区字段

### 1.3 用户
- `users`
  - 主键：`_id`
  - 关键字段：`openid`、`phone`、`gender`、`nickname`、`accpId(唯一)` 等

### 1.4 连连支付（MySQL）
- `llpay_v2`
  - 主键：`_id`
  - 关键字段：`orderId(唯一)`、`txnSeqno(唯一)`、`platform_txno(唯一)`、`amountFen`、`txnTime`、`status`、`payParams(json)`、`openid`
  - 说明：该表已具备“支付单实体”雏形，可作为聚合收银台/支付回调落库与追踪的主表

### 1.5 保税/跨境推送记录（当前包含大量订单级快照）
- `bonded_warehouse_orders`
  - 主键：`_id`（仅有主键索引）
  - 关键字段：
    - 订单关联：`orderId`、`shopOrderId`、`bondedOrderId/bondedOrderCode`
    - 金额：`totalAmount/paidAmount/postFee/discountAmount/insuranceFee`
    - 收货人快照：`receiverName/receiverPhone/receiverIdCard/receiverProvince/receiverCity/receiverDistrict/receiverAddress`
    - 推送与追踪：`status/submittedAt/processedAt/shippedAt/retryCount/errorMsg`
    - 原始报文：`requestData/responseData`
  - 说明：该表当前同时承担了“业务订单快照 + 推送记录”的职责，后续若希望“接口字段直取”，建议把可复用字段结构化沉淀到业务域表中，避免只依赖 `requestData`

## 2. 菜鸟请求体字段拆解（按数据域归类）

以 [json.json](file:///Users/chenshuang/pp/allmax-vason/cloudfunctions/cainiaoReqUtil/json.json) 为准，菜鸟侧核心域可拆为：
- 订单主信息：`externalOrderCode/externalTradeCode/orderCreateTime/orderPayTime/saleMode/orderType/buyerRemark/sellerRemark`
- 订单明细：`orderItemList`（数量、外部商品 id、菜鸟商品 id、申报信息、溯源码、库存渠道）
- 收货信息：`receiverInfo`（国家、省市区、街道、地址、姓名、手机号）
- 通关申报：`customsDeclareInfo`（姓名、证件类型/号码、性别、国籍、平台用户 id、支付单号/渠道、订购人手机号）
- 金额税费：`orderAmountInfo`（实付、运费、优惠、保险、币种、完税价、各税种）
- 仓库/配置：`storeCode/ownerUserId/businessUnitId/inventoryChannel` 等（多为仓库/渠道维度配置）
- 发件/退件信息：`senderInfo/refunderInfo`（通常来自仓库/商家配置）

## 3. 现状下“可以直取”的部分（已有承载）

- 支付域：
  - `llpay_v2` 已能提供：支付状态/金额（分）/支付时间/支付流水号等
  - `customsDeclareInfo.payOrderId` 实际应映射到 `llpay_v2.platform_txno` 或 `llpay_v2.txnSeqno`（需要在业务侧统一口径）
- 订单与明细域：
  - `shop_order` + `shop_order_item` 可以提供订单号、状态、明细数量等基础字段
- 收货人快照（部分）：
  - `bonded_warehouse_orders` 已沉淀了 `receiverProvince/City/District/Address` 等快照字段

## 4. 结构化缺口（导致必须“拼 JSON/二次转换”的根因）

### 4.1 receiverInfo 地址字段不完整
- `shop_delivery_info` 只有 `address/name/phone/idCard`，缺国家、省市区、街道等结构化字段
- `bonded_warehouse_orders` 有省市区与地址，但缺 `country/town`

### 4.2 orderAmountInfo 税费字段缺失
- `shop_order` 仅有 `totalPrice`
- `bonded_warehouse_orders` 有部分订单级金额，但缺 `vat/customsTax/consumptionTax/totalTax/dutiablePrice/currency`

### 4.3 orderItemList 缺少“对外接口字段承载”
`shop_order_item` 只有 `count/sku/order`，缺：
- 菜鸟商品编码：`itemId`
- 小程序商品 id：`extItemId`
- 商品级申报信息：`declareInfo.*`
- `inventoryChannel`
- 溯源码集合：`traceableCodeSet`

### 4.4 senderInfo / refunderInfo 缺少规范承载
这两块更偏“仓库/商家配置”，若没有配置表承载，通常只能在代码中写死或拼装。

### 4.5 菜鸟仓库/渠道配置缺少维度表
`ownerUserId/businessUnitId/storeCode/orderType/default inventoryChannel` 这类字段应归属于“仓库/渠道配置”，否则会分散在代码、环境变量或杂项表字段中。

## 5. 针对现状的字段/表调整建议清单（按最小改造优先级）

以下为建议方案（仅分析，不落库）。实践中可以分阶段实施，目标是让接口字段有稳定的“结构化来源”，并降低对 `requestData` 的依赖。

### A. 订单级金额税费结构化（高优先级）

二选一：
- 方案 A1：新增订单结算表 `order_amount`（推荐）
- 方案 A2：在 `shop_order` 扩展字段（改动更小，但易膨胀）

建议覆盖字段（对应 `orderAmountInfo`）：
- `currency`
- `actual_payment`
- `post_fee`
- `coupon`
- `insurance`
- `dutiable_price`
- `vat`
- `customs_tax`
- `consumption_tax`
- `total_tax`

现状可迁移/同步来源：
- `bonded_warehouse_orders.totalAmount/paidAmount/postFee/discountAmount/insuranceFee`

### B. 订单级通关申报信息结构化（高优先级）

建议新增订单 1:1 表 `order_customs_declare`（或扩展到订单表中），覆盖 `customsDeclareInfo`：
- `buyer_id_type`
- `buyer_id_no`
- `buyer_name`
- `gender`
- `nationality`
- `contact_no`
- `pay_order_id`
- `pay_channel`
- `pay_time`

现状可复用字段来源：
- 证件：`shop_delivery_info.idCard` 或 `bonded_warehouse_orders.receiverIdCard`
- 姓名/电话：`shop_delivery_info.name/phone` 或 `bonded_warehouse_orders.receiverName/receiverPhone`
- 支付单号/时间/状态：`llpay_v2.platform_txno/txnSeqno/txnTime/status`

需要补齐字段：
- `nationality`

### C. 收货/发货/退货信息的“订单快照化”（高优先级）

建议新增订单地址快照表 `order_address`（推荐），而不是只用 `shop_delivery_info`：
- 关联：`order_id`
- 角色：`type` ∈ {`receiver`, `sender`, `refunder`}
- 字段：`country/province/city/district/town/address/name/contact_no`

目标：
- receiverInfo 不需要从“地址簿 + 行政区补全”转换
- senderInfo/refunderInfo 可由仓库配置表默认填充到快照表，接口直取

### D. 商品与明细的“外部渠道字段承载”（高优先级）

建议拆为三块：
- 商品渠道映射表 `product_channel_mapping`（SKU → 菜鸟 itemId 等）
  - `sku_id`
  - `channel`（如 `cainiao`）
  - `channel_item_id`（对应 `orderItemList.itemId`）
  - `inventory_channel`（若按渠道/仓库区分）

- 订单明细申报表 `order_item_declare`（明细级 1:1）
  - `order_item_id`
  - `item_total_price/item_total_actual_price`
  - `vat/customs_tax/consumption_tax/total_tax`

- 订单明细溯源码表 `order_item_trace_code`（明细级 1:n）
  - `order_item_id`
  - `trace_code`
  - 唯一约束建议：`(order_item_id, trace_code)`

### E. 菜鸟仓库/渠道配置维度化（中高优先级）

建议新增 `cainiao_profile` / `logistics_warehouse`：
- `store_code`
- `owner_user_id`
- `business_unit_id`
- `order_type`
- `default_inventory_channel`
- `sender/refunder` 默认联系人信息（或引用一张联系人表）

并在 `shop_order` 上增加：
- `warehouse_id`（或 `logistics_profile_id`）

目标：
- `storeCode/ownerUserId/businessUnitId/orderType/inventoryChannel/senderInfo/refunderInfo` 都可通过订单 join 得到

### F. 现有表的“就地小修”建议（可选）

- `shop_delivery_info` 若继续作为收货信息来源：
  - 建议新增：`country/province/city/district/town`
- `bonded_warehouse_orders` 作为推送记录表：
  - 建议增加索引（概念上）：`orderId` 或 `shopOrderId` 唯一索引、以及按 `status/submittedAt` 的查询索引
  - 目标：便于按订单追踪推送状态，不依赖全文字段查询

## 6. 现状下推荐的主链路关联规范（用于接口组装）

建议统一主链路（以减少歧义与跨表映射成本）：
- 订单：`shop_order._id`
- 明细：`shop_order_item.order` → `shop_order._id`
- 收货信息：`shop_order.delivery_info` → `shop_delivery_info._id`
- 用户：`shop_order.user` 或 `shop_delivery_info.user` → `users._id`
- 支付单：`llpay_v2.orderId(唯一)` → `shop_order._id`
- 保税/推送记录：`bonded_warehouse_orders.orderId` 建议与 `shop_order._id` 对齐（并加唯一索引）

## 7. 备注：关于 `customsDeclareInfo.payOrderId` 的落库口径

当前 `llpay_v2` 同时存在：
- `txnSeqno`（更像商户侧流水/请求序列）
- `platform_txno`（更像支付平台侧单号）

建议业务侧明确：
- 对外（菜鸟/海关）口径 `payOrderId` 究竟选哪个字段
- 并在 `order_customs_declare.pay_order_id` 中固化，以避免接口层每次判断

