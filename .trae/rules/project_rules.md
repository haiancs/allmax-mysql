---
alwaysApply: false
description: 
---
# Integrations 接口规则

适用范围：创建新接口、Review 现有接口

## 分层与职责
- Routes 只做参数校验、调用 domain、返回响应
- Domain 负责业务流程编排与事务控制
- Repo 只做数据访问与字段兼容处理
- Utils 放通用校验/格式化工具

## 路由规范
- 路由入口必须先 checkConnection，失败统一 503
- 返回结构统一 { code, message, data } 或 { code, data }
- 分页参数必须校验，pageSize 设置上限
- 禁止在 routes 内写 sequelize.query

## 状态与字段
- 状态枚举集中定义并复用，禁止魔法数字
- 退款/支付回调落库放 repo，路由只解析转调

## 依赖边界
- integrations 内仅通过 domains/repos/utils 互相调用
- 不跨层直连外部系统

## 日志与安全
- 不记录敏感信息
- 对外错误信息统一格式化
