# Receipt printing — AnyPay thermal printer

| | |
| --- | --- |
| Printer | AnyPay thermal receipt printer |
| Paper | 80mm roll |
| Connection | Attached to the cashier's workstation (USB or network) |
| Driver | Installed on the workstation, set as the default printer |

The POS prints through the workstation's own printer driver, the same way any
program prints. Nothing in the backend talks to the printer, and the browser
uses no special APIs — which is why this works on any machine where the printer
already works.

```
Sale completes  →  receipt rendered  →  browser print  →  OS driver  →  paper
```

---

## Setting up a till

**1. Install the printer on the workstation** using the AnyPay driver, and
print the driver's own test page. If that does not print, stop here — the
problem is not the POS.

**2. Set it as the default printer.** The browser prints to the default; if it
is not, the cashier has to pick the printer on every sale.

**3. Set the paper size in the driver** to the 80mm roll profile. Thermal
drivers usually ship a `80 x Receipt` or `80mm x 297mm` size. Getting this
wrong is the most common cause of a receipt that prints then ejects a long
blank strip.

**4. Check it from the POS.** Open **Till → Devices → Test print**. A sample
receipt appears; press Print. Nothing is recorded — it is only paper.

---

## Printing without a dialog

By default the browser opens its print dialog on every sale. That is a click
per customer, and it is the single biggest slowdown at a busy counter.

**A web page cannot suppress that dialog.** There is no API for it, and there
should not be — any site could then print silently. It has to be enabled on the
workstation, once.

### Chrome / Edge kiosk printing

Launch the browser with `--kiosk-printing`. It prints immediately to the
default printer with no dialog.

**Windows** — edit the shortcut used to open the POS:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=http://<pos-host>:3200/till
```

**Linux**

```bash
google-chrome --kiosk-printing --app=http://<pos-host>:3200/till
```

`--app=` also removes the address bar and tabs, which is what you want on a
till anyway.

Once that is in place, turn on **Print automatically when a sale completes** in
**Till → Devices**. The flow becomes: take payment → receipt prints → next
customer, with nothing to click.

> Enable auto-print only *after* kiosk printing works. Without it, auto-print
> just opens the dialog by itself, which is worse than the button.

---

## Settings

**Till → Devices → Receipt printer.** Stored per device, so two tills can have
different printers.

| Setting | Default | Notes |
| --- | --- | --- |
| Paper width | 80mm | 58mm is available for compact printers |
| Margin | 3mm | Increase if the driver clips the edges |
| Print automatically | Off | Turn on once kiosk printing works |

The receipt is laid out in a monospace font: about 44 characters per line at
80mm, 32 at 58mm.

---

## What gets printed

The same receipt the cashier sees on screen (§16 of the build spec):

```
LORMA BEAUTY
Skincare & Beauty

Receipt #: LMB-000001
Date / Cashier / Customer

Product              Qty       Amount
...

Subtotal / Discount / TOTAL
Payment method, tendered and change for cash

Thank you for shopping with Lorma Beauty.
```

An offline sale prints with a **PENDING SYNC** marker, so a reprinted copy is
never mistaken for one the server has confirmed.

Receipts can also be reprinted later from **Till → Receipts** and from
**Back office → Sales**.

### Why the receipt prints in black only

Thermal paper has one colour. Brand colours would be dithered by the driver
into grey blocks that read as smudges, so everything inside the receipt is
forced to pure black on white at print time.

### Why the page length is "auto"

A receipt roll has no page length. Printing to a fixed page either pads the
receipt with blank paper or clips it, so the page size is `80mm auto` — the
page ends where the content ends, which is also where the driver's auto-cutter
fires.

---

## Troubleshooting

Work down the list; each step rules out a layer.

**1. Does the printer work at all?** Print the driver's test page from the
operating system. If that fails, it is a driver, cable or power problem.

**2. Does the POS reach it?** **Till → Devices → Test print**. If the dialog
appears but no paper comes out, the wrong printer is selected — check the
default.

**3. Is the sale receipt right?** Complete a sale and press Print receipt.

| Symptom | Cause |
| --- | --- |
| A long blank strip after each receipt | The driver's paper size is a fixed page, not a receipt roll. Set the 80mm receipt profile |
| Text runs off the right edge | Paper width is set to 80mm but the printer is 58mm, or the margin is too small |
| Grey, smeared text | The driver is dithering. Check it is set to text/black-and-white, not photo |
| The dialog appears on every sale | Kiosk printing is not enabled — see above |
| Nothing happens on Print | A pop-up or print blocker in the browser, or no default printer set |
| Auto-print does nothing | It is off by default. Turn it on in Till → Devices |

---

## Assumptions and limits

- **The printer is installed and default on each workstation.** The POS does
  not choose a printer; it prints to whatever the browser prints to.
- **Silent printing needs a browser flag.** It cannot be enabled from the app.
- **Not verified against the physical AnyPay unit.** The print path is the
  standard browser one and the layout is checked against the 80mm geometry, but
  the first real receipt should be confirmed with a test print — particularly
  the driver's paper-size profile, which is where thermal printers usually go
  wrong.
- **Printing is a workstation concern, not a server one.** A till with no
  printer still sells; printing simply does nothing. If receipts ever need to
  print without a browser — a kitchen ticket, a remote printer — that would be
  an IP printer driven from the backend, which is a different design.
