const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer = null;

const connectDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    // Check if we should use in-memory database (for development without MongoDB installed)
    if (process.env.USE_MEMORY_DB === 'true' || !mongoUri || mongoUri.includes('localhost:27017')) {
      console.log('🔧 Starting MongoDB Memory Server for development...');
      
      // Create in-memory MongoDB instance
      mongoServer = await MongoMemoryServer.create();
      const memoryUri = mongoServer.getUri();
      
      await mongoose.connect(memoryUri);
      console.log('✅ MongoDB Memory Server Connected');
      console.log('⚠️  Data will be lost when server restarts');
      console.log('💡 Install MongoDB locally or use MongoDB Atlas for persistent storage');
      
    } else {
      // Use provided MongoDB URI (Atlas or local installation)
      await mongoose.connect(mongoUri);
      console.log('✅ MongoDB Connected');
    }
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
    
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
    console.log('💡 Tip: Set USE_MEMORY_DB=true in .env to use in-memory database for development');
    // Don't exit in development - let the app continue
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.log('⚠️  Continuing without database connection in development mode');
    }
  }
};

const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (err) {
    console.error('Error disconnecting from database:', err);
  }
};

module.exports = { connectDatabase, disconnectDatabase };
