---
name: "refund-api-helper"
description: "Generates frontend API service code for the Refund module. Invoke when user needs frontend code for refund application, cancellation, list, or admin audit."
---

# Refund API Helper

This skill assists in generating and implementing frontend API service code for the Refund module in the Allmax system. It encapsulates the User and Admin API definitions, status enums, and usage examples.

## Core Functionality

Provides ready-to-use Javascript/TypeScript code for interacting with the backend refund endpoints.
- **User/Shop Endpoints**: `/api/shop/refund/*`
- **Admin Endpoints**: `/api/admin/refunds/*`

## API Overview

### User APIs (Storefront)
- **Apply**: `POST /api/shop/refund/apply` (Create refund request, status=10)
- **Cancel**: `POST /api/shop/refund/cancel` (Cancel pending request, status 10 -> 60)
- **List**: `POST /api/shop/refund/list` (My refunds, filter by `userId`)
- **Detail**: `POST /api/shop/refund/detail` (View refund details)

### Admin APIs (Back-office)
- **List**: `GET /api/admin/refunds` (Manage refunds, filter by status/orderId/refundNo)
- **Detail**: `GET /api/admin/refunds/:refundNo` (View details including proofs)
- **Approve**: `POST /api/admin/refunds/:refundNo/approve` (Approve refund, trigger payment)
- **Reject**: `POST /api/admin/refunds/:refundNo/reject` (Reject refund)

## Status Enums

| Value | Code | Description | Actionable |
| :--- | :--- | :--- | :--- |
| **10** | `TO_AUDIT` | 待审核 | User Cancel, Admin Approve/Reject |
| **20** | `THE_APPROVED` | 退款中 | Waiting for payment callback |
| **50** | `COMPLETE` | 已完成 | View Only |
| **60** | `CLOSED` | 已关闭 | View Only |

## Template Code

The following code is the standard implementation for `refundService.js`:

```javascript
/**
 * Refund Service API Module
 */
import request from '@/utils/request'; // Adjust based on project structure

// ==========================================
// 🛒 User APIs (Shop)
// Base URL: /api/shop/refund
// ==========================================

/**
 * Apply for Refund
 * @param {Object} data
 * @param {string} data.orderId - Required
 * @param {string} data.refundReason - Required
 * @param {Array<Object>} [data.items] - Optional, [{skuId, count}]
 * @param {Array<string>} [data.imageUrls] - Optional, proof images
 * @param {string} [data.refundMemo] - Optional, user remarks
 */
export function applyRefund(data) {
  return request({ url: '/api/shop/refund/apply', method: 'post', data });
}

/**
 * Cancel Refund Application
 * @param {Object} data
 * @param {string} data.refundNo - Required
 * @param {string} [data.orderId] - Recommended for validation
 */
export function cancelRefund(data) {
  return request({ url: '/api/shop/refund/cancel', method: 'post', data });
}

/**
 * Get My Refund List
 * @param {Object} params
 * @param {string} params.userId - Required
 * @param {number} [params.page=1]
 * @param {number} [params.pageSize=10]
 */
export function getMyRefundList(params) {
  return request({ url: '/api/shop/refund/list', method: 'post', data: params });
}

/**
 * Get Refund Detail (User)
 * @param {Object} data - { refundNo } or { orderId }
 */
export function getRefundDetail(data) {
  return request({ url: '/api/shop/refund/detail', method: 'post', data });
}

// ==========================================
// 🛡️ Admin APIs (Back-office)
// Base URL: /api/admin/refunds
// ==========================================

/**
 * Get Admin Refund List
 * @param {Object} params - status, orderId, refundNo, page, pageSize
 */
export function getAdminRefundList(params) {
  return request({ url: '/api/admin/refunds', method: 'get', params });
}

/**
 * Get Admin Refund Detail
 * @param {string} refundNo
 */
export function getAdminRefundDetail(refundNo) {
  return request({ url: `/api/admin/refunds/${refundNo}`, method: 'get' });
}

/**
 * Approve Refund
 * @param {string} refundNo
 * @param {Object} data - { refundReason (opt) }
 */
export function approveRefund(refundNo, data = {}) {
  return request({ url: `/api/admin/refunds/${refundNo}/approve`, method: 'post', data });
}

/**
 * Reject Refund
 * @param {string} refundNo
 * @param {Object} data - { rejectReason }
 */
export function rejectRefund(refundNo, data) {
  return request({ url: `/api/admin/refunds/${refundNo}/reject`, method: 'post', data });
}
```
