const Bill = require('../models/Bill');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const pdfService = require('../services/pdfService');


// @desc    Get today's sales
// @route   GET /api/reports/today
// @access  Private
exports.getTodaySales = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const bills = await Bill.find({
      restaurantId: req.user.restaurantId,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      paymentStatus: 'PAID'
    });

    const totalSales = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
    const totalOrders = bills.length;
    const totalTax = bills.reduce((sum, bill) => sum + bill.tax, 0);
    const totalDiscount = bills.reduce((sum, bill) => sum + bill.discount, 0);

    // Payment mode breakdown
    const paymentBreakdown = bills.reduce((acc, bill) => {
      acc[bill.paymentMode] = (acc[bill.paymentMode] || 0) + bill.totalAmount;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        totalSales,
        totalOrders,
        totalTax,
        totalDiscount,
        averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
        paymentBreakdown
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching today\'s sales'
    });
  }
};

// @desc    Get sales by date range
// @route   GET /api/reports/sales
// @access  Private (Owner only)
exports.getSalesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const bills = await Bill.find({
      restaurantId: req.user.restaurantId,
      createdAt: { $gte: start, $lte: end },
      paymentStatus: 'PAID'
    });

    const totalSales = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
    const totalOrders = bills.length;

    // Feature 6: Tax Breakdown for GST Reports
    const taxReport = bills.reduce((acc, bill) => {
      acc.totalTax += bill.tax || 0;
      if (bill.taxBreakdown) {
        acc.cgst += bill.taxBreakdown.cgst || 0;
        acc.sgst += bill.taxBreakdown.sgst || 0;
        acc.igst += bill.taxBreakdown.igst || 0;
      } else if (bill.tax > 0) {
        // Fallback for old bills: Assume 50-50 split SGST/CGST
        acc.cgst += bill.tax / 2;
        acc.sgst += bill.tax / 2;
      }
      return acc;
    }, { totalTax: 0, cgst: 0, sgst: 0, igst: 0 });

    res.status(200).json({
      success: true,
      data: {
        totalSales,
        totalOrders,
        averageOrderValue: totalOrders > 0 ? totalSales / totalOrders : 0,
        taxReport,
        bills
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching sales report'
    });
  }
};

// @desc    Get item-wise sales report
// @route   GET /api/reports/items
// @access  Private (Owner only)
exports.getItemWiseSales = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = { restaurantId: req.user.restaurantId, paymentStatus: 'PAID' };

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    }

    const bills = await Bill.find(filter);

    // Aggregate item sales
    const itemSales = {};

    bills.forEach(bill => {
      bill.items.forEach(item => {
        if (itemSales[item.name]) {
          itemSales[item.name].quantity += item.quantity;
          itemSales[item.name].totalSales += item.itemTotal;
        } else {
          itemSales[item.name] = {
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            totalSales: item.itemTotal
          };
        }
      });
    });

    // Convert to array and sort by quantity
    const itemSalesArray = Object.values(itemSales).sort((a, b) => b.quantity - a.quantity);

    res.status(200).json({
      success: true,
      count: itemSalesArray.length,
      data: itemSalesArray
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching item-wise sales'
    });
  }
};

// @desc    Get monthly revenue
// @route   GET /api/reports/monthly-revenue
// @access  Private (Owner only)
exports.getMonthlyRevenue = async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    const bills = await Bill.find({
      restaurantId: req.user.restaurantId,
      createdAt: { $gte: startDate, $lte: endDate },
      paymentStatus: 'PAID'
    });

    // Group by month
    const monthlyRevenue = Array(12).fill(0);

    bills.forEach(bill => {
      const month = bill.createdAt.getMonth();
      monthlyRevenue[month] += bill.totalAmount;
    });

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const data = monthlyRevenue.map((revenue, index) => ({
      month: monthNames[index],
      revenue
    }));

    res.status(200).json({
      success: true,
      year: targetYear,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching monthly revenue'
    });
  }
};

// @desc    Get dashboard summary
// @route   GET /api/reports/dashboard
// @access  Private
exports.getDashboardSummary = async (req, res) => {
  try {
    // Today's data
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [todayBills, openOrders, menuItemCount] = await Promise.all([
      Bill.find({
        restaurantId: req.user.restaurantId,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
        paymentStatus: 'PAID'
      }),
      Order.countDocuments({
        restaurantId: req.user.restaurantId,
        status: 'OPEN'
      }),
      MenuItem.countDocuments({
        restaurantId: req.user.restaurantId,
        isAvailable: true
      })
    ]);

    const todaySales = todayBills.reduce((sum, bill) => sum + bill.totalAmount, 0);
    const todayOrders = todayBills.length;

    res.status(200).json({
      success: true,
      data: {
        todaySales,
        todayOrders,
        openOrders,
        menuItemCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard summary'
    });
  }
};

// @desc    Get GSTR-1 Report (Sales by Invoice)
// @route   GET /api/reports/gstr1
// @access  Private
exports.getGSTR1Report = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'Date range required' });

    const bills = await Bill.find({
      restaurantId: req.user.restaurantId,
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      }
    }).populate('customer', 'name phone email gstNumber'); // Assuming GST number in customer

    const reportData = bills.map(bill => ({
      invoiceNumber: bill.billNumber,
      date: bill.createdAt,
      customerName: bill.customerName || 'Walk-in',
      gstin: bill.customer?.gstNumber || '', // If available
      totalValue: bill.totalAmount,
      taxableValue: bill.subtotal,
      totalTax: bill.tax,
      cgst: bill.taxBreakdown?.cgst || 0,
      sgst: bill.taxBreakdown?.sgst || 0,
      igst: bill.taxBreakdown?.igst || 0,
      placeOfSupply: 'State' // Default
    }));

    res.status(200).json({ success: true, count: reportData.length, data: reportData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Tax Rate Wise Report
// @route   GET /api/reports/tax-sales
// @access  Private
exports.getTaxRateReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const matchStage = {
      restaurantId: req.user.restaurantId,
    };

    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    }

    // Aggregate by Tax Rate in items
    const taxSummary = await Bill.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.taxRate',
          totalTaxableValue: { $sum: '$items.itemTotal' }, // itemTotal usually implies pre-tax or post-tax? 
          // Check Order Logic: itemTotal = price * quantity. 
          // If price is exclusive of tax, then itemTotal is Taxable Value.
          // If price is inclusive, we need back-calculation. 
          // Current logic: taxAmount = (itemTotal * taxRate) / 100 which implies itemTotal is Exclusive.
          totalTaxAmount: { $sum: '$items.taxAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Format output
    const formatted = taxSummary.map(t => ({
      taxRate: t._id || 0,
      taxableValue: t.totalTaxableValue,
      taxAmount: t.totalTaxAmount,
      totalValue: t.totalTaxableValue + t.totalTaxAmount
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get GSTR-3B Summary Report (Monthly Tax Summary)
// @route   GET /api/reports/gstr3b
// @access  Private (Owner only)
exports.getGSTR3BReport = async (req, res) => {
  try {
    const { month, year } = req.query;
    const { restaurantId } = req.user;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required (e.g., month=1&year=2026)'
      });
    }

    const targetMonth = parseInt(month);
    const targetYear = parseInt(year);

    // Get start and end of month
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    // Fetch all bills for the month
    const bills = await Bill.find({
      restaurantId,
      createdAt: { $gte: startDate, $lte: endDate },
      paymentStatus: 'PAID'
    });

    // Aggregate tax data
    const reportData = bills.reduce((acc, bill) => {
      acc.taxableValue += bill.subtotal || (bill.totalAmount - (bill.tax || 0));
      acc.totalTax += bill.tax || 0;

      if (bill.taxBreakdown && (bill.taxBreakdown.cgst !== undefined || bill.taxBreakdown.sgst !== undefined)) {
        acc.cgst += bill.taxBreakdown.cgst || 0;
        acc.sgst += bill.taxBreakdown.sgst || 0;
        acc.igst += bill.taxBreakdown.igst || 0;
        acc.cess += bill.taxBreakdown.cess || 0;
      } else if (bill.tax > 0) {
        // Fallback for old bills without breakdown
        acc.cgst += bill.tax / 2;
        acc.sgst += bill.tax / 2;
      }

      acc.totalInvoices++;
      acc.totalValue += bill.totalAmount || 0;
      return acc;
    }, {
      taxableValue: 0,
      totalTax: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
      totalInvoices: 0,
      totalValue: 0
    });

    res.status(200).json({
      success: true,
      data: {
        period: {
          month: targetMonth,
          year: targetYear,
          monthName: getMonthName(targetMonth)
        },
        summary: reportData,
        // GSTR-3B Table 3.1 format
        outwardSupplies: {
          taxable: {
            taxableValue: reportData.taxableValue,
            igst: reportData.igst,
            cgst: reportData.cgst,
            sgst: reportData.sgst,
            cess: reportData.cess
          },
          zeroRated: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
          nilRated: { taxableValue: 0 },
          exempt: { taxableValue: 0 }
        },
        taxPayable: {
          igst: reportData.igst,
          cgst: reportData.cgst,
          sgst: reportData.sgst,
          cess: reportData.cess,
          total: reportData.totalTax
        }
      }
    });
  } catch (error) {
    console.error('Error generating GSTR-3B report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating GSTR-3B report',
      error: error.message
    });
  }
};

// @desc    Download GSTR-3B Report as PDF
// @route   GET /api/reports/gstr3b/pdf
// @access  Private (Owner only)
exports.downloadGSTR3BPDF = async (req, res) => {
  try {
    const { month, year } = req.query;
    const { restaurantId } = req.user;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const targetMonth = parseInt(month);
    const targetYear = parseInt(year);

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    const bills = await Bill.find({
      restaurantId,
      createdAt: { $gte: startDate, $lte: endDate },
      paymentStatus: 'PAID'
    });

    const reportData = bills.reduce((acc, bill) => {
      acc.taxableValue += bill.subtotal || (bill.totalAmount - (bill.tax || 0));
      if (bill.taxBreakdown && (bill.taxBreakdown.cgst !== undefined || bill.taxBreakdown.sgst !== undefined)) {
        acc.cgst += bill.taxBreakdown.cgst || 0;
        acc.sgst += bill.taxBreakdown.sgst || 0;
        acc.igst += bill.taxBreakdown.igst || 0;
        acc.cess += bill.taxBreakdown.cess || 0;
      } else if (bill.tax > 0) {
        acc.cgst += bill.tax / 2;
        acc.sgst += bill.tax / 2;
      }
      return acc;
    }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 });

    const restaurant = await Restaurant.findById(restaurantId);

    const pdfBuffer = await pdfService.generateGSTR3BPDF(reportData, restaurant, targetMonth, targetYear);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=GSTR3B-${getMonthName(targetMonth)}-${targetYear}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Error generating GSTR-3B PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating GSTR-3B PDF',
      error: error.message
    });
  }
};

// @desc    Get Year-End Financial Report
// @route   GET /api/reports/year-end
// @access  Private (Owner only)
exports.getYearEndReport = async (req, res) => {
  try {
    const { financialYear } = req.query; // e.g., "2025-26"
    const { restaurantId } = req.user;

    if (!financialYear) {
      return res.status(400).json({
        success: false,
        message: 'Financial year is required (e.g., financialYear=2025-26)'
      });
    }

    // Parse financial year
    const [startYear] = financialYear.split('-');
    const fyStartYear = parseInt(startYear);

    // FY starts April 1 and ends March 31
    const startDate = new Date(fyStartYear, 3, 1); // April 1
    const endDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999); // March 31

    // Get all bills for the financial year
    const bills = await Bill.find({
      restaurantId,
      createdAt: { $gte: startDate, $lte: endDate },
      paymentStatus: 'PAID'
    });

    const orders = await Order.countDocuments({
      restaurantId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'PAID'
    });

    // Monthly breakdown
    const monthlyData = [];
    for (let m = 0; m < 12; m++) {
      // FY months: April(3) to March+1(2)
      const monthIndex = (m + 3) % 12;
      const year = m < 9 ? fyStartYear : fyStartYear + 1;
      const monthStart = new Date(year, monthIndex, 1);
      const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

      const monthBills = bills.filter(b =>
        b.createdAt >= monthStart && b.createdAt <= monthEnd
      );

      const revenue = monthBills.reduce((sum, b) => sum + b.totalAmount, 0);
      const orderCount = monthBills.length;
      const tax = monthBills.reduce((sum, b) => sum + (b.tax || 0), 0);

      monthlyData.push({
        month: getMonthName(monthIndex + 1),
        year,
        revenue,
        orders: orderCount,
        avgOrder: orderCount > 0 ? revenue / orderCount : 0,
        tax
      });
    }

    // Category-wise sales
    const categoryMap = {};
    bills.forEach(bill => {
      bill.items.forEach(item => {
        const cat = item.category || 'Other';
        if (!categoryMap[cat]) {
          categoryMap[cat] = { quantity: 0, revenue: 0 };
        }
        categoryMap[cat].quantity += item.quantity;
        categoryMap[cat].revenue += item.itemTotal;
      });
    });

    const totalRevenue = bills.reduce((sum, b) => sum + b.totalAmount, 0);
    const categoryData = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      quantity: data.quantity,
      revenue: data.revenue,
      percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0
    })).sort((a, b) => b.revenue - a.revenue);

    // Tax summary
    const taxSummary = bills.reduce((acc, bill) => {
      acc.totalTax += bill.tax || 0;
      if (bill.taxBreakdown && (bill.taxBreakdown.cgst !== undefined || bill.taxBreakdown.sgst !== undefined)) {
        acc.cgst += bill.taxBreakdown.cgst || 0;
        acc.sgst += bill.taxBreakdown.sgst || 0;
        acc.igst += bill.taxBreakdown.igst || 0;
        acc.cess += bill.taxBreakdown.cess || 0;
      } else if (bill.tax > 0) {
        acc.cgst += bill.tax / 2;
        acc.sgst += bill.tax / 2;
      }
      acc.discount += bill.discount || 0;
      return acc;
    }, { totalTax: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, discount: 0 });

    const reportData = {
      financialYear,
      totalRevenue,
      totalOrders: orders,
      totalBills: bills.length,
      avgOrderValue: bills.length > 0 ? totalRevenue / bills.length : 0,
      totalTax: taxSummary.totalTax,
      totalDiscount: taxSummary.discount,
      cgst: taxSummary.cgst,
      sgst: taxSummary.sgst,
      igst: taxSummary.igst,
      cess: taxSummary.cess,
      monthlyData,
      categoryData
    };

    res.status(200).json({
      success: true,
      data: reportData
    });
  } catch (error) {
    console.error('Error generating year-end report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating year-end report',
      error: error.message
    });
  }
};

// @desc    Download Year-End Report as PDF
// @route   GET /api/reports/year-end/pdf
// @access  Private (Owner only)
exports.downloadYearEndPDF = async (req, res) => {
  try {
    const { financialYear } = req.query;
    const { restaurantId } = req.user;

    if (!financialYear) {
      return res.status(400).json({
        success: false,
        message: 'Financial year is required'
      });
    }

    // Use the same logic as getYearEndReport to build data
    const [startYear] = financialYear.split('-');
    const fyStartYear = parseInt(startYear);

    const startDate = new Date(fyStartYear, 3, 1);
    const endDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999);

    const bills = await Bill.find({
      restaurantId,
      createdAt: { $gte: startDate, $lte: endDate },
      paymentStatus: 'PAID'
    });

    const orders = await Order.countDocuments({
      restaurantId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'PAID'
    });

    // Monthly breakdown
    const monthlyData = [];
    for (let m = 0; m < 12; m++) {
      const monthIndex = (m + 3) % 12;
      const year = m < 9 ? fyStartYear : fyStartYear + 1;
      const monthStart = new Date(year, monthIndex, 1);
      const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

      const monthBills = bills.filter(b =>
        b.createdAt >= monthStart && b.createdAt <= monthEnd
      );

      monthlyData.push({
        month: getMonthName(monthIndex + 1),
        revenue: monthBills.reduce((sum, b) => sum + b.totalAmount, 0),
        orders: monthBills.length,
        avgOrder: monthBills.length > 0 ? monthBills.reduce((sum, b) => sum + b.totalAmount, 0) / monthBills.length : 0,
        tax: monthBills.reduce((sum, b) => sum + (b.tax || 0), 0)
      });
    }

    const totalRevenue = bills.reduce((sum, b) => sum + b.totalAmount, 0);
    const taxSummary = bills.reduce((acc, bill) => {
      if (bill.taxBreakdown && (bill.taxBreakdown.cgst !== undefined || bill.taxBreakdown.sgst !== undefined)) {
        acc.cgst += bill.taxBreakdown.cgst || 0;
        acc.sgst += bill.taxBreakdown.sgst || 0;
        acc.igst += bill.taxBreakdown.igst || 0;
        acc.cess += bill.taxBreakdown.cess || 0;
      } else if (bill.tax > 0) {
        acc.cgst += bill.tax / 2;
        acc.sgst += bill.tax / 2;
      }
      acc.discount += bill.discount || 0;
      acc.totalTax += bill.tax || 0;
      return acc;
    }, { cgst: 0, sgst: 0, igst: 0, cess: 0, discount: 0, totalTax: 0 });

    const reportData = {
      totalRevenue,
      totalOrders: orders,
      totalBills: bills.length,
      avgOrderValue: bills.length > 0 ? totalRevenue / bills.length : 0,
      totalTax: taxSummary.totalTax,
      totalDiscount: taxSummary.discount,
      cgst: taxSummary.cgst,
      sgst: taxSummary.sgst,
      igst: taxSummary.igst,
      cess: taxSummary.cess,
      monthlyData,
      categoryData: []
    };

    const restaurant = await Restaurant.findById(restaurantId);
    const pdfBuffer = await pdfService.generateYearEndReportPDF(reportData, restaurant, financialYear);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Annual-Report-FY-${financialYear}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Error generating year-end PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating year-end PDF',
      error: error.message
    });
  }
};

// Helper function
function getMonthName(month) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1] || '';
}
