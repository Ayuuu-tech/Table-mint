# 🍃 Table Mint - Modern Restaurant POS System

Table Mint is a comprehensive, full-stack Point of Sale (POS) and restaurant management system tailored to streamline operations, enhance customer experience, and simplify restaurant administration.

## 🚀 Features

- **Real-time Synchronization:** Instant updates across all devices and dashboards using `Socket.io`.
- **Table Management:** Intuitive table tracking, interactive layout configuration, and real-time status management.
- **Order & Kitchen Management:** Seamlessly route orders from the POS to the Kitchen Display System (KDS).
- **Menu & Inventory:** Manage items, dynamic categories, ingredients, and keep track of stock levels.
- **Billing & Subscriptions:** Easily split bills, apply coupons, and manage SaaS subscriptions with Razorpay integration.
- **Staff & Auth:** Role-based access control (RBAC), secure JWT authentication, and automatic token rotation.
- **Analytics & Reporting:** Dashboards to visualize sales metrics, inventory consumption, and staff performance.
- **QR Code Integration:** Generate dynamic QR codes for digital menus or quick table-based ordering.

## 🛠️ Tech Stack

### Frontend (`pos-frontend`)
- **Framework:** [Next.js 16](https://nextjs.org/) (React 19)
- **Styling:** Tailwind CSS, HeadlessUI
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Integration:** Axios, `socket.io-client`, QR Code generator

### Backend (`pos-backend`)
- **Runtime & Framework:** Node.js, Express.js
- **Database:** MongoDB (via Mongoose) / MongoDB Memory Server for dev
- **Real-time:** Socket.io
- **Security:** Helmet, express-rate-limit, JWT, express-fileupload
- **Payments:** Razorpay

## 📦 Prerequisites

Ensure you have the following installed on your local machine:
- [Node.js](https://nodejs.org/en/download/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) (Local or Atlas, optional if using memory server)
- Git

## ⚙️ Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Ayuuu-tech/Table-mint.git
   cd "Table Mint"
   ```

2. **Install Backend Dependencies:**
   ```bash
   cd pos-backend
   npm install
   ```

3. **Install Frontend Dependencies:**
   ```bash
   cd ../pos-frontend
   npm install
   ```

## 🔐 Environment Variables

### Backend (`pos-backend/.env`)
Create a `.env` file in the `pos-backend` root directory. To run smoothly, you must set these variables:
```env
PORT=5000
NODE_ENV=development

# Database (leave empty to use memory server in dev mode)
MONGO_URI=your_mongodb_connection_string

# Security
JWT_SECRET=super_secret_key_that_is_at_least_32_characters_long
FRONTEND_URL=http://localhost:3000

# Payments
RAZORPAY_KEY_ID=rzp_test_yourkey
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

### Frontend (`pos-frontend/.env.local`)
Create a `.env.local` file in the `pos-frontend` root directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

## 🏃‍♂️ Running the Application

### Start Backend
Open a new terminal and run:
```bash
cd pos-backend
node src/server.js
```
*The backend server will start on `http://localhost:5000`.*

### Start Frontend
Open a new terminal and run:
```bash
cd pos-frontend
npm run dev
```
*The frontend will be accessible at `http://localhost:3000`.*

## 📚 API Documentation
When the backend is running, real-time routing and detailed configurations can be traced via the built-in logger (`logs/app.log`). Full Swagger documentation logic sits under `.src/utils/swagger.js`.

## 📄 License
This project is licensed under the MIT License - feel free to use, modify, and distribute.
