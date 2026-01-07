# 菜鸟物流发货 API JSON 报文结构

本文档用于描述菜鸟 LINK 网关下发货报文（示例 `msg_type = CN_WMS_DELIVERYORDER_CREATE`）中，`logistics_interface` 字段承载的 JSON 报文结构（含第一层与已补齐的第二层字段表）。更深层对象细节将在后续补充。

## 1. 网关请求外层（x-www-form-urlencoded）

请求：`POST https://link.cainiao.com/gateway/link.do`（预发环境：`https://prelink.cainiao.com/gateway/link.do`）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| logistic_provider_id | string | 是 | CP编号/APPKEY（控制台绑定资源） |
| data_digest | string | 是 | 签名：`base64(MD5(logistics_interface + secretKey))` |
| msg_type | string | 是 | 接口名称/消息类型（如 `CN_WMS_DELIVERYORDER_CREATE`） |
| logistics_interface | string | 是 | 请求报文内容（JSON/XML 字符串；本文档描述其 JSON 结构） |
| to_code | string \| null | 否 | 目的方编码（可选） |

## 2. `logistics_interface`（JSON）第一层结构

### 2.1 顶层 JSON 示例骨架

```json
{
  "ownerUserId": "",
  "businessUnitId": "",
  "orderType": "",
  "storeCode": "",
  "externalOrderCode": "",
  "externalTradeCode": "",
  "externalShopId": "",
  "externalShopName": "",
  "orderSource": "",
  "orderSubSource": "",
  "orderCreateTime": "",
  "orderPayTime": "",
  "saleMode": "",
  "remark": "",
  "buyerRemark": "",
  "sellerRemark": "",
  "serviceId": "",
  "extendFields": {},
  "departureInfo": {},
  "logisticsServices": {},
  "receiverInfo": {},
  "senderInfo": {},
  "refunderInfo": {},
  "orderItemList": [],
  "orderAmountInfo": {},
  "customsDeclareInfo": {}
}
```

### 2.2 顶层字段说明（仅第一层）

| 字段 | 类型 | 必填 | 说明/备注 |
| --- | --- | --- | --- |
| ownerUserId | string | 是（待确认） | 货主 ID（菜鸟侧分配/从 GOS 获取） |
| businessUnitId | string | 否（待确认） | 事业部/BU 信息（多 BU 场景下使用） |
| orderType | string | 是（待确认） | 订单跨境业务类型（如：`BONDED_WHS`、`OVERSEAS_DS`、`OVERSEAS_WHS`） |
| storeCode | string | 是（待确认） | 仓库编码（菜鸟 KA 分配） |
| externalOrderCode | string | 是（待确认） | 外部订单编号/ERP 订单编号（订单主键之一） |
| externalTradeCode | string | 否（待确认） | 交易平台交易编码/支付交易编号（用于识别/查询） |
| externalShopId | string | 否（待确认） | 店铺 ID |
| externalShopName | string | 否（待确认） | 店铺名称 |
| orderSource | string | 否（待确认） | 销售平台编码（菜鸟侧编码） |
| orderSubSource | string | 否（待确认） | 订单子渠道来源（特定订单来源渠道使用） |
| orderCreateTime | string | 否（待确认） | 交易订单创建时间（示例格式：`YYYY-MM-DD HH:mm:ss`） |
| orderPayTime | string | 否（待确认） | 交易订单支付完成时间（示例格式：`YYYY-MM-DD HH:mm:ss`） |
| saleMode | string | 否（待确认） | 销售模式（示例：`0/1` 等） |
| remark | string | 否（待确认） | 备注/客户留言 |
| buyerRemark | string | 否（待确认） | 买家留言 |
| sellerRemark | string | 否（待确认） | 卖家留言 |
| serviceId | string | 否（待确认） | 服务 ID（示例：`100100/300300` 等） |
| extendFields | object | 否 | 拓展属性（`Map<String, String>` 语义） |
| departureInfo | object | 否 | 运输信息（对象细节待补充） |
| logisticsServices | object | 否 | 增值服务（对象细节待补充） |
| receiverInfo | object | 是（待确认） | 收货方信息（对象细节待补充） |
| senderInfo | object | 否（待确认） | 发货人信息（对象细节待补充） |
| refunderInfo | object | 否（待确认） | 退货/退款人信息（对象细节待补充） |
| orderItemList | array | 是（待确认） | 订单商品列表（数组元素结构待补充） |
| orderAmountInfo | object | 否（待确认） | 订单金额信息（对象细节待补充） |
| customsDeclareInfo | object | 否（待确认） | 通关申报信息（对象细节待补充） |

## 3. 第二层结构（对象字段）

以下为你提供的“第二层细节”字段表，后续如果你继续补充第三层（如 `expiryInfo`、`labelInfo` 等内部字段），我会再往下展开。

### 3.1 `receiverInfo`（收货方信息）

| 字段 | JSON 类型 | 文档类型 | 长度 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| zipCode | string | String | 99 | 否 | 123214 | 邮编 |
| country | string | String | 512 | 是 | 中国 | 国家（编码方式，如中国就传 `CN`） |
| province | string | String | 512 | 是 | 浙江 | 省份 |
| city | string | String | 512 | 是 | 杭州 | 城市，根据实际情况传值；若消费者下单时没有城市则传 `/` |
| district | string | String | 512 | 是 | 西湖区 | 区/县，根据实际情况传值；若消费者下单时没有区县则传 `/` |
| town | string | String | 512 | 否 | 蒋村街 | 镇/街道 |
| address | string | String | 512 | 是 | 55号 | 详细地址，必须填写 |
| name | string | String | 99 | 是 | 张三 | 收件人名称 |
| contactNo | string | String | 99 | 是 | 13366896782 | 收件人联系电话；如为座机需传 “座机区号+座机号码” |

### 3.2 `senderInfo`（发件人信息）

| 字段 | JSON 类型 | 文档类型 | 长度 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| zipCode | string | String | 99 | 否 | 123214 | 邮编 |
| country | string | String | 512 | 是 | 中国 | 国家（编码方式，如中国就传 `CN`） |
| province | string | String | 512 | 是 | 浙江 | 省份 |
| city | string | String | 512 | 是 | 杭州 | 城市，根据实际情况传值；若消费者下单时没有城市则传 `/` |
| district | string | String | 512 | 是 | 西湖区 | 区/县，根据实际情况传值；若消费者下单时没有区县则传 `/` |
| town | string | String | 512 | 否 | 蒋村街 | 镇/街道 |
| address | string | String | 512 | 是 | 55号 | 详细地址，必须填写 |
| name | string | String | 99 | 是 | 张三 | 发件人姓名（菜鸟会将该字段打印到电子面单上【发件人】位置） |
| contactNo | string | String | 99 | 是 | 13366896782 | 发件人联系方式（菜鸟会将该字段打印到电子面单上【发件人联系方式】位置） |
| senderPoi | string | String | 12 | 否 | 寄件人poi | 海免场景下为 poi |

### 3.3 `refunderInfo`（退货人信息）

| 字段 | JSON 类型 | 文档类型 | 长度 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| zipCode | string | String | 99 | 否 | 123214 | 邮编 |
| country | string | String | 512 | 是 | 中国 | 国家（编码方式，如中国就传 `CN`） |
| province | string | String | 512 | 是 | 浙江 | 省份 |
| city | string | String | 512 | 是 | 杭州 | 城市，根据实际情况传值；若消费者下单时没有城市则传 `/` |
| district | string | String | 512 | 是 | 西湖区 | 区/县，根据实际情况传值；若消费者下单时没有区县则传 `/` |
| town | string | String | 512 | 否 | 蒋村街 | 镇/街道 |
| address | string | String | 512 | 是 | 55号 | 详细地址，必须填写 |
| name | string | String | 99 | 是 | 张三 | 姓名 |
| contactNo | string | String | 99 | 是 | 13366896782 | 联系电话 |

### 3.4 `orderItemList[]`（订单商品）

| 字段 | JSON 类型 | 文档类型 | 长度 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| itemId | string | String | 99 | 是 | 12313 | 菜鸟系统生成的货品ID；可在 GOS【货品-货品管理-货品管理】查看 |
| itemCode | string | String | 99 | 否 | 12313 | 菜鸟货品外键，与货品ID 1:1 对应 |
| extItemId | string | String | 99 | 否 | 12313 | 外部商品ID |
| orderSourceCode | string | String | 99 | 否 | 12313 | 交易编码 |
| subSourceCode | string | String | 99 | 否 | 12313 | 子交易编码 |
| itemQuantity | integer | Integer | - | 是 | 1 | 商品数量 |
| inventoryType | string | String | 99 | 否 | GOOD | 接口传值为空时默认为良品 |
| inventoryChannel | string | String | 99 | 是 | 非淘ToC | 库存渠道字段；库存分组管理方案下用于区分货物所在管理要求（默认“非淘ToC”） |
| declareInfo | object | DeclareInfo | - | 是 | - | 申报信息（见 3.5） |
| isGift | string | String | 99 | 否 | 0 | 是否赠品：`0` 非赠品、`1` 赠品；不填默认非赠品 |
| individualDelivery | string | String | 99 | 否 | 0 | 商品独立发货：`0` 不需要、`1` 需要；不填默认 `0` |
| rfid | string | String | 99 | 否 | abc | RFID 标签号 |
| extendFields | object | Map<String,String> | - | 否 | - | 拓展属性 |
| expiryInfo | object | ExpiryInfo | - | 否 | - | 效期信息（如需要指定效期发货则必填；内部字段待补充） |
| traceableCodeSet | array | List<String> | - | 否 | - | 溯源码 |
| labelInfo | object | LabelInfo | - | 否 | - | 货品标签信息（内部字段待补充） |

### 3.5 `orderItemList[].declareInfo`（申报信息）

金额字段单位以文档说明为准（截图示例为“分”）。

| 字段 | JSON 类型 | 文档类型 | 长度 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| itemTotalPrice | integer | Long | - | 是 | 9000 | 商品总价（优惠前），单位为“分” |
| itemTotalActualPrice | integer | Long | - | 是 | 9000 | 商品总价（优惠后），单位为“分” |
| customsTax | integer | Long | - | 是 | 1000 | 商品关税，单位为“分” |
| consumptionTax | integer | Long | - | 是 | 1000 | 商品消费税，单位为“分” |
| vat | integer | Long | - | 是 | 1000 | 商品增值税，单位为“分” |
| totalTax | integer | Long | - | 是 | 1000 | 商品综合税，单位为“分” |
| hscode | string | String | 64 | 否 | 6204430000 | 非必填；如果接口传值会校验菜鸟备菜数据与接口值是否匹配，不通过则发货失败 |
| firstUnit | string | String | 3 | 否 | 019 | 第一单位名称，填写单位对应编码；集货 rqfc 不能为空 |
| firstQuantity | string | String | 25 | 否 | 1.00 | 第一数量，格式 `N19,5`，最多 5 位小数；集货 rqfc 不能为空 |
| secondUnit | string | String | 3 | 否 | 035 | 第二单位名称，填写单位对应编码 |
| secondQuantity | string | String | 25 | 否 | 1.00 | 第二单位数量，格式 `N19,5`，最多 5 位小数；第二单位有值时第二单位数量不能为空 |
| netWeight | string | String | 25 | 否 | 100.00 | 货品净重；集货 rqfc 第一重量与第二重量不为 kg 时必填 |
| originCountry | string | String | 16 | 否 | AA | 原产国 |
| itemPrice | integer | Long | - | 否 | 100 | 商品单价（海南免税场景专用）；用 `itemTotalActualPrice/quantity` 计算 |
| dfOccupyAmount | integer | Long | - | 否 | 100 | 占用免税额度 |
| dutiablePrice | integer | Long | - | 否 | 100 | 完税价格（海南免税场景专用） |
| customsRate | string | String | 99 | 否 | 12.2 | 税率 |
| taxQuantity | integer | Long | - | 否 | 1 | 征税件数 |
| dfQuantity | integer | Long | - | 否 | 1 | 免税件数 |

### 3.6 `orderAmountInfo`（订单金额信息）

金额字段单位以文档说明为准（截图示例为“分”）。

| 字段 | JSON 类型 | 文档类型 | 长度 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| dutiablePrice | integer | Long | - | 是 | 2100 | 订单完税价格，单位“分” |
| customsTax | integer | Long | - | 是 | 200 | 订单关税金额，单位“分” |
| consumptionTax | integer | Long | - | 是 | 200 | 订单消费税金额，单位“分” |
| vat | integer | Long | - | 是 | 200 | 订单增值税金额，单位“分” |
| totalTax | integer | Long | - | 是 | 200 | 订单综合税金额，单位“分” |
| insurance | integer | Long | - | 是 | 200 | 订单保险金额，单位“分” |
| coupon | integer | Long | - | 是 | 200 | 订单优惠金额，单位“分” |
| actualPayment | integer | Long | - | 是 | 8000 | 订单实付金额，单位“分” |
| postFee | integer | Long | - | 是 | 123 | 订单运费，单位“分” |
| currency | string | String | 16 | 是 | CNY | 传固定值：`CNY` |
| tradeReceiptUrl | string | String | 12 | 否 | http://123.htm | 小票信息 |

### 3.7 `customsDeclareInfo`（通关申报信息）

| 字段 | JSON 类型 | 文档类型 | 长度 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| buyerName | string | String | 99 | 是 | 张三 | 购买人的真实姓名 |
| buyerPlatformId | string | String | 512 | 是 | 1234 | 买家菜鸟平台ID |
| buyerIDType | string | String | 99 | 是 | 1 | 购买人身份证件类型，固定值 |
| buyerIDNo | string | String | 512 | 是 | 341024199XXXX37876 | 购买人身份证号码，支持 15/18 位身份证号码 |
| payerId | string | String | 100 | 是 | 123 | 支付人账号 |
| payChannel | string | String | 99 | 是 | ALIPAY,WEIXINPAY | 支付渠道编码 |
| payOrderId | string | String | 99 | 是 | 1234 | 支付平台单号 |
| nationality | string | String | 12 | 是 | CN | 传固定值：`CN` |
| contactNo | string | String | 12 | 是 | 1231231 | 订单人手机号 |
| payCardId | string | String | 99 | 是 | 13123123133 | 银联支付卡号 |
| buyerIDCardFrontPic | string | String | 1024 | 否 | http://xxx/66HzXyxxx.jpg | 身份证正面图片地址，C端海关必填 |
| buyerIDCardBackPic | string | String | 1024 | 否 | http://xxx/66HzXyxxx.jpg | 身份证反面图片地址，C端海关必填 |
| buyerIDCardPicType | integer | Integer | - | 否 | 1 | `1` url；`2` oss fileindex |
| gender | string | String | 16 | 否 | male | 性别 |
| buyerIDCardExpiryDate | string | Date | - | 否 | 2014-01-12 12:00:00 | 证件有效期 |
| buyerBirthDate | string | Date | - | 否 | 2014-01-12 | 购买人出生日期 |

## 4. 下一步待补充列表（第三层）

- `expiryInfo` 内部字段
- `labelInfo` 内部字段
- `departureInfo` 内部字段
- `logisticsServices` 内部字段
