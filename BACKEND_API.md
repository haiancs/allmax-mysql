# 后端接口文档

本文档按**管理员端 (Admin)** 和 **普通用户端 (User/Shop)** 分类，详细说明了各接口的功能、适用场景及底层数据库操作。

---

## 1. 管理员端 (Admin)
**基础路径**: `/api/admin`

### 1.1 订单管理 (Orders)
| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/orders` | GET | 分页查询订单列表 | 管理员查看订单列表，支持按 ID、状态、用户 ID 筛选 | `shop_order` (主表), `llpay_v2` (关联支付信息) | 否 |
| `/orders/:id` | GET | 查询订单详情 | 查看单个订单的详细信息，包括商品项、收货信息、支付流水 | `shop_order`, `shop_order_item`, `shop_delivery_info`, `llpay_v2` | 否 |

### 1.2 支付管理 (Payments)
| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/payments` | GET | 分页查询支付流水 | 财务对账，查看连连支付的交易记录 | `llpay_v2` | 否 |
| `/payments/:id` | GET | 查询支付详情 | 查看单笔支付流水的详细状态 | `llpay_v2` | 否 |

### 1.3 用户管理 (Users)
| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/users` | GET | 分页查询用户列表 | 管理员查看注册用户，支持按 ID、OpenID、手机号筛选 | `user` | 否 |
| `/users/:id` | GET | 查询用户详情 | 查看单个用户的详细资料 | `user` | 否 |

### 1.4 商品管理 (Products)
| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/products/spu` | GET | 分页查询 SPU (标准产品单位) | 商品列表管理，支持按名称、状态筛选 | `shop_spu`, `shop_spu_cate`, `shop_spu_category_links` | 否 |
| `/shop_spu_cate` | GET | 获取所有商品分类 | 商品发布/编辑时选择分类下拉框 | `shop_spu_cate` | 否 |

### 1.5 售后管理 (Refunds)
| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/refunds` | GET | 分页查询售后申请 | 客服处理用户的退款/售后申请 | `refund_apply` | 否 |

### 1.6 系统日志 (System Logs)
| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/sys_logs` | GET | 分页查询系统日志 | 运维排查问题，查看系统操作记录 | `sys_logs` | 否 |

---

## 2. 普通用户端 (User/Shop)
**基础路径**: `/api` 或 `/api/shop`

### 2.1 订单业务 (Orders)
**挂载点**: `/api/shop/orders` (操作), `/api/orders` (查询)

| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/shop/orders` | POST | **创建订单** | 用户结算下单 | `shop_order` (插入), `shop_order_item` (插入) | **是** (通常) |
| `/api/shop/orders/:id/cancel` | POST | 取消订单 | 用户或系统取消未支付订单 | `shop_order` (更新状态) | 视逻辑而定 |
| `/api/shop/orders/:id/confirm-received` | POST | 确认收货 | 用户收到货后手动确认 | `shop_order` (更新状态) | 视逻辑而定 |
| `/api/orders` | POST | 分页查询订单 | 用户端“我的订单”列表 | `shop_order`, `shop_order_item`, `llpay_v2` | 否 |
| `/api/order/detail` | GET/POST | 查询订单详情 | 用户端订单详情页 | `shop_order`, `shop_order_item`, `shop_delivery_info`, `llpay_v2` | 否 |

### 2.2 购物车 (Cart)
**挂载点**: `/api/shop/cart`

| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/add` | POST | 添加商品到购物车 | 用户在商品详情页点击“加入购物车” | `shop_cart_item` (插入或更新), `shop_sku` (查库存), `shop_distribution_record` (查分销价) | 否 (使用 Raw SQL) |

### 2.3 商品展示 (Goods)
**挂载点**: `/api/shop`

| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/goods/list-with-price` | POST | 商品列表 (带价格) | 首页或商品列表页展示，包含 SKU 价格信息 | `shop_spu`, `shop_sku` | 否 |
| `/getAllSkuWithAttrValues` | GET/POST | 获取 SKU 及属性详情 | 商品详情页，选择规格时展示库存和价格 | `shop_sku`, `shop_attr_value`, `shop_attr_name` | 否 |

### 2.4 售后申请 (Refunds)
**挂载点**: `/api/shop/refund`

| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/apply` | POST | **申请售后/退款** | 用户对已支付订单申请退款 | `refund_apply` (插入), `shop_order_item` (更新状态) | **是** (显式使用) |
| `/list` | POST | 售后申请列表 | 用户查看自己的售后记录 | `refund_apply` | 否 |

### 2.5 支付与资金 (LLPay)
**挂载点**: `/api/llpay`

| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/pay` | POST | 发起支付 | 订单创建后，用户点击支付 | `llpay_v2` (记录支付流水) | 否 |
| `/refund-notify` | POST | 退款回调 | 接收连连支付的退款结果通知 | `refund_apply` (更新状态) | 否 |
| `/order-query` | POST | 查询支付结果 | 轮询或查询支付单状态 | 查 `llpay_v2` 或调三方接口 | 否 |
| `/accp/txn/secured-confirm` | POST | 担保交易确认 | 确认担保交易收货（分账前置） | 调三方接口 | 否 |

### 2.6 分销 (Distribution)
**挂载点**: `/api/distribution`

| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/orders` | POST | 创建分销订单 | 分销商代客下单或分销链接下单 | `shop_order`, `shop_distribution_record` | **是** (通常) |
| `/users/:id/dashboard` | GET | 分销员仪表盘 | 查看分销业绩、收益等 | `shop_distribution_record`, `user` | 否 |

### 2.7 菜鸟物流 (Cainiao)
**挂载点**: `/api/cainiao`

| 接口路径 | 方法 | 功能描述 | 适用场景 | 数据库操作 | 事务 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/deliveryorder/create` | POST | 创建发货单 | 商家发货，向菜鸟推送发货指令 | 读取 `shop_order` 组装报文 | 否 |

---

### 补充说明
1.  **数据库连接检查**: 绝大多数写操作接口在执行前都会检查数据库连接状态 (`checkConnection`)，若未连接则返回 503。
2.  **安全性**:
    *   Admin 接口通常应当配合鉴权中间件使用（目前代码中未显式展示鉴权逻辑，可能在更上层或网关处理）。
    *   User 接口部分涉及用户信息（如购物车、订单），依赖前端传入 `userId` 或 `openid`。
3.  **事务使用**:
    *   涉及资金变动、订单状态流转（如创建订单、申请退款）的关键写操作显式使用了数据库事务 (`sequelize.transaction`)，以保证数据一致性。
    *   简单的记录查询或单表更新通常未使用事务。
