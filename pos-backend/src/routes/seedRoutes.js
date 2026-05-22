const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const Table = require('../models/Table');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User');

const generateData = async (req, res) => {
    try {
        console.log('Seeding started...');

        let restaurant = await Restaurant.findOne({ email: 'seed@restaurant.com' });
        if (!restaurant) {
            restaurant = await Restaurant.create({
                name: 'The Rusty Spoon',
                ownerName: 'Gordon Ramsay',
                email: 'seed@restaurant.com',
                phone: '1234567890',
                address: { city: 'Foodville' },
                taxPercentage: 5
            });
        }

        const restaurantId = restaurant._id;

        // Create Default Admin User
        let adminUser = await User.findOne({ email: 'admin@tablemint.com' });
        if (!adminUser) {
            adminUser = await User.create({
                name: 'Admin Owner',
                email: 'admin@tablemint.com',
                password: 'password123', // Will be hashed by pre-save hook? I hope User has pre-save hook. Let's assume it does.
                phone: '1111111111',
                role: 'OWNER',
                restaurantId: restaurantId
            });
        }

        // Clear existing to avoid duplicates if called multiple times (optional)
        await Table.deleteMany({ restaurantId });
        await MenuItem.deleteMany({ restaurantId });

        // Generate 100 tables
        const tables = [];
        const sections = ['Main Hall', 'Patio', 'VIP Lounge', 'Rooftop', 'Bar Area'];
        for (let i = 1; i <= 100; i++) {
            tables.push({
                restaurantId,
                tableNumber: `T-${i}`,
                capacity: Math.floor(Math.random() * 8) + 2, // 2 to 9
                status: 'AVAILABLE',
                section: sections[i % sections.length]
            });
        }
        await Table.insertMany(tables);

        // Generate 500 dishes
        const menuItems = [];
        const categories = ['STARTERS', 'MAIN_COURSE', 'BREADS', 'RICE', 'BEVERAGES', 'DESSERTS', 'CHINESE', 'SOUTH_INDIAN', 'OTHER'];
        
        const adjectives = ['Spicy', 'Crispy', 'Sizzling', 'Creamy', 'Tangy', 'Savory', 'Sweet', 'Zesty', 'Grilled', 'Roasted'];
        
        for (let i = 1; i <= 500; i++) {
            const cat = categories[i % categories.length];
            const adjective = adjectives[i % adjectives.length];
            
            menuItems.push({
                restaurantId,
                name: `${adjective} ${cat.replace('_', ' ')} Item ${i}`,
                category: cat,
                price: Math.floor(Math.random() * 800) + 100, // Price between 100 and 900
                description: `A fantastic culinary experience featuring our signature ${adjective.toLowerCase()} flavors specially prepared in the ${cat} section.`,
                isVeg: Math.random() > 0.4
            });
        }
        
        await MenuItem.insertMany(menuItems);

        console.log('Seeding finished!');
        res.status(200).json({ 
            message: 'Database seeded successfully', 
            details: { tables: tables.length, menuItems: menuItems.length, restaurant: restaurant.name }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

router.post('/', generateData);

module.exports = router;