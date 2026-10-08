#!/usr/bin/env bash
# Creates ./demo-repo: a tiny git project with history, TODOs and a node:test suite, to point RepoPilot at.
set -euo pipefail
cd "$(dirname "$0")"
[ -d demo-repo ] && { echo "demo-repo already exists"; exit 0; }
mkdir -p demo-repo/src demo-repo/test && cd demo-repo
git init -q -b main
git config user.name "Dev Aiper"; git config user.email "dev@example.com"
export GIT_AUTHOR_DATE GIT_COMMITTER_DATE
c() { GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git commit -q -m "$2"; }
cat > README.md <<'EOF'
# Tiny Shop
A toy shop library used to demo RepoPilot.
EOF
cat > package.json <<'EOF'
{ "name": "tiny-shop", "version": "1.0.0", "type": "module", "scripts": { "test": "node --test" } }
EOF
cat > src/cart.js <<'EOF'
export function total(items) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
EOF
git add -A; c "2026-09-20T10:00:00" "Initial commit: cart total"
cat > src/discount.js <<'EOF'
// TODO: support percentage discounts
export function applyDiscount(amount, code) {
  return code === "SAVE10" ? amount - 10 : amount;
}
EOF
cat > test/cart.test.js <<'EOF'
import { test } from "node:test";
import assert from "node:assert/strict";
import { total } from "../src/cart.js";
test("total sums price times qty", () => {
  assert.equal(total([{ price: 5, qty: 2 }, { price: 1, qty: 3 }]), 13);
});
test("total of empty cart is zero", () => {
  assert.equal(total([]), 0);
});
EOF
git add -A; c "2026-09-28T14:30:00" "Add discount codes and cart tests"
cat > src/shipping.js <<'EOF'
// TODO: free shipping above 50
// FIXME: handle international addresses
export function shipping(amount) {
  return amount > 50 ? 0 : 4.99;
}
EOF
cat >> test/cart.test.js <<'EOF'
test("discount applies", async () => {
  const { applyDiscount } = await import("../src/discount.js");
  assert.equal(applyDiscount(100, "SAVE10"), 90);
});
EOF
git add -A; c "2026-10-03T09:15:00" "Add shipping calculation"
echo "// perf: avoid reduce on hot path" >> src/cart.js
git add -A; c "2026-10-05T16:45:00" "Note a perf idea in cart"
printf 'API_KEY=super-secret\n' > .env   # untracked on purpose: Part 8 shows it cannot be read
echo "Demo repo ready: $(pwd)"
