# 订单与商品接口（前端调用指南）

基础前缀：

- 订单相关：`/api`
- 商品/购物车相关：`/api/shop`

通用返回结构：

```json
{ "code": 0, "data": {} }
```

错误时 `code` 为 `-1`，HTTP 状态码可能为 `400/404/500/503`。

## 订单接口

### 1) 获取订单详情

- 路径：`GET /api/order/detail`
- 备用：`POST /api/order/detail`
- 入口实现：[orders.js](file:///Users/chenshuang/pp/allmax-backend/routes/orders.js#L17-L415)

请求参数：

- `orderId`（string，必填）

示例（GET）：

```
/api/order/detail?orderId=ORDER_ID
```

响应示例：

```json
{
  "code": 0,
  "data": {
    "order": {
      "_id": "ORDER_ID",
      "orderNo": "ORDER_ID",
      "status": "TO_PAY",
      "totalPrice": 99.9,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "delivery_info": {
        "_id": "DELIVERY_ID",
        "name": "张三",
        "phone": "13800000000",
        "address": "示例地址"
      },
      "orderItems": [
        {
          "_id": "ORDER_ITEM_ID",
          "skuId": "SKU_ID",
          "count": 2,
          "sku": {
            "_id": "SKU_ID",
            "image": "https://...",
            "price": 29.9,
            "wholesale_price": 10.0,
            "attr_value": [
              { "_id": "ATTR_VALUE_ID", "value": "规格A" }
            ],
            "spu": { "_id": "SPU_ID", "name": "商品名" }
          },
          "distribution_record": {
            "_id": "DIST_ID",
            "share_price": 1.5
          }
        }
      ]
    }
  }
}
```

### 2) 获取订单列表（分页）

- 路径：`POST /api/orders`
- 入口实现：[orders.js](file:///Users/chenshuang/pp/allmax-backend/routes/orders.js#L182-L412)

请求参数：

- `userId`（string，必填）
- `pageNumber`（number|string，默认 1）
- `pageSize`（number|string，默认 10，最大 100）
- `status`（string 或 string[]，可选，支持多状态）

状态可选值：

`TO_PAY` / `TO_SEND` / `TO_RECEIVE` / `FINISHED` / `CANCELED` / `RETURN_APPLIED` / `RETURN_REFUSED` / `RETURN_FINISH` / `RETURN_MONEY_REFUSED`

请求示例：

```json
{
  "userId": "USER_ID",
  "pageNumber": 1,
  "pageSize": 10,
  "status": ["TO_PAY", "TO_SEND"]
}
```

响应示例（简化）：

```json
{
  "code": 0,
  "data": {
    "records": [
      {
        "_id": "ORDER_ID",
        "clientOrderNo": "CLIENT_ORDER_NO",
        "status": "TO_PAY",
        "totalPrice": 99.9,
        "user": "USER_ID",
        "orderExpireTime": "1736666666666",
        "delivery_info": "DELIVERY_ID",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:10:00.000Z",
        "orderItems": [
          {
            "_id": "ORDER_ITEM_ID",
            "skuId": "SKU_ID",
            "count": 1,
            "sku": {
              "_id": "SKU_ID",
              "image": "https://...",
              "price": 29.9,
              "wholesale_price": 10.0,
              "spu": { "_id": "SPU_ID", "name": "商品名" }
            }
          }
        ]
      }
    ],
    "total": 1
  }
}
```

### 3) 创建订单（直接下单）

- 路径：`POST /api/shop/orders`
- 入口实现：[shop.js](file:///Users/chenshuang/pp/allmax-backend/routes/shop.js#L76-L193)

请求参数：

- `clientOrderNo`（string，必填，幂等键）
- `userId`（string，可选）
- `addressId`（string，可选，收货信息 ID）
- `isDistributor`（boolean，可选）
- `orderItems`（array，必填）
  - `skuId`（string，必填）
  - `count`（number，必填，正整数）
  - `distributionRecordId`（string，可选）

请求示例：

```json
{
  "clientOrderNo": "CLIENT_ORDER_NO",
  "userId": "USER_ID",
  "addressId": "DELIVERY_ID",
  "isDistributor": false,
  "orderItems": [
    { "skuId": "SKU_ID", "count": 2 }
  ]
}
```

响应示例（简化）：

```json
{
  "code": 0,
  "data": {
    "order": { "_id": "ORDER_ID", "status": "TO_PAY" },
    "items": [{ "skuId": "SKU_ID", "quantity": 2 }],
    "llpay": { "_id": "LLPAY_ID", "status": "CREATED" },
    "isIdempotentHit": false
  }
}
```

### 4) 创建订单（购物车提交）

- 路径：`POST /api/shop/cart/submit`
- 入口实现：[shop.js](file:///Users/chenshuang/pp/allmax-backend/routes/shop.js#L195-L370)

请求参数：

- `clientOrderNo`（string，必填）
- `userId`（string，必填）
- `addressId`（string，可选）
- `isDistributor`（boolean，可选）
- `cart_item_ids` 或 `cartItemIds`（string[]，可选，指定部分购物车项）

响应会额外返回已删除的购物车项：

```json
{
  "code": 0,
  "data": {
    "order": { "_id": "ORDER_ID", "status": "TO_PAY" },
    "items": [{ "skuId": "SKU_ID", "quantity": 2 }],
    "llpay": { "_id": "LLPAY_ID", "status": "CREATED" },
    "isIdempotentHit": false,
    "cart": { "deletedItemIds": ["CART_ITEM_ID"] }
  }
}
```

## 商品接口

### 1) 获取某个 SPU 下的 SKU + 属性

- 路径：`GET /api/shop/getAllSkuWithAttrValues`
- 备用：`POST /api/shop/getAllSkuWithAttrValues`
- 入口实现：[shopSkuAttr.js](file:///Users/chenshuang/pp/allmax-backend/routes/shopSkuAttr.js#L7-L121)

请求参数：

- `spuId`（string，必填）

响应示例（简化）：

```json
{
  "code": 0,
  "data": [
    {
      "_id": "SKU_ID",
      "stock": 100,
      "price": 29.9,
      "wholesale_price": 10,
      "image": "https://...",
      "attr_value": [
        {
          "_id": "ATTR_VALUE_ID",
          "value": "规格A",
          "attr_name": { "_id": "ATTR_NAME_ID", "name": "规格" }
        }
      ]
    }
  ]
}
```

### 2) 更新 SKU 库存（增减）

- 路径：`POST /api/shop_sku/update-count`
- 入口实现：[index.js](file:///Users/chenshuang/pp/allmax-backend/index.js#L59-L114)

请求参数：

- `skuId`（string，必填）
- `delta`（number，必填，可正可负，结果不能为负）

请求示例：

```json
{ "skuId": "SKU_ID", "delta": -1 }
```

响应示例：

```json
{ "code": 0, "data": { "skuId": "SKU_ID", "delta": -1 } }
```

### 3) 商品管理（创建/更新/删除）

当前路由层未实现 SPU/SKU 的新增、更新、删除接口，仅提供：

- SKU 属性查询（上面的 `/getAllSkuWithAttrValues`）
- 库存调整（`/shop_sku/update-count`）
- CSV 导入（`POST /api/shop/import/sku-csv`）

如需完整商品 CRUD，需要新增对应路由与服务层实现。

## 购物车接口（订单流程相关）

### 1) 加入购物车

- 路径：`POST /api/shop/cart/add`
- 入口实现：[shopCart.js](file:///Users/chenshuang/pp/allmax-backend/routes/shopCart.js#L12-L218)

请求参数：

- `user`（string，必填）
- `skuId`（string，必填）
- `addCount`（number，必填）
- `distributionRecordId`（string，可选）

### 2) 获取购物车

- 路径：`GET /api/shop/cart`
- 入口实现：[shopCart.js](file:///Users/chenshuang/pp/allmax-backend/routes/shopCart.js#L220-L334)

请求参数：

- `user` 或 `userId`（string，必填）

### 3) 修改购物车数量

- 路径：`POST /api/shop/cart/update-count`
- 入口实现：[shopCart.js](file:///Users/chenshuang/pp/allmax-backend/routes/shopCart.js#L336-L468)

请求参数：

- `id` 或 `cartItemId`（string，必填）
- `user` 或 `userId`（string，必填）
- `count`（number，必填）

### 4) 删除购物车项

- 路径：`POST /api/shop/cart/delete`
- 入口实现：[shopCart.js](file:///Users/chenshuang/pp/allmax-backend/routes/shopCart.js#L471-L565)

请求参数：

- `id` 或 `cartItemId`（string，必填）
- `user` 或 `userId`（string，必填）

### 5) 清空购物车

- 路径：`POST /api/shop/cart/clear`
- 入口实现：[shopCart.js](file:///Users/chenshuang/pp/allmax-backend/routes/shopCart.js#L568-L630)

请求参数：

- `user` 或 `userId`（string，必填）
