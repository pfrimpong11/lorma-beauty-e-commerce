# Lorma Beauty POS — Version 1 Build Prompt

You are a senior full-stack software architect, product engineer, UI/UX designer, and DevOps
engineer.

Build a production-ready Version 1 POS and Retail Management System for a skincare and beauty
retail business called:

**LORMA BEAUTY**

The application should be called:

**Lorma Beauty POS**

The immediate objective is NOT to build a full ecommerce platform.

Version 1 is an in-store POS and retail management system focused on helping Lorma Beauty:

1. Sell products quickly and efficiently.
2. Track inventory accurately.
3. Manage customers.
4. Manage cashiers and staff.
5. Track cashier shifts and cash.
6. Manage returns and refunds.
7. Monitor sales and business performance.
8. Continue operating during poor or unavailable internet connectivity.
9. Automatically synchronize offline transactions when internet connectivity returns.

The architecture must be modular and extensible so that future versions can add ecommerce,
customer mobile applications, loyalty, skincare recommendations, online ordering, delivery,
AI assistance, etc. without requiring a major rewrite.

Do NOT overbuild Version 1.

Focus on making Version 1 production-ready, polished, reliable, fast, and genuinely usable by
a real retail shop.

---

## 1. TECHNOLOGY STACK

**Frontend:**

- Next.js
- TypeScript
- Tailwind CSS
- Framer Motion
- Poppins from Google Fonts
- Progressive Web App (PWA)
- Responsive design for desktop, laptop, tablet, and mobile

**Backend:**

- NestJS
- TypeScript
- REST API

**Database:**

- PostgreSQL

**Icons:**

- Icons8
- https://icons8.com/

Use Icons8 consistently throughout the application.

Do not introduce unnecessary frontend frameworks or libraries.

Use reusable components and clean architecture.

---

## 2. BUSINESS IDENTITY

Business name:

    LORMA BEAUTY

Application name:

    Lorma Beauty POS

Browser title:

    Lorma Beauty | POS & Retail Management

PWA name:

    Lorma Beauty POS

Use "Lorma Beauty" consistently throughout:

- Login screen
- Sidebar
- Header
- Dashboard
- POS
- Receipts
- Reports
- PWA manifest
- Browser metadata
- Notifications where appropriate
- Print layouts
- Empty states
- Documentation
- Seed data

Do NOT use "NUBELLE".

The visual identity should feel like a premium modern skincare and beauty retail brand.

Design characteristics:

- Clean
- Premium
- Elegant
- Modern
- Minimal
- Professional
- Warm
- Trustworthy
- Easy to use

Avoid excessive decoration.

The POS screen must prioritize speed and usability over visual effects.

---

## 3. DESIGN SYSTEM

Use:

- Tailwind CSS
- Poppins
- Framer Motion
- Icons8

Create a reusable design system.

Reusable components should include:

- Button
- Input
- Select
- SearchInput
- Modal
- Drawer
- Toast
- DataTable
- Pagination
- Badge
- Card
- StatCard
- ProductCard
- ProductSearch
- Cart
- PaymentModal
- Receipt
- ConfirmDialog
- DatePicker
- EmptyState
- LoadingState
- ErrorState
- Skeleton
- Dropdown
- Tabs
- Tooltip

Maintain consistent:

- Typography
- Spacing
- Borders
- Shadows
- Radius
- Button styles
- Form styles
- Status indicators
- Icons

Do not duplicate UI logic unnecessarily.

---

## 4. USER EXPERIENCE

The application should feel polished and production-ready.

Implement:

- Toast notifications
- Skeleton loading states
- Empty states
- Error states
- Confirmation dialogs
- Form validation
- Inline validation
- Loading indicators
- Disabled states
- Success states
- Accessible focus states
- Responsive modals
- Responsive tables
- Search debouncing
- Pagination
- Filtering
- Sorting
- Keyboard navigation
- Keyboard shortcuts
- Optimistic UI where appropriate

Use Framer Motion for subtle animations.

Animations may be used for:

- Page transitions
- Modal entrance
- Toasts
- Product cards
- Cart changes
- Success feedback
- Sidebar transitions
- Dashboard cards

Do not allow animations to slow down the POS.

Respect `prefers-reduced-motion`.

Use clear feedback after every important action.

Examples:

**SUCCESS:**

    "Sale completed successfully."
    "Product added successfully."
    "Inventory updated successfully."

**WARNING:**

    "Only 3 units remaining."
    "This product expires in 14 days."

**ERROR:**

    "Unable to complete the sale. Please try again."
    "Barcode not found."

Never expose raw technical errors to users.

---

## 5. APPLICATION MODULES

Create the application around these major modules:

1. Authentication
2. Dashboard
3. POS
4. Products
5. Categories
6. Inventory
7. Customers
8. Sales
9. Payments
10. Returns & Refunds
11. Staff / Users
12. Shift Management
13. Reports
14. Audit Logs
15. Settings
16. Offline / Synchronization

---

## 6. USER ROLES

Implement role-based access control.

At minimum:

### ADMIN / OWNER

Can:

- View dashboard
- View sales
- Manage products
- Change prices
- Manage inventory
- Perform stock adjustments
- Manage customers
- Process returns/refunds
- Manage staff
- View reports
- Export reports
- Manage settings
- Open/close shifts where appropriate
- View financial information
- View audit logs

### CASHIER

Can:

- Login
- Open assigned shift
- Access POS
- Search products
- Scan products
- Create sales
- Accept payments
- Print/send receipts
- Hold transactions
- Retrieve suspended transactions
- View permitted customer information
- Process permitted returns if authorized
- Close own shift

Cashiers must NOT be able to:

- Change product prices
- Delete/deactivate products
- Perform unrestricted inventory adjustments
- Manage users
- View sensitive financial reports
- Modify system settings

Design the authorization system so additional roles can be added later.

---

## 7. AUTHENTICATION

Implement secure authentication.

Features:

- Login
- Logout
- Session management
- Password hashing
- Role-based authorization
- Protected routes
- Authentication guards
- Session expiration handling

Create a professional Lorma Beauty login screen.

Do not expose secrets or sensitive authentication information in frontend code.

Use environment variables for authentication secrets.

---

## 8. DASHBOARD

Create an admin dashboard.

The owner should immediately see:

**TODAY'S OVERVIEW**

- Total Sales
- Number of Transactions
- Items Sold
- Average Transaction Value

**INVENTORY**

- Total Products
- Low Stock
- Out of Stock
- Expiring Soon

**SALES**

- Today's Sales
- Weekly Sales
- Monthly Sales
- Sales by Payment Method

**PRODUCT PERFORMANCE**

- Top-selling products
- Slow-moving products

Use charts where they provide useful information.

Do not create unnecessary charts.

The dashboard should be understandable within a few seconds.

Allow date filtering where appropriate.

---

## 9. POINT OF SALE

The POS is the most important screen in Version 1.

Design the POS for speed.

Suggested desktop layout:

**MAIN AREA:**

- Product search
- Barcode input
- Barcode scanner support
- Product categories
- Product grid/list
- Product cards

**CART AREA:**

- Current cart
- Customer selection
- Quantity controls
- Discount
- Subtotal
- Total
- Hold transaction
- Clear cart
- Checkout

The cashier must be able to:

- Search product by name
- Search by SKU
- Search by barcode
- Scan barcode
- Add product
- Remove product
- Increase quantity
- Decrease quantity
- Enter quantity manually
- Apply authorized discounts
- Select customer
- Use Walk-in Customer
- Calculate subtotal
- Apply discount
- Calculate total
- Select payment method
- Complete sale
- Print receipt
- Send receipt
- Hold/suspend transaction
- Retrieve suspended transaction

Payment methods:

- Cash
- Mobile Money
- Card
- Bank Transfer
- Other

After successful sale:

1. Show success feedback.
2. Generate unique receipt number.
3. Record sale.
4. Record payment.
5. Record cashier.
6. Record active shift.
7. Reduce inventory.
8. Create inventory movement.
9. Clear cart.
10. Offer receipt printing/sending.
11. Show transaction summary.

Prevent duplicate sales caused by double-clicking or network retries.

---

## 10. BARCODE SUPPORT

The POS must support barcode scanning.

Support:

- USB barcode scanners
- Camera-based barcode scanning where supported
- Manual barcode entry

USB barcode scanners commonly behave like keyboard input.

The POS should correctly handle rapid scanner input.

When a barcode is scanned:

1. Find product.
2. Add product to cart.
3. If already in cart, increment quantity.
4. Provide immediate visual feedback.

If barcode is not found:

- Show clear toast.
- Do not crash.
- Allow manual search.

---

## 11. PRODUCTS

Create complete product management.

Product fields:

- ID
- Product name
- SKU
- Barcode
- Description
- Category
- Brand
- Cost price
- Selling price
- Current stock
- Minimum stock level
- Unit
- Product image
- Active/inactive status
- Expiry tracking
- Created date
- Updated date

Admin can:

- Create product
- Edit product
- Deactivate product
- Search products
- Filter products
- Sort products
- View product details
- Upload product image

Do not permanently delete products that have sales history.

Use soft deletion/deactivation.

---

## 12. PRODUCT CATEGORIES

Initial categories:

- Face Care
- Body Care
- Hair Care
- Cleansers
- Serums
- Moisturizers
- Sunscreens
- Toners
- Masks
- Accessories

Categories must be configurable.

Admin can:

- Add category
- Edit category
- Deactivate category

---

## 13. INVENTORY MANAGEMENT

Inventory is a core module.

A completed sale must automatically reduce inventory.

Example:

```
Vitamin C Serum

Opening Stock: 50
Sold: 3
Current Stock: 47
```

Inventory functionality:

- Stock in
- Stock out
- Stock adjustment
- Damaged stock
- Expired stock
- Low-stock tracking
- Inventory movement history
- Inventory valuation
- Expiry tracking

Every inventory adjustment must record:

- Product
- Quantity
- Previous quantity
- New quantity
- Adjustment type
- Reason
- User
- Date/time

Never allow silent inventory changes.

Maintain a complete inventory audit trail.

---

## 14. EXPIRY MANAGEMENT

Because Lorma Beauty sells skincare products, expiry tracking is important.

Support product batches.

Batch information should include:

- Product
- Batch number
- Expiry date
- Quantity

Provide alerts for:

- Expiring soon
- Expired
- Low stock

Allow configurable expiry warning period.

Example:

    "Products expiring within 30 days"

Do not allow expired products to be sold.

The architecture should support batch-level inventory properly.

---

## 15. SALES

Every completed sale must contain:

- Unique sale ID
- Receipt number
- Date/time
- Cashier
- Shift
- Customer
- Products
- Quantities
- Unit prices
- Discounts
- Subtotal
- Total
- Payment method
- Payment status

Completed sales should be immutable.

Do not simply edit historical sales.

Corrections should happen through controlled processes such as returns/refunds.

---

## 16. RECEIPTS

Create a professional receipt.

Example:

```
LORMA BEAUTY
Skincare & Beauty

Receipt #: LMB-000001

Date:
Cashier:

Product              Qty       Amount
Vitamin C Serum       1        GHS 120
SPF 50                2        GHS 180

Subtotal:             GHS 300
Discount:             GHS 20
TOTAL:                GHS 280

Payment: Mobile Money

Thank you for shopping with Lorma Beauty.
```

Receipt options:

- Print
- Download
- Email
- SMS
- WhatsApp

Where external integrations are not yet available, design the system so they can be added
later.

---

## 17. RETURNS & REFUNDS

Authorized users can:

- Search previous sale
- View sale details
- Select product
- Select quantity to return
- Enter return reason
- Process return
- Refund customer
- Update inventory where appropriate

Maintain return history.

Return records:

- Original sale
- Product
- Quantity
- Reason
- Refund amount
- User
- Date/time

Never modify the original sale to hide a return.

---

## 18. CUSTOMERS

Keep customer management simple in Version 1.

Support:

- Walk-in Customer
- Registered Customer

Customer fields:

- Name
- Phone
- Email
- Address
- Notes
- Created date

Show:

- Purchase history
- Total purchases
- Number of transactions
- Last purchase

Design the database so future features can include:

- Loyalty
- Customer rewards
- Skincare profiles
- Personalized recommendations
- Marketing

Do not implement those future features now.

---

## 19. STAFF MANAGEMENT

Admin can:

- Add staff
- Edit staff
- Activate/deactivate staff
- Assign roles
- Reset passwords
- View staff activity

Important staff actions should appear in audit logs.

Examples:

    "John changed the price of Vitamin C Serum."
    "Mary adjusted stock for SPF 50."
    "Peter processed refund #LMB-00023."

---

## 20. SHIFT MANAGEMENT

Implement cashier shift management.

**OPEN SHIFT**

Cashier enters:

```
Opening Cash:
GHS 500
```

During shift:

```
Cash Sales
GHS 2,000

Mobile Money
GHS 1,500

Card
GHS 500
```

At closing:

```
Expected Cash:
GHS 2,500

Actual Cash:
GHS 2,480

Variance:
-GHS 20
```

Require a reason when a significant variance occurs.

Record:

- Cashier
- Opening amount
- Opening time
- Closing amount
- Closing time
- Expected amount
- Actual amount
- Variance
- Notes

Prevent a cashier from having multiple active shifts unless explicitly permitted.

---

## 21. REPORTS

Create reporting screens.

**SALES REPORT**

Columns:

- Date
- Receipt number
- Product
- Quantity
- Amount
- Cashier
- Payment method

**INVENTORY REPORT**

- Product
- SKU
- Current stock
- Cost price
- Selling price
- Stock value
- Status

**PRODUCT SALES REPORT**

- Product
- Quantity sold
- Revenue
- Number of transactions

**PAYMENT REPORT**

- Cash
- Mobile Money
- Card
- Bank Transfer
- Other

**SHIFT REPORT**

- Cashier
- Opening cash
- Sales
- Expected cash
- Actual cash
- Variance

Reports must support:

- Date filtering
- Search
- Sorting
- Pagination
- Excel export
- PDF export

---

## 22. OFFLINE-FIRST PWA

**THIS IS A CRITICAL BUSINESS REQUIREMENT.**

Lorma Beauty may experience unreliable or unavailable internet access.

The application MUST be a Progressive Web App.

The POS must continue working when internet connectivity is unavailable.

The application must:

- Be installable
- Work on desktop
- Work on laptop
- Work on tablet
- Work on mobile
- Cache the application shell
- Detect online/offline state
- Store required data locally
- Queue offline transactions
- Synchronize automatically when internet returns

Do NOT treat offline functionality as an optional enhancement.

Design the application around an offline-first architecture.

Recommended technologies/patterns:

Frontend:

- Service Worker
- IndexedDB
- Persistent local state
- Offline queue
- Sync manager

When offline, the cashier must still be able to:

- Access cached products
- Search cached products
- Scan products
- Add products to cart
- Complete sales
- Record payment information
- Print receipts where technically supported
- Continue operating normally

Offline sales must be marked:

    "PENDING SYNC"

---

## 23. OFFLINE USER EXPERIENCE

Always show connectivity status.

Example:

```
ONLINE
"All data synchronized"

OFFLINE
"Offline mode — 3 transactions waiting to sync"

SYNCING
"Syncing 3 transactions..."

SYNCED
"All transactions synchronized"

FAILED
"2 transactions require attention"
```

Do not block the cashier from continuing to work just because synchronization has failed.

Provide a Sync Center or synchronization status interface.

---

## 24. OFFLINE SYNCHRONIZATION

When internet connectivity returns:

1. Detect connection.
2. Authenticate if necessary.
3. Send queued transactions.
4. Server validates transaction.
5. Server processes transaction.
6. Server returns confirmation.
7. Local transaction becomes "SYNCED".
8. Local inventory is updated.
9. Sync queue is updated.
10. User receives appropriate feedback.

Every offline transaction must have:

- Local transaction UUID
- Device ID
- User ID
- Timestamp
- Local sequence number
- Idempotency key

---

## 25. OFFLINE CONFLICT HANDLING

Think carefully about inventory conflicts.

The same product may be sold from another device while this device is offline.

Do NOT silently overwrite server inventory.

Implement safe synchronization.

The backend must safely handle:

- Duplicate sync requests
- Network timeout
- Partial synchronization
- Server errors
- Authentication expiration
- Product unavailable
- Inventory conflicts

Use idempotency keys so retrying the same transaction cannot create duplicate sales.

Never lose a completed offline sale simply because synchronization failed.

If an inventory conflict occurs, record the conflict and provide a clear resolution mechanism
for an authorized user.

---

## 26. DATA SYNCHRONIZATION

Synchronize:

- Products
- Categories
- Inventory
- Customers
- Sales
- Returns
- Relevant staff data

Use timestamps/versioning where appropriate.

Track:

- Last successful sync
- Pending sync count
- Failed sync count
- Last sync error

Do not require users to manually refresh the entire application.

---

## 27. RESPONSIVE DESIGN

The application must work properly on:

- Desktop
- Laptop
- Tablet
- Mobile phone

Do not simply shrink the desktop UI.

Design responsive layouts intentionally.

**Desktop:**

- Sidebar navigation
- Multi-column layouts
- Efficient POS interface
- Keyboard shortcuts

**Tablet:**

- Touch-friendly controls
- Optimized POS layout

**Mobile:**

- Bottom navigation where appropriate
- Stacked content
- Mobile-friendly tables/cards
- Touch-friendly controls
- Responsive forms
- Mobile-friendly POS layout

Prioritize the desktop/tablet POS experience because this is an in-store retail system.

---

## 28. POS KEYBOARD SHORTCUTS

Implement useful keyboard shortcuts.

Examples:

```
F2              → Search Product
F4              → Customer
F8              → Hold Transaction
F9              → Checkout
ESC             → Close Modal
CTRL/CMD + K    → Global Search
```

Display shortcuts subtly where useful.

---

## 29. DATABASE ARCHITECTURE

Use PostgreSQL.

At minimum consider these tables:

```
users
roles
permissions
role_permissions
categories
products
product_batches
inventory
inventory_movements
customers
sales
sale_items
payments
returns
return_items
shifts
shift_transactions
audit_logs
sync_queue
```

Use:

- Foreign keys
- Unique constraints
- Check constraints
- Proper indexes
- Created/updated timestamps
- Soft deletion where appropriate

Financial values must use appropriate DECIMAL/NUMERIC types.

Do NOT use floating point for monetary values.

Use database transactions for financial/inventory operations.

A sale should atomically:

1. Create sale
2. Create sale items
3. Create payment
4. Reduce inventory
5. Create inventory movement

All operations should succeed or fail together.

---

## 30. API ARCHITECTURE

Use NestJS.

Create modular backend structure.

Suggested modules:

```
/auth
/users
/roles
/products
/categories
/inventory
/customers
/sales
/payments
/returns
/shifts
/reports
/sync
/audit
/health
```

Use:

- DTOs
- Validation
- Guards
- Services
- Controllers
- Repositories/data access layer where appropriate

Do not put business logic directly in controllers.

Use proper module separation.

---

## 31. API ERROR HANDLING

Use consistent API response/error structures.

Handle:

- Validation errors
- Authentication errors
- Authorization errors
- Network errors
- Database errors
- Inventory conflicts
- Synchronization errors

Never expose database stack traces or sensitive technical information to users.

---

## 32. SECURITY

Implement:

- Secure authentication
- Password hashing
- Authorization
- Input validation
- SQL injection protection
- Rate limiting where appropriate
- Secure headers
- CORS configuration
- Audit logs
- Environment variables
- Secure session/token handling

Never hardcode:

- Database credentials
- JWT secrets
- API keys
- Payment credentials

---

## 33. AUDIT LOGGING

Important business actions must be auditable.

Track:

- Login
- Logout
- Product creation
- Product update
- Product price change
- Product deactivation
- Inventory adjustment
- Sale
- Refund
- Return
- Shift opening
- Shift closing
- Staff changes
- Important settings changes

Each audit record should contain:

- User
- Action
- Entity
- Entity ID
- Timestamp
- Metadata where appropriate

---

## 34. CONTAINERIZATION

The entire application MUST be containerized.

At minimum containerize:

1. Next.js frontend
2. NestJS backend
3. PostgreSQL database

Use Docker.

Use Docker Compose for local development and multi-container orchestration.

Create:

```
/frontend
  Dockerfile
  .dockerignore

/backend
  Dockerfile
  .dockerignore

docker-compose.yml

docker-compose.dev.yml where appropriate

.env.example

README.md
```

Use multi-stage Docker builds where appropriate.

Production images should contain only what is required to run the application.

Do not run application containers as root unless technically necessary.

Do NOT hardcode environment-specific configuration. Use environment variables for:

- Database connection
- Database credentials
- JWT/authentication secrets
- API URLs
- Application URLs
- PWA configuration
- Any future third-party integrations

---

## 35. DOCKER NETWORKING

Create a dedicated Docker network.

Services:

```
postgres
backend
frontend
```

The backend must communicate with PostgreSQL using the Docker service name rather than
localhost.

The frontend must communicate with the backend through configurable environment variables.

Do not hardcode localhost assumptions into production code.

---

## 36. DATABASE PERSISTENCE

PostgreSQL must use persistent storage.

Docker container restart must NOT destroy database data.

Use a named Docker volume for local PostgreSQL.

For production, make it possible to use an external managed PostgreSQL database using
`DATABASE_URL`.

Never rely on an ephemeral PostgreSQL container filesystem for production data.

---

## 37. CONTAINER HEALTH CHECKS

Implement health checks.

NestJS:

    GET /health

The endpoint should verify:

- API is running
- Database is reachable

Configure Docker health checks.

PostgreSQL must have an appropriate health check.

The backend should wait for PostgreSQL to become healthy before attempting database-dependent
startup operations.

---

## 38. PRODUCTION DEPLOYMENT

The application must support production deployment using Docker.

Document:

Build:

    docker compose build

Start:

    docker compose up -d

Logs:

    docker compose logs -f

Stop:

    docker compose down

Also document:

- Database migrations
- Database seeding
- Restarting services
- Updating containers
- Viewing health status
- Backups
- Restoring backups

---

## 39. REVERSE PROXY / HTTPS READINESS

Design the application to work behind a reverse proxy such as:

- Nginx
- Traefik
- Cloud load balancer

Do not tightly couple the application to a specific reverse proxy.

Production must support HTTPS.

Ensure:

- Cookies
- Authentication
- CORS
- PWA service worker
- API communication

work correctly over HTTPS.

---

## 40. PWA + CONTAINERIZATION

The PWA must work correctly from the Dockerized Next.js frontend.

Verify:

- Service worker registration
- PWA manifest
- Installability
- Application caching
- IndexedDB persistence
- Offline functionality
- Offline queue
- Automatic synchronization

Docker itself does NOT provide offline functionality.

Offline support must exist at the application/PWA layer.

---

## 41. APPLICATION NAVIGATION

Recommended sidebar:

```
Dashboard

POS

Sales
  └── All Sales
  └── Returns

Products
  └── Products
  └── Categories
  └── Inventory
  └── Expiry

Customers

Staff

Shifts

Reports

Settings
```

Navigation must change based on user role.

---

## 42. PERFORMANCE

The POS must feel fast.

Optimize:

- Product search
- Barcode lookup
- Cart operations
- API responses
- Database queries
- Images
- Initial application load
- Offline data access

Use pagination for large datasets.

Do not load thousands of products into the DOM unnecessarily.

Cache appropriate catalogue data for offline operation.

---

## 43. NOTIFICATIONS

Use toast notifications throughout the application.

Examples:

    "Sale completed successfully."
    "Product added successfully."
    "Inventory updated successfully."
    "Transaction saved offline."
    "Transaction synchronized."
    "Only 3 units remaining."
    "Product expires in 14 days."
    "Unable to complete synchronization."

Use different notification types:

- Success
- Info
- Warning
- Error

Do not rely solely on color to communicate status.

---

## 44. REPORT EXPORTS

Support exporting reports to:

- Excel
- PDF

Exported reports should contain:

- Lorma Beauty branding
- Report title
- Date range
- Generated date
- Relevant report data

---

## 45. SEED DATA

Create realistic development/demo seed data.

Categories:

- Face Care
- Body Care
- Hair Care
- Cleansers
- Serums
- Moisturizers
- Sunscreens
- Toners
- Masks
- Accessories

Create at least 20 realistic skincare/beauty products.

Each product should have:

- Product name
- SKU
- Barcode
- Category
- Brand
- Cost price
- Selling price
- Stock
- Minimum stock
- Expiry information

Create demo users:

**ADMIN**

    Email: admin@lormabeauty.local

**CASHIER**

    Email: cashier@lormabeauty.local

Use clearly documented development-only passwords.

Do not use these credentials in production.

---

## 46. TESTING

Implement meaningful automated tests.

Backend:

- Unit tests
- Service tests
- Integration/API tests

Test critical scenarios:

1. Successful sale
2. Sale reduces inventory
3. Sale cannot exceed available inventory where applicable
4. Payment recorded correctly
5. Return updates inventory appropriately
6. Shift opening
7. Shift closing
8. Cash variance calculation
9. Role authorization
10. Offline transaction creation
11. Offline transaction synchronization
12. Duplicate synchronization does not create duplicate sale
13. Failed synchronization retries safely
14. Authentication failure
15. Unauthorized access
16. Product expiry validation

---

## 47. OBSERVABILITY

Prepare the system for production monitoring.

Logs should be:

- Structured where practical
- Easy to read through Docker logs
- Free from passwords
- Free from authentication secrets
- Free from unnecessary customer-sensitive information

Backend must expose:

    GET /health

Use this for container/orchestration health checks.

---

## 48. DEVELOPMENT DOCUMENTATION

Create a professional README.

Document:

- Project overview
- Architecture
- Technology stack
- Folder structure
- Environment variables
- Local development
- Docker setup
- Database setup
- Migrations
- Seed data
- Running tests
- Building frontend
- Building backend
- Production deployment
- PWA behavior
- Offline functionality
- Synchronization architecture
- Backup strategy
- Troubleshooting

Provide an `.env.example`.

Never commit actual secrets.

---

## 49. PROJECT STRUCTURE

Use a clean project structure.

A possible structure:

```
/lorma-beauty-pos

  /frontend
    /app
    /components
    /features
    /hooks
    /lib
    /services
    /store
    /types
    /public
    Dockerfile
    .dockerignore

  /backend
    /src
      /auth
      /users
      /roles
      /products
      /categories
      /inventory
      /customers
      /sales
      /payments
      /returns
      /shifts
      /reports
      /sync
      /audit
      /health
    Dockerfile
    .dockerignore

  /database
    /migrations
    /seed

  docker-compose.yml
  docker-compose.dev.yml
  .env.example
  README.md
```

You may adjust the structure if a better architecture is justified.

---

## 50. FUTURE EXTENSIBILITY

**DO NOT IMPLEMENT these features in Version 1.**

However, the architecture must make them possible later.

**VERSION 2:**

- Ecommerce website
- Online ordering
- Delivery management
- Customer accounts

**VERSION 3:**

- Loyalty programme
- Customer rewards
- Personalized skincare profiles
- Skin quiz
- Product recommendations
- Reorder reminders

**VERSION 4:**

- AI skincare assistant
- Advanced product recommendation engine
- Customer segmentation
- Marketing automation
- Personalized campaigns
- Skin progress tracking

Do not clutter Version 1 with these features.

Build the foundation correctly so these can be added later.

---

## 51. IMPORTANT BUSINESS RULES

Implement these carefully.

1. Completed sales must be immutable.
2. Inventory changes must always have a reason and audit trail.
3. Expired products cannot be sold.
4. Cashiers cannot change product prices unless explicitly authorized.
5. Cashiers cannot perform unrestricted inventory adjustments.
6. Returns must reference the original sale.
7. Refunds must be auditable.
8. Financial calculations must use decimal/numeric types.
9. Offline transactions must never be silently discarded.
10. Synchronization must be idempotent.
11. Retrying a transaction must never create duplicate sales.
12. Inventory must not be silently overwritten during synchronization.
13. Important actions must be logged.
14. Product records with historical sales should be deactivated rather than permanently deleted.
15. A cashier should not be able to have multiple active shifts unless explicitly permitted.

---

## 52. END-TO-END USER FLOWS

**FLOW 1 — NORMAL SALE**

```
LOGIN
↓
OPEN SHIFT
↓
OPEN POS
↓
SEARCH / SCAN PRODUCT
↓
ADD TO CART
↓
SELECT CUSTOMER
↓
APPLY DISCOUNT IF AUTHORIZED
↓
SELECT PAYMENT METHOD
↓
COMPLETE SALE
↓
RECORD PAYMENT
↓
REDUCE INVENTORY
↓
GENERATE RECEIPT
↓
PRINT/SEND RECEIPT
↓
SALE COMPLETE
```

**FLOW 2 — OFFLINE SALE**

```
LOGIN / CONTINUE SESSION
↓
OFFLINE DETECTED
↓
SHOW OFFLINE STATUS
↓
USE CACHED PRODUCTS
↓
SCAN / SEARCH PRODUCT
↓
ADD TO CART
↓
COMPLETE SALE
↓
SAVE TRANSACTION LOCALLY
↓
SHOW "PENDING SYNC"
↓
CASHIER CONTINUES SELLING
```

**FLOW 3 — RECONNECT**

```
INTERNET RETURNS
↓
DETECT CONNECTION
↓
START SYNC
↓
SEND QUEUED TRANSACTIONS
↓
SERVER VALIDATES
↓
SERVER PROCESSES
↓
SERVER CONFIRMS
↓
MARK LOCAL TRANSACTION AS SYNCED
↓
UPDATE LOCAL DATA
↓
SHOW "ALL TRANSACTIONS SYNCHRONIZED"
```

**FLOW 4 — RETURN**

```
LOGIN
↓
SEARCH SALE
↓
OPEN SALE
↓
SELECT ITEM TO RETURN
↓
SELECT QUANTITY
↓
ENTER RETURN REASON
↓
AUTHORIZE RETURN
↓
PROCESS REFUND
↓
UPDATE INVENTORY
↓
RECORD RETURN
↓
AUDIT LOG
```

**FLOW 5 — SHIFT**

```
LOGIN
↓
OPEN SHIFT
↓
ENTER OPENING CASH
↓
PROCESS SALES
↓
TRACK PAYMENTS
↓
CLOSE SHIFT
↓
CALCULATE EXPECTED CASH
↓
ENTER ACTUAL CASH
↓
CALCULATE VARIANCE
↓
ENTER REASON IF REQUIRED
↓
CLOSE SHIFT
```

---

## 53. ACCEPTANCE CRITERIA

Version 1 is NOT complete unless a real shop can realistically operate its daily retail sales
using the application.

The cashier must be able to:

- Login
- Open shift
- Search products
- Scan products
- Add products to cart
- Select customer
- Apply authorized discount
- Accept payment
- Complete sale
- Generate receipt
- Print receipt
- Update inventory
- Hold transaction
- Retrieve transaction
- Close shift

The owner must be able to:

- Login
- View dashboard
- Manage products
- Manage categories
- Manage inventory
- View sales
- Process returns
- Manage customers
- Manage staff
- Manage roles
- Manage shifts
- View reports
- Export reports
- View audit logs

**Offline requirements:**

- POS continues operating without internet.
- Products remain accessible from local cache.
- Offline sales are stored safely.
- Offline sales survive page refresh/reopening.
- Offline sales are queued.
- Internet restoration triggers synchronization.
- Synchronization is idempotent.
- Duplicate sales cannot occur.
- Failed synchronization can retry.
- Inventory conflicts are handled safely.
- Users can see synchronization status.

**Container requirements:**

- Frontend runs in Docker.
- Backend runs in Docker.
- PostgreSQL runs in Docker for local/containerized deployment.
- PostgreSQL data is persistent.
- Docker Compose starts the stack.
- Health checks work.
- Environment variables are used.
- Production builds use appropriate multi-stage Docker builds.
- Application can be deployed to a server using Docker.
- Documentation explains deployment.

**Supplementary criteria:**

- Database migrations can be executed in the containerized environment.
- Seed data can be loaded into PostgreSQL from within the containerized environment.
- The application can be rebuilt without losing database data.
- The containers can communicate through the dedicated Docker network.
- The PWA works correctly when served from the Dockerized frontend.
- Application branding is consistently "Lorma Beauty".
- No reference to "NUBELLE" remains anywhere in the application, seed data, UI, receipts,
  metadata, or documentation.

---

## 54. ENGINEERING PRINCIPLES

Follow these principles throughout the project:

1. Do not over-engineer Version 1.
2. Do not implement features that are not required.
3. Do not create fake functionality just to make the UI appear complete.
4. Every important UI action must connect to real backend functionality.
5. Use real PostgreSQL persistence.
6. Use real API calls.
7. Use proper validation.
8. Use proper authorization.
9. Treat money and inventory as high-integrity data.
10. Never silently lose offline transactions.
11. Never create duplicate transactions during synchronization.
12. Make the POS extremely fast.
13. Make the application visually polished.
14. Make the application responsive.
15. Make it installable as a PWA.
16. Make offline functionality a first-class architectural concern.
17. Keep the code modular and maintainable.
18. Build reusable components.
19. Document important architectural decisions.
20. Prepare the architecture for future versions without implementing those features now.
21. Use Docker consistently for development and deployment.
22. Do not hardcode environment-specific values.
23. Do not hardcode secrets.
24. Do not compromise data integrity for convenience.
25. Prefer simple, maintainable solutions over unnecessary complexity.

---

## 55. FINAL DELIVERABLE

Build the complete Lorma Beauty Version 1 POS and Retail Management System.

Implement in a logical order:

1. Project structure
2. Database architecture
3. Docker environment
4. Authentication
5. Layout/navigation
6. Design system
7. Dashboard
8. Product management
9. Categories
10. Inventory
11. POS
12. Payments
13. Sales
14. Receipts
15. Customers
16. Returns/refunds
17. Staff and roles
18. Shift management
19. Reports
20. Audit logs
21. PWA
22. IndexedDB/local persistence
23. Offline mode
24. Synchronization engine
25. Responsive UX
26. Seed data
27. Automated tests
28. Documentation
29. Production Docker configuration

Do not stop at creating static screens.

The application must work end-to-end.

Before considering the project complete, test:

```
LOGIN
→ OPEN SHIFT
→ SELL PRODUCT
→ PAYMENT
→ RECEIPT
→ INVENTORY UPDATE
→ REPORT
```

Then test:

```
OFFLINE
→ CREATE SALE
→ SAVE LOCALLY
→ QUEUE SALE
→ RESTORE INTERNET
→ SYNCHRONIZE
→ SERVER CONFIRMATION
→ LOCAL STATUS UPDATE
```

Also test:

```
OFFLINE
→ CREATE MULTIPLE SALES
→ REFRESH APPLICATION
→ REOPEN APPLICATION
→ VERIFY SALES REMAIN IN QUEUE
→ RESTORE INTERNET
→ SYNC ALL SALES
→ VERIFY NO DUPLICATES
```

The final product should feel like a real production POS system for Lorma Beauty, not a
prototype or static dashboard.

---

## 56. ARCHITECTURE REFERENCE DIAGRAMS

**Container topology**

```
                    LORMA BEAUTY POS
                           │
             ┌─────────────┴─────────────┐
             │                           │
      Next.js Container           NestJS Container
             │                           │
             └─────────────┬─────────────┘
                           │
                    PostgreSQL Container
```

**Deployment stack**

```
                         INTERNET / LAN
                               │
                               ▼
                       Reverse Proxy
                               │
                               ▼
                    ┌───────────────────┐
                    │ Next.js Container │
                    │  Lorma Beauty UI  │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ NestJS Container  │
                    │     REST API      │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ PostgreSQL        │
                    │ Container / DB    │
                    └───────────────────┘
                              │
                              ▼
                       Persistent Data
```

**Offline data flow**

```
                    LORMA BEAUTY POS
                           │
                           ▼
                    Local IndexedDB
                           │
                    ┌──────┴──────┐
                    │             │
                 Online         Offline
                    │             │
                    ▼             ▼
                API Sync      Local Queue
                    │             │
                    └──────┬──────┘
                           │
                           ▼
                       PostgreSQL
```
