# 商品管理后台 API 接口文档

本文档描述了如何在管理后台前端通过 RESTful API 调用后端接口，进行商品 (SPU) 和库存单元 (SKU) 的增删改查操作。

**Base URL:** `/api/admin/products`

> **注意**: 所有接口建议携带鉴权 Token（视项目具体鉴权方案而定，通常在 Header 中添加 `Authorization: Bearer <token>`）。

---

## 1. 商品 (SPU) 管理接口

### 1.1 获取商品列表
分页获取商品列表，支持按名称模糊搜索和按状态筛选。

- **URL:** `/spu`
- **Method:** `GET`
- **Query Parameters:**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | Number | 否 | 页码，默认 1 |
| `pageSize` | Number | 否 | 每页数量，默认 20，最大 100 |
| `name` | String | 否 | 商品名称（模糊搜索） |
| `status` | String | 否 | 商品状态（如 `active`, `inactive`） |

- **Response Example:**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "5f8d...",
        "name": "IPhone 15 Pro",
        "coverImage": "https://example.com/image.jpg",
        "status": "active",
        "priority": 100,
        "createdAt": 1697000000000,
        "categories": [
          { "id": "cate_001", "name": "手机" }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 56
    }
  }
}
```

### 1.2 获取商品详情
获取单个商品的详细信息，包括关联的分类。

- **URL:** `/spu/:id`
- **Method:** `GET`
- **Path Parameters:**
  - `id`: 商品 ID
- **Response Example:**
```json
{
  "code": 0,
  "data": {
    "id": "5f8d...",
    "name": "IPhone 15 Pro",
    "detail": "<p>商品详情 HTML...</p>",
    "coverImage": "https://example.com/cover.jpg",
    "swiperImages": "[\"https://example.com/1.jpg\", \"https://example.com/2.jpg\"]",
    "status": "active",
    "priority": 100,
    "categories": [
      { "id": "cate_001", "name": "手机" }
    ]
  }
}
```

### 1.3 创建商品
创建一个新的商品 SPU。

- **URL:** `/spu`
- **Method:** `POST`
- **Body Parameters (JSON):**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `name` | String | 是 | 商品名称 |
| `detail` | String | 否 | 商品详情 (HTML/Markdown) |
| `coverImage` | String | 否 | 封面图 URL |
| `swiperImages` | String | 否 | 轮播图 URL (建议 JSON 字符串或逗号分隔) |
| `status` | String | 否 | 状态 (默认 `active`) |
| `priority` | Number | 否 | 排序优先级 (默认 0) |
| `categoryIds` | Array<String> | 否 | 关联的分类 ID 列表，如 `["cate_1", "cate_2"]` |

- **Response Example:**
```json
{
  "code": 0,
  "data": {
    "id": "new_spu_id_123",
    "name": "IPhone 15 Pro",
    ...
  }
}
```

### 1.4 更新商品
更新现有商品信息。**注意**：`categoryIds` 如果传值，会全量覆盖原有的分类关联。

- **URL:** `/spu/:id`
- **Method:** `PUT`
- **Path Parameters:**
  - `id`: 商品 ID
- **Body Parameters (JSON):** 同创建接口。

- **Response Example:**
```json
{
  "code": 0,
  "data": { ...updatedSpuObject }
}
```

### 1.5 删除商品
删除指定商品，同时会删除该商品与分类的关联关系。

- **URL:** `/spu/:id`
- **Method:** `DELETE`
- **Path Parameters:**
  - `id`: 商品 ID
- **Response Example:**
```json
{
  "code": 0,
  "message": "删除成功",
  "data": null
}
```

---

## 2. 规格 (SKU) 管理接口

### 2.1 获取 SKU 列表
分页获取 SKU 列表，支持按 SPU ID 或 货号 筛选。

- **URL:** `/sku`
- **Method:** `GET`
- **Query Parameters:**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | Number | 否 | 页码，默认 1 |
| `pageSize` | Number | 否 | 每页数量，默认 20 |
| `spuId` | String | 否 | **重要**: 筛选特定商品的 SKU |
| `cargoId` | String | 否 | 按货号精确筛选 |

- **Response Example:**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "sku_001",
        "spuId": "spu_123",
        "price": 9999.00,
        "stock": 50,
        "cargoId": "IP15-256-BLK",
        "attributes": [
          { "id": "attr_val_1", "value": "黑色" },
          { "id": "attr_val_2", "value": "256GB" }
        ]
      }
    ],
    "pagination": { ... }
  }
}
```

### 2.2 获取 SKU 详情
获取单个 SKU 的详细信息及关联属性。

- **URL:** `/sku/:id`
- **Method:** `GET`
- **Path Parameters:**
  - `id`: SKU ID
- **Response Example:**
```json
{
  "code": 0,
  "data": {
    "id": "sku_001",
    "spuId": "spu_123",
    "price": 9999.00,
    "wholesalePrice": 8800.00,
    "stock": 50,
    "image": "https://...",
    "cargoId": "IP15-256-BLK",
    "description": "黑色 256G",
    "attributes": [
      { "id": "attr_val_1", "value": "黑色" }
    ]
  }
}
```

### 2.3 创建 SKU
为一个商品创建 SKU 规格。

- **URL:** `/sku`
- **Method:** `POST`
- **Body Parameters (JSON):**

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `spuId` | String | **是** | 关联的商品 ID |
| `price` | Number | 否 | 销售价格 |
| `wholesalePrice` | Number | 否 | 批发/成本价格 |
| `stock` | Number | 否 | 库存数量 (默认 0) |
| `image` | String | 否 | SKU 图片 URL |
| `cargoId` | String | 否 | 货号/SKU编码 (需唯一) |
| `description` | String | 否 | 描述文本 |
| `attrValueIds` | Array<String> | 否 | 关联的规格属性值 ID，如 `["color_red_id", "size_m_id"]` |

- **Response Example:**
```json
{
  "code": 0,
  "data": {
    "id": "new_sku_id_456",
    ...
  }
}
```

### 2.4 更新 SKU
更新 SKU 信息。**注意**：`attrValueIds` 如果传值，会全量覆盖原有的属性值关联。

- **URL:** `/sku/:id`
- **Method:** `PUT`
- **Path Parameters:**
  - `id`: SKU ID
- **Body Parameters (JSON):** 同创建接口。

- **Response Example:**
```json
{
  "code": 0,
  "data": { ...updatedSkuObject }
}
```

### 2.5 删除 SKU
删除指定 SKU，同时删除其与属性值的关联。

- **URL:** `/sku/:id`
- **Method:** `DELETE`
- **Path Parameters:**
  - `id`: SKU ID
- **Response Example:**
```json
{
  "code": 0,
  "message": "删除成功",
  "data": null
}
```
