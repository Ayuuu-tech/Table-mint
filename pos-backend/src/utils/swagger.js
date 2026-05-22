/**
 * Swagger/OpenAPI Configuration
 * Generates interactive API documentation
 * 
 * Usage: Mount swagger routes in server.js
 * const { swaggerServe, swaggerSetup, swaggerSpec } = require('./utils/swagger');
 * app.use('/api-docs', swaggerServe, swaggerSetup);
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Swagger definition
const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Table Mint POS API',
        version: '2.0.0',
        description: `
## Restaurant Point of Sale System API

Table Mint is a comprehensive POS system for restaurants featuring:
- **Order Management** - Create, update, and manage orders
- **Billing & Payments** - Generate bills with GST compliance
- **Menu Management** - Full menu CRUD with variants and modifiers
- **Table Management** - Track table status and reservations
- **Customer CRM** - Loyalty points, wallet, visit history
- **Inventory** - Track ingredients and stock levels
- **Kitchen Display** - Real-time order status for kitchen
- **Notifications** - Multi-channel alerts (In-app, Email, SMS)
- **Analytics** - Sales reports and dashboards

### Authentication
All protected endpoints require a JWT token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

### Rate Limiting
- Auth endpoints: 5 requests per 15 minutes
- API endpoints: 30 requests per 15 minutes
- Upload endpoints: 50 requests per 15 minutes
    `,
        contact: {
            name: 'Table Mint Support',
            email: 'support@tablemint.com'
        },
        license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
        }
    },
    servers: [
        {
            url: 'http://localhost:5000/api',
            description: 'Development server'
        },
        {
            url: 'https://api.tablemint.com/api',
            description: 'Production server'
        }
    ],
    tags: [
        { name: 'Auth', description: 'Authentication and authorization' },
        { name: 'Restaurant', description: 'Restaurant settings and configuration' },
        { name: 'Menu', description: 'Menu items management' },
        { name: 'Tables', description: 'Table management and status' },
        { name: 'Orders', description: 'Order management' },
        { name: 'Bills', description: 'Billing and payments' },
        { name: 'Customers', description: 'Customer CRM and loyalty' },
        { name: 'Reservations', description: 'Table reservations' },
        { name: 'Coupons', description: 'Discount coupons management' },
        { name: 'Inventory', description: 'Inventory and stock management' },
        { name: 'Kitchen', description: 'Kitchen display system' },
        { name: 'Notifications', description: 'Notification management' },
        { name: 'Analytics', description: 'Reports and analytics' },
        { name: 'Subscriptions', description: 'Subscription and billing' }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Enter your JWT token'
            }
        },
        schemas: {
            // ========== COMMON SCHEMAS ==========
            Error: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    errorCode: { type: 'string', example: 'VALIDATION_ERROR' },
                    message: { type: 'string', example: 'Validation failed' },
                    errors: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                field: { type: 'string' },
                                message: { type: 'string' }
                            }
                        }
                    }
                }
            },
            Pagination: {
                type: 'object',
                properties: {
                    total: { type: 'integer', example: 100 },
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 20 },
                    pages: { type: 'integer', example: 5 }
                }
            },

            // ========== AUTH SCHEMAS ==========
            User: {
                type: 'object',
                properties: {
                    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
                    name: { type: 'string', example: 'John Doe' },
                    email: { type: 'string', format: 'email', example: 'john@example.com' },
                    phone: { type: 'string', example: '9876543210' },
                    role: { type: 'string', enum: ['OWNER', 'MANAGER', 'CASHIER'], example: 'OWNER' },
                    restaurantId: { type: 'string' },
                    isActive: { type: 'boolean', example: true },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            },
            LoginRequest: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email', example: 'owner@example.com' },
                    password: { type: 'string', format: 'password', example: 'password123' }
                }
            },
            SignupRequest: {
                type: 'object',
                required: ['restaurantName', 'ownerName', 'email', 'password', 'phone'],
                properties: {
                    restaurantName: { type: 'string', example: 'My Restaurant' },
                    ownerName: { type: 'string', example: 'John Doe' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                    phone: { type: 'string', example: '9876543210' },
                    address: {
                        type: 'object',
                        properties: {
                            street: { type: 'string' },
                            city: { type: 'string' },
                            state: { type: 'string' },
                            pincode: { type: 'string' }
                        }
                    }
                }
            },
            AuthResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: {
                        type: 'object',
                        properties: {
                            token: { type: 'string' },
                            user: { $ref: '#/components/schemas/User' },
                            restaurant: { $ref: '#/components/schemas/Restaurant' }
                        }
                    }
                }
            },

            // ========== RESTAURANT SCHEMAS ==========
            Restaurant: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    name: { type: 'string', example: 'Spice Garden' },
                    ownerName: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    address: {
                        type: 'object',
                        properties: {
                            street: { type: 'string' },
                            city: { type: 'string' },
                            state: { type: 'string' },
                            pincode: { type: 'string' }
                        }
                    },
                    gstNumber: { type: 'string' },
                    logo: { type: 'string' },
                    subscriptionStatus: { type: 'string', enum: ['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'] },
                    subscriptionExpiry: { type: 'string', format: 'date-time' },
                    settings: {
                        type: 'object',
                        properties: {
                            currency: { type: 'string', example: '₹' },
                            taxPercentage: { type: 'number', example: 5 },
                            enableTax: { type: 'boolean' },
                            enableKOT: { type: 'boolean' },
                            tablePrefix: { type: 'string', example: 'T' }
                        }
                    }
                }
            },

            // ========== MENU SCHEMAS ==========
            MenuItem: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    name: { type: 'string', example: 'Paneer Tikka' },
                    description: { type: 'string' },
                    category: { type: 'string', enum: ['STARTERS', 'MAIN_COURSE', 'BREADS', 'RICE', 'BEVERAGES', 'DESSERTS', 'CHINESE', 'SOUTH_INDIAN', 'OTHER'] },
                    price: { type: 'number', example: 220 },
                    isVeg: { type: 'boolean', example: true },
                    isAvailable: { type: 'boolean', example: true },
                    image: { type: 'string' },
                    taxRate: { type: 'number', enum: [0, 5, 12, 18, 28], example: 5 },
                    hsnCode: { type: 'string', example: '2106' },
                    hasVariants: { type: 'boolean' },
                    variants: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', example: 'Large' },
                                price: { type: 'number', example: 280 },
                                isAvailable: { type: 'boolean' }
                            }
                        }
                    },
                    modifierGroups: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', example: 'Add-ons' },
                                minSelection: { type: 'integer' },
                                maxSelection: { type: 'integer' },
                                required: { type: 'boolean' },
                                options: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string' },
                                            price: { type: 'number' },
                                            isAvailable: { type: 'boolean' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            MenuItemCreate: {
                type: 'object',
                required: ['name', 'price', 'category'],
                properties: {
                    name: { type: 'string' },
                    price: { type: 'number' },
                    category: { type: 'string' },
                    description: { type: 'string' },
                    isVeg: { type: 'boolean' },
                    taxRate: { type: 'number' },
                    hsnCode: { type: 'string' }
                }
            },

            // ========== TABLE SCHEMAS ==========
            Table: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    tableNumber: { type: 'string', example: 'T1' },
                    capacity: { type: 'integer', example: 4 },
                    status: { type: 'string', enum: ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING'] },
                    section: { type: 'string', example: 'Main Hall' },
                    currentOrderId: { type: 'string' }
                }
            },

            // ========== ORDER SCHEMAS ==========
            OrderItem: {
                type: 'object',
                properties: {
                    menuItemId: { type: 'string' },
                    name: { type: 'string' },
                    quantity: { type: 'integer' },
                    price: { type: 'number' },
                    itemTotal: { type: 'number' },
                    taxRate: { type: 'number' },
                    selectedVariant: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            price: { type: 'number' }
                        }
                    },
                    selectedModifiers: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                groupName: { type: 'string' },
                                name: { type: 'string' },
                                price: { type: 'number' }
                            }
                        }
                    },
                    kitchenStatus: { type: 'string', enum: ['PENDING', 'PREPARING', 'READY', 'SERVED'] }
                }
            },
            Order: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    tableNumber: { type: 'string' },
                    items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
                    subtotal: { type: 'number' },
                    tax: { type: 'number' },
                    discount: { type: 'number' },
                    totalAmount: { type: 'number' },
                    status: { type: 'string', enum: ['OPEN', 'PAID', 'CANCELLED'] },
                    customerName: { type: 'string' },
                    customerPhone: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            },
            OrderCreate: {
                type: 'object',
                required: ['items'],
                properties: {
                    tableId: { type: 'string', description: 'Optional for walk-in orders' },
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['menuItemId', 'quantity'],
                            properties: {
                                menuItemId: { type: 'string' },
                                quantity: { type: 'integer', minimum: 1 },
                                notes: { type: 'string' },
                                selectedVariant: { type: 'object' },
                                selectedModifiers: { type: 'array' }
                            }
                        }
                    },
                    customerName: { type: 'string' },
                    customerPhone: { type: 'string' }
                }
            },

            // ========== BILL SCHEMAS ==========
            Bill: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    billNumber: { type: 'string', example: 'INV-2526-0001' },
                    tableNumber: { type: 'string' },
                    items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
                    subtotal: { type: 'number' },
                    tax: { type: 'number' },
                    taxBreakdown: {
                        type: 'object',
                        properties: {
                            cgst: { type: 'number' },
                            sgst: { type: 'number' },
                            igst: { type: 'number' }
                        }
                    },
                    discount: { type: 'number' },
                    totalAmount: { type: 'number' },
                    paymentMode: { type: 'string', enum: ['CASH', 'CARD', 'UPI', 'WALLET', 'SPLIT', 'PARTIAL', 'OTHER'] },
                    paymentStatus: { type: 'string', enum: ['PAID', 'PENDING', 'PARTIAL', 'REFUNDED'] },
                    customerName: { type: 'string' },
                    loyaltyPointsEarned: { type: 'integer' },
                    loyaltyPointsRedeemed: { type: 'integer' },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            },

            // ========== CUSTOMER SCHEMAS ==========
            Customer: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    name: { type: 'string' },
                    phone: { type: 'string' },
                    email: { type: 'string' },
                    loyaltyPoints: { type: 'integer' },
                    loyaltyTier: { type: 'string', enum: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'] },
                    walletBalance: { type: 'number' },
                    lifetimeValue: { type: 'number' },
                    visitCount: { type: 'integer' },
                    lastVisitAt: { type: 'string', format: 'date-time' },
                    tags: { type: 'array', items: { type: 'string' } }
                }
            },

            // ========== RESERVATION SCHEMAS ==========
            Reservation: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    table: { type: 'string' },
                    customerName: { type: 'string' },
                    customerPhone: { type: 'string' },
                    numberOfGuests: { type: 'integer' },
                    reservationDate: { type: 'string', format: 'date' },
                    reservationTime: { type: 'string', example: '19:30' },
                    duration: { type: 'integer', example: 120 },
                    status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] },
                    celebrationType: { type: 'string', enum: ['BIRTHDAY', 'ANNIVERSARY', 'OTHER'] },
                    specialRequests: { type: 'string' }
                }
            },

            // ========== NOTIFICATION SCHEMAS ==========
            Notification: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    type: { type: 'string', enum: ['LOW_STOCK', 'SUBSCRIPTION_EXPIRY', 'NEW_ORDER', 'LARGE_ORDER', 'FAILED_PAYMENT', 'ORDER_READY', 'RESERVATION_REMINDER', 'SYSTEM'] },
                    priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
                    title: { type: 'string' },
                    message: { type: 'string' },
                    read: { type: 'boolean' },
                    sentVia: { type: 'array', items: { type: 'string' } },
                    createdAt: { type: 'string', format: 'date-time' }
                }
            }
        },
        responses: {
            UnauthorizedError: {
                description: 'Authentication failed or token expired',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/Error' },
                        example: {
                            success: false,
                            errorCode: 'AUTHENTICATION_ERROR',
                            message: 'Authentication failed. Please log in again.'
                        }
                    }
                }
            },
            NotFoundError: {
                description: 'Resource not found',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/Error' }
                    }
                }
            },
            ValidationError: {
                description: 'Validation failed',
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/Error' }
                    }
                }
            }
        }
    },
    security: [{ bearerAuth: [] }]
};

// Swagger JSDoc options
const options = {
    definition: swaggerDefinition,
    apis: [
        './src/routes/*.js', // Route files
        './src/controllers/*.js' // Controller files for additional docs
    ]
};

// Generate Swagger spec
const swaggerSpec = swaggerJsdoc(options);

// Swagger UI options
const swaggerUiOptions = {
    customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info { margin: 20px 0 }
    .swagger-ui .info .title { font-size: 2em }
  `,
    customSiteTitle: 'Table Mint API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showExtensions: true,
        tryItOutEnabled: true
    }
};

module.exports = {
    swaggerServe: swaggerUi.serve,
    swaggerSetup: swaggerUi.setup(swaggerSpec, swaggerUiOptions),
    swaggerSpec
};
