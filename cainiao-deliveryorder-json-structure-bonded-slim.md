# 菜鸟物流发货 API JSON 精简结构（跨境保税区）

本文件基于 [cainiao-deliveryorder-json-structure.md](file:///Users/chenshuang/pp/allmax-mysql/cainiao-deliveryorder-json-structure.md)，结合「跨境保税区」发货场景，只保留官方文档中标记为**必填**的字段，作为项目对接时的最小字段集合说明。

> 约定：字段的必填含义以菜鸟官方文档为准；本文件只是从原始字段集里做“精简视图”，并不重新定义平台规范。

---

## 1. 网关请求外层（x-www-form-urlencoded）

请求：`POST https://link.cainiao.com/gateway/link.do`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| logistic_provider_id | string | 是 | CP 编号 / APPKEY（控制台绑定资源） |
| data_digest | string | 是 | 签名：`base64(MD5(logistics_interface + secretKey))` |
| msg_type | string | 是 | 接口名称/消息类型（如 `CN_WMS_DELIVERYORDER_CREATE`） |
| logistics_interface | string | 是 | 请求报文内容（JSON 字符串；下文描述其结构） |
| to_code | string \| null | 否 | 目的方编码（可选） |

---

## 2. `logistics_interface` 顶层精简结构

### 2.1 顶层 JSON 示例（仅保留必填字段）

```json
{
  "ownerUserId": "",
  "orderType": "BONDED_WHS",
  "storeCode": "",
  "externalOrderCode": "",
  "receiverInfo": {
    "country": "CN",
    "province": "",
    "city": "",
    "district": "",
    "address": "",
    "name": "",
    "contactNo": ""
  },
  "orderItemList": [
    {
      "itemId": "",
      "itemQuantity": 1,
      "inventoryChannel": "非淘ToC",
      "declareInfo": {
        "itemTotalPrice": 0,
        "itemTotalActualPrice": 0,
        "customsTax": 0,
        "consumptionTax": 0,
        "vat": 0,
        "totalTax": 0
      }
    }
  ],
  "orderAmountInfo": {
    "dutiablePrice": 0,
    "customsTax": 0,
    "consumptionTax": 0,
    "vat": 0,
    "totalTax": 0,
    "insurance": 0,
    "coupon": 0,
    "actualPayment": 0,
    "postFee": 0,
    "currency": "CNY"
  },
  "customsDeclareInfo": {
    "buyerName": "",
    "buyerPlatformId": "",
    "buyerIDType": "1",
    "buyerIDNo": "",
    "payerId": "",
    "payChannel": "",
    "payOrderId": "",
    "nationality": "CN",
    "contactNo": "",
    "payCardId": ""
  }
}
```

### 2.2 顶层字段说明（精简版）

仅列出在原始文档中标记为“必填”的顶层字段。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| ownerUserId | string | 是 | 货主 ID（菜鸟侧分配/从 GOS 获取） |
| orderType | string | 是 | 订单跨境业务类型；保税仓场景填：`BONDED_WHS` |
| storeCode | string | 是 | 仓库编码（菜鸟 KA 分配） |
| externalOrderCode | string | 是 | 外部订单编号/ERP 订单编号（订单主键之一） |
| receiverInfo | object | 是 | 收货方信息，对应下文 3.1 |
| orderItemList | array | 是 | 订单商品列表，对应下文 3.2、3.3 |
| orderAmountInfo | object | 是 | 订单金额信息，对应下文 3.4 |
| customsDeclareInfo | object | 是 | 通关申报信息，对应下文 3.5 |

> 说明：像 `businessUnitId`、`orderSource`、`remark`、`extendFields`、`departureInfo` 等在原文档中标记为“否（待确认）/否”的字段，在本精简版中不再展开。

---

## 3. 对象字段精简结构（第二层）

本章节只保留各对象中“必填”为“是”的字段。

### 3.1 `receiverInfo`（收货方信息）

| 字段 | JSON 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| country | string | 是 | CN | 国家编码，保税场景固定传 `CN` |
| province | string | 是 | 浙江 | 省份 |
| city | string | 是 | 杭州 | 城市；若无城市则传 `/` |
| district | string | 是 | 西湖区 | 区/县；若无区县则传 `/` |
| address | string | 是 | 古翠路 55 号 | 详细地址，必须填写 |
| name | string | 是 | 张三 | 收件人名称 |
| contactNo | string | 是 | 13366896782 | 收件人联系电话；座机传“区号+号码” |

---

### 3.2 `orderItemList[]`（订单商品）

| 字段 | JSON 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| itemId | string | 是 | 12313 | 菜鸟系统生成的货品 ID（GOS 货品管理中可查） |
| itemQuantity | integer | 是 | 1 | 商品数量 |
| inventoryChannel | string | 是 | 非淘ToC | 库存渠道字段；默认“非淘ToC” |
| declareInfo | object | 是 | - | 申报信息对象，见 3.3 |

---

### 3.3 `orderItemList[].declareInfo`（申报信息）

金额类字段单位以官方文档为准（示例为“分”）。

| 字段 | JSON 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| itemTotalPrice | integer | 是 | 9000 | 商品总价（优惠前），单位“分” |
| itemTotalActualPrice | integer | 是 | 9000 | 商品总价（优惠后），单位“分” |
| customsTax | integer | 是 | 1000 | 商品关税，单位“分” |
| consumptionTax | integer | 是 | 1000 | 商品消费税，单位“分” |
| vat | integer | 是 | 1000 | 商品增值税，单位“分” |
| totalTax | integer | 是 | 1000 | 商品综合税，单位“分” |

---

### 3.4 `orderAmountInfo`（订单金额信息）

金额类字段单位以官方文档为准（示例为“分”）。

| 字段 | JSON 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| dutiablePrice | integer | 是 | 2100 | 订单完税价格，单位“分” |
| customsTax | integer | 是 | 200 | 订单关税金额，单位“分” |
| consumptionTax | integer | 是 | 200 | 订单消费税金额，单位“分” |
| vat | integer | 是 | 200 | 订单增值税金额，单位“分” |
| totalTax | integer | 是 | 200 | 订单综合税金额，单位“分” |
| insurance | integer | 是 | 200 | 订单保险金额，单位“分” |
| coupon | integer | 是 | 200 | 订单优惠金额，单位“分” |
| actualPayment | integer | 是 | 8000 | 订单实付金额，单位“分” |
| postFee | integer | 是 | 123 | 订单运费，单位“分” |
| currency | string | 是 | CNY | 币种，保税场景固定传 `CNY` |

---

### 3.5 `customsDeclareInfo`（通关申报信息）

| 字段 | JSON 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| buyerName | string | 是 | 张三 | 购买人真实姓名 |
| buyerPlatformId | string | 是 | 1234 | 买家菜鸟平台 ID |
| buyerIDType | string | 是 | 1 | 购买人身份证件类型，固定值 |
| buyerIDNo | string | 是 | 341024199XXXX37876 | 购买人身份证号码，支持 15/18 位 |
| payerId | string | 是 | 123 | 支付人账号 |
| payChannel | string | 是 | ALIPAY | 支付渠道编码，如 `ALIPAY`、`WEIXINPAY` |
| payOrderId | string | 是 | 1234 | 支付平台单号 |
| nationality | string | 是 | CN | 国籍，保税场景固定传 `CN` |
| contactNo | string | 是 | 13300001111 | 订单人手机号 |
| payCardId | string | 是 | 622202xxxxxxxxxxxx | 银联支付卡号 |

---

## 4. 使用建议（项目实现视角）

- 优先按本精简文档实现对接，保证所有“必填字段”正确下发。
- 若后续业务需要用到非必填字段（如 `remark`、`extendFields`、`expiryInfo` 等），可回看原始文档补充。
- `orderType`、`country`、`nationality`、`currency` 等在跨境保税场景中通常是固定枚举值，建议在系统侧做常量配置，避免误填。

