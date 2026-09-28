# Barcodes and stock management

How barcodes identify products, and how stock is received and counted.

---

## One product, many barcodes

A product can carry several barcodes. All of them resolve to the same
product at the same price.

```
Cocoa Body Lotion 400ml   GHS 62.00
  6001234500284   primary
  6001234500291   active
  6001234500307   active
```

This happens for real reasons: a supplier reprints the code between
production runs, a multipack carries its own, or every unit is
individually barcoded.

**Price lives on the product, never on a barcode.** A price change is one
edit, and it cannot drift between codes.

```
Barcode  →  Product  →  Price
```

### Two barcode modes

| Mode | Meaning | Repeat scan |
| --- | --- | --- |
| **Shared** *(default)* | One code printed on every unit — normal retail | Counts another unit |
| **Serialized** | Every unit has its own code | Rejected: it is the same physical item |

Set at product creation. It changes what a repeat scan means, so it is not
editable afterwards.

### Managing them

**Products → Edit → Barcodes.** Scan or type to add. One barcode is the
primary; the rest are alternates. Retiring a code keeps it on record but
stops it resolving.

A code already on another product is refused, and the message names that
product — the usual cause is scanning a neighbouring item by mistake.

---

## Sizes

A product sold in more than one size — Small/Medium/Large, or 200ml/400ml —
holds each size as **a product in its own right**, sharing a `variantGroupId`.
That is deliberate. A size is not an attribute: it is counted, priced,
scanned, received and sold separately, and every one of those already works
per product. Modelling a size as anything less would mean building stock,
batches, barcodes and count lines a second time, one level down.

What the group adds is presentation. The till shows **one tile per article**
with the number of sizes and the lowest price, and asks which size on tap,
each button carrying its own price and stock. Scanning a size's barcode skips
the chooser entirely and goes straight into the cart, because a scan has
already named one size exactly.

| Concern | Where it lives |
|---|---|
| Price, cost | Per size |
| Stock, batches, movements | Per size |
| Barcodes | Per size |
| Name, category, brand, unit, expiry tracking | Shared from the article |

Labels are free text, so `Large` and `250g` are equally valid, and are unique
within a group. Order is `variantSort`, not alphabetical — otherwise "Extra
Large" sorts before "Small".

Receipts, movements and reports show `Article — Size`, denormalised at the
moment of sale so a reprint stays accurate. The grouping travels in the sync
payload, so the till groups identically with no connection.

Adding the first size also names the stock the product already has: that stock
is a size too, and leaving it unlabelled would strand it outside its own group.
Separating a size makes it a standalone product again, keeping its stock and
barcodes; if that would leave a group of one, the survivor is ungrouped too,
because one size is not a set. `test/product-sizes.e2e-spec.ts` covers it.

## Deleting a product

**Delete** sits beside Edit and Price on the products page, behind
`product.deactivate` — an administrator permission, not the one that allows
editing. What it does depends on whether the product has ever been sold, and
the server decides, because only it knows:

| | |
|---|---|
| Never sold | Deleted outright, along with its inventory row, batches, movements and barcodes. Its barcodes become free for another product to use. |
| Has sale lines | Taken off sale (`isActive = false`) and kept. Past receipts, returns and reports keep resolving. |

This is §51.14: a product with history is deactivated, never removed, because
its sale lines must keep pointing at a real product. Trying to remove a sold
product that is already off sale is refused rather than silently repeated.

Both outcomes are written to the audit log, and the deletion entry carries the
name and SKU so it stays legible after the product itself is gone. A
deactivated product stops resolving at the till immediately, by name and by
barcode. `test/product-delete.e2e-spec.ts` holds both branches.

## Stock at product creation

**Quantity in stock** on the Add product form is how many units are on the
shelf at the moment the product is created. It is written as an
`OPENING_BALANCE` movement, so the figure never appears without a ledger
entry explaining it, and every sale reduces it from there.

A product that tracks expiry sells from batches, first-expiry-first-out,
rather than from the stock figure. Opening stock on such a product therefore
also asks for a batch number and expiry date, and is refused without them.
Before this was enforced, the units were written to the stock figure with no
batch behind them: the product read as in stock everywhere and then failed
every sale with `INSUFFICIENT_STOCK` / "available 0". `test/opening-stock.e2e-spec.ts`
holds that case.

Leaving the quantity at 0 and bringing the stock in through **Receive stock**
is equally valid, and is the better route when there is a supplier invoice to
record against it.

## Receiving stock

**Inventory → Receive stock.** Scan the delivery in; each scan adds a unit.
Batch-tracked products ask for a batch number and expiry per line.

Nothing changes until **Confirm**: the whole receipt posts as one
transaction, so a delivery is never half recorded because the connection
dropped. A single invalid line rolls the entire receipt back.

Within one delivery, a serialized code scanned twice is flagged rather than
counted twice.

---

## Stock counts

**Inventory → Stock counts → New stock count.**

The rule that shapes everything: **counting never changes stock.**

```
System stock:     50
Physical count:   47
Variance:         -3      ← recorded, not applied
```

Counted figures sit on the count document until someone approves it. A
half-finished count, or one with an obvious miscount, can never silently
rewrite the shop's stock.

### Counting

Scanning is live the whole time — no field to click back into. Each scan
adds one, and the line updates immediately.

| Feedback | Meaning |
| --- | --- |
| `✓ Product counted · Counted: 17` | Recorded |
| `⚠ This barcode has already been counted` | Serialized unit, already seen |
| `✕ Unknown barcode` | Not in the catalogue — offers to create the product |

Quantities can also be typed directly, for bulk lines nobody wants to scan
one at a time.

Only one count may be open at a time: two counts would each capture a
different system quantity and fight over the same stock on approval.

### Review and approval

The review table shows system, counted and variance per product, with
shortages and overages totalled.

On **Approve**, in one transaction:

1. Stock is set to the counted figure for each product
2. A `STOCK_COUNT` movement is written with previous → new
3. The count is marked approved and **frozen** — it can never be edited again

A cancelled count keeps its figures for the record but changes nothing.

Approving needs `stockcount.approve`, which is separate from
`stockcount.manage` — so counting and authorising the adjustment can be
different people.

---

## Movement history

**Inventory → Movements.** Every change to stock, with what it was, what it
became, why, and who did it.

```
STOCK_IN      +24   0 → 24   Delivery, invoice INV-8842
STOCK_COUNT   -47  50 → 3    Stock count SC-000001: End of month
SALE           -1  33 → 32   Sold on receipt LMB-000011
```

No quantity changes anywhere in the application without a row appearing
here.

---

## Unknown barcodes

A barcode that matches nothing is never silently ignored. It offers:

- **Add new product** — opens the product form with the barcode filled in
- **Scan again** — for a mis-scan

To attach it to an existing product instead, use **Products → Edit →
Barcodes**.

---

## Assumptions

- **No branches or locations.** The application has a single stock
  location, so counts and movements carry no `branch_id`. Adding branches
  later means a column on inventory, movements and counts.
- **Serialized receiving is deduplicated within a delivery**, not across
  all time. Receiving the same serial in two separate deliveries is not
  currently blocked.
- **Sales/checkout barcode scanning is unchanged** by this work. It uses
  the same lookup, so it picked up multi-barcode support automatically.
