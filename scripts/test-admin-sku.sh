#!/bin/bash
set -e

BASE_URL="http://localhost:8081/api/admin/products"
echo "Starting Admin SKU Tests..."

# 1. Get SPU ID
echo "Fetching SPUs..."
SPU_RESP=$(curl -s "$BASE_URL/spu?page=1&pageSize=1")
# Extract SPU ID using grep and cut (simple JSON parsing)
# Looking for "items":[{"id":"..."
SPU_ID=$(echo $SPU_RESP | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SPU_ID" ]; then
  echo "No SPU found. Cannot proceed with SKU test."
  echo "Response: $SPU_RESP"
  exit 1
fi
echo "Found SPU ID: $SPU_ID"

# 2. Create SKU
echo "Creating SKU..."
CREATE_PAYLOAD='{"spuId":"'$SPU_ID'","price":100,"wholesalePrice":80,"stock":10,"cargoId":"TEST-SKU-001","description":"Test SKU"}'
CREATE_RESP=$(curl -s -X POST "$BASE_URL/sku" -H "Content-Type: application/json" -d "$CREATE_PAYLOAD")
SKU_ID=$(echo $CREATE_RESP | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SKU_ID" ]; then
  echo "Failed to create SKU. Response: $CREATE_RESP"
  exit 1
fi
echo "Created SKU ID: $SKU_ID"

# 3. Get SKU
echo "Fetching SKU details..."
GET_RESP=$(curl -s "$BASE_URL/sku/$SKU_ID")
# echo "SKU Details: $GET_RESP"

# 4. Update SKU
echo "Updating SKU stock..."
UPDATE_PAYLOAD='{"spuId":"'$SPU_ID'","price":100,"wholesalePrice":80,"stock":20,"cargoId":"TEST-SKU-001","description":"Test SKU Updated"}'
UPDATE_RESP=$(curl -s -X PUT "$BASE_URL/sku/$SKU_ID" -H "Content-Type: application/json" -d "$UPDATE_PAYLOAD")
# echo "Update Response: $UPDATE_RESP"

# 5. Delete SKU
echo "Deleting SKU..."
DELETE_RESP=$(curl -s -X DELETE "$BASE_URL/sku/$SKU_ID")
# echo "Delete Response: $DELETE_RESP"

# 6. Verify Deletion
echo "Verifying deletion..."
VERIFY_RESP=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/sku/$SKU_ID")
if [ "$VERIFY_RESP" == "404" ]; then
  echo "SKU successfully deleted (404 Not Found)."
else
  echo "SKU still exists or error occurred. HTTP Code: $VERIFY_RESP"
fi

echo "Admin SKU Tests Completed."
