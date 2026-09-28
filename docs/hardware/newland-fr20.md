# Barcode scanning — Newland FR20

How scanning works in the Lorma Beauty POS, how to configure the scanner, and
how to test without one.

| | |
| --- | --- |
| Supported scanner | Newland FR20 2D Scanner |
| Serial number in use | FR20E25310017 |
| Connection | USB |
| Required mode | **USB HID-KBW** (keyboard emulation) |
| Required suffix | **ENTER / CR** after each successful scan |

The scanner is plugged into the cashier's workstation and types into the
browser. Nothing in the backend talks to USB, and the browser does not use
WebUSB or WebHID.

```
Newland FR20  →  USB HID-KBW  →  POS sale screen  →  existing product lookup
                                                   →  existing cart  →  checkout
```

---

## How scanning works

The scanner is simply another way to pick a product. It resolves a barcode to
the same product object the POS already uses, then hands it to the same
add-to-cart call the product grid uses. Prices, stock limits, expiry rules,
discounts and totals are unchanged — the scanner owns none of them.

**Scanning is always ready on Till → Sell.** There is no scan button, no modal,
and no field to click into. The cashier scans, the product appears in the cart,
and they scan the next one.

| What happens | Result |
| --- | --- |
| Product exists | Added to the cart at quantity 1 |
| Same product scanned again | Quantity increments — 1 → 2 → 3 … |
| Product not found | Toast: *Product not found: `<barcode>`*. Nothing is added; the till stays ready |
| Product out of stock | Not added. The POS's existing stock message is shown |
| Product expired | Not added. The POS's existing expiry message is shown |
| Empty or very short read | Ignored silently |

Barcode values are treated as **strings** throughout. `0012345678905` stays
`0012345678905` — leading zeros are never stripped and the value is never
converted to a number.

Any symbology the FR20 decodes works: EAN-13, EAN-8, UPC, Code 128, Code 39,
QR and the rest. No barcode length is hard-coded.

### Lookup order

1. The catalogue cached on the device (IndexedDB, indexed by barcode) — an
   indexed local read, so a scan costs nothing perceptible and works offline.
2. `GET /products/barcode/:barcode` — the endpoint the POS already exposes, for
   a product created since this device last synced.

---

## Typing still works

The scanner is an addition, not a replacement.

- Search by name, SKU or brand exactly as before.
- Type a barcode into the same search box and press Enter — it is looked up as
  a barcode, and if there is no match the text simply remains a search term.

The field reads **"Search product or scan barcode…"**.

### Typing is never mistaken for a scan

The FR20 delivers a whole barcode in a few milliseconds per character; a person
cannot type that fast. The POS only treats input as a scan when it arrives at
machine speed, so searching, entering a customer name, a quantity, a discount,
a payment amount or a note is untouched — as are the POS keyboard shortcuts
(F2, F4, F8, F9).

Enter is only claimed when the characters before it arrived at scanner speed,
so Enter still submits forms normally.

---

## Configuring the FR20

Scan the programming barcodes in the **Newland FR20 user manual** supplied with
the unit to set:

1. **USB HID-KBW** interface mode (this is usually the factory default).
2. **ENTER / CR** as the terminating suffix.

> The programming barcodes are not reproduced here. They are specific encoded
> payloads defined by Newland, and a guessed or mistyped one risks putting the
> scanner into a state that needs a factory reset. Use the manual for the unit
> in your hand.

If your unit is configured differently, **Till → Scanner** adjusts how reads are
interpreted without a rebuild:

| Setting | Default | Purpose |
| --- | --- | --- |
| Minimum barcode length | 4 | Ignores stray keystrokes |
| Max gap between characters | 40ms | Above this, input is typing, not scanning |
| Idle completion | 90ms | Completes a read when no Enter is sent |
| Same-code cooldown | **0** | Leave at 0 — scanning one item five times must add five |
| Prefix / suffix to strip | none | If the scanner wraps each read |
| End-of-scan key | Enter, Tab | Whichever terminator the scanner sends |

---

## Testing without the scanner

Everything can be exercised with a keyboard.

**In the app.** Open **Till → Scanner**, type a barcode into the test box and
press Enter. It runs the same path a real scan takes and shows exactly what was
received, how long the read took, and whether the catalogue matched — without
adding anything to a cart.

On **Till → Sell**, typing a barcode into the search box and pressing Enter adds
the product to the cart, exactly as scanning would.

**In tests.** Two suites cover this, both run against a simulated DOM with a
controlled clock so "fast" and "slow" mean exactly what they say:

```bash
cd frontend
npm run check:scanner        # the decoder: scan vs typing, terminators, prefixes
npm run check:scan-to-cart   # the whole flow: scan → lookup → cart
npm run check                # everything (69 checks)
```

`check:scan-to-cart` drives the real decoder, the real scanner manager and the
real cart store together, covering: valid scan adds at quantity 1, a repeat
scan increments, five scans give five, several products in rapid succession,
unknown barcodes, out-of-stock products, leading zeros, empty scans, stray
Enter keys, that typing a search term adds nothing, and that quantity editing,
removal, totals, hold and retrieve all still behave as before.

---

## Troubleshooting

Work down this list; each step rules out a layer.

**1. Is the scanner sending anything at all?**
Open a plain text editor and scan a product. If no characters appear, the
problem is the scanner or the cable, not the POS. If characters appear but no
Enter/newline follows, the suffix is not configured.

**2. Does the POS see the scan?**
Go to **Till → Scanner** and scan. The test panel shows every read, including
ones that match no product. If the editor shows the barcode but this panel does
not, the read is arriving too slowly — raise *Max gap between characters* to
about 60ms.

**3. Does the barcode resolve?**
If the test panel shows the code with *Not in catalogue*, scanning is working
perfectly and the barcode is simply missing from the product. Add it in
**Back office → Products**.

**Other symptoms**

| Symptom | Cause |
| --- | --- |
| The barcode gets typed into the search box | The read was slower than the key-interval threshold. Raise it |
| Enter no longer submits forms | The threshold is too high. Lower it |
| Extra characters at the start or end of each code | The scanner is programmed with a prefix/suffix. Read the `raw:` value on the Scanner page and set them to be stripped |
| One product adds itself repeatedly without scanning | An auto-sense unit is re-reading an item left on the plate. Set the same-barcode delay on the scanner, or raise *Same-code cooldown* |
| Scanning does nothing during payment | Intentional. Scanning is suspended while the payment dialog is open so a stray read cannot alter a cart money is being taken for |

---

## Offline

Scanning is entirely local. The scanner talks to the browser, and the browser
resolves the barcode against the catalogue cached on the device. No network is
involved in a scan, so the till scans and sells exactly the same with the
internet down.

The only network-dependent case is a product created since this device last
synced, which falls back to the API and will report *not found* while offline.

---

## Extending this later

The input layer is deliberately separate from the lookup and cart:

```
KeyboardWedge  →  ScannerManager  →  existing product lookup  →  existing cart
```

`ScannerManager` knows nothing about products, prices or stock; it turns
keystrokes into a barcode string and emits it. A different input source — a
serial connection, a camera, a native bridge — would plug in at the same seam
without touching anything downstream.

HID-KBW was chosen for the first implementation because it needs no drivers, no
permissions and no browser APIs beyond keyboard events, and works identically
on every workstation.

---

## Assumptions and limits

- **The scanner is configured for HID-KBW with an ENTER suffix.** Both are
  adjustable from the Scanner page if your unit differs.
- **Hardware presence cannot be detected.** In keyboard mode the browser cannot
  tell whether a scanner is plugged in, so the POS never claims "scanner
  connected" — it only reports whether it is ready to accept a scan.
- **Not verified against the physical unit.** This was written without an FR20
  to hand. The decoder is covered by automated checks against a simulated
  scanner, but the first real scan should be confirmed on the Scanner page,
  which shows the raw value received.
- **On tablets and phones**, where no scanner is attached, nothing changes:
  manual search works as before and the scanner code simply never fires.
