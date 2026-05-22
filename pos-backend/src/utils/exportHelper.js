const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

/**
 * Generate CSV from data
 */
exports.generateCSV = (data, fields) => {
  try {
    const parser = new Parser({ fields });
    return parser.parse(data);
  } catch (error) {
    console.error('CSV generation error:', error);
    throw new Error('Failed to generate CSV');
  }
};

/**
 * Generate PDF Report with proper table formatting
 */
exports.generatePDF = (title, data, res) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 30,
        size: 'A4',
        layout: 'landscape'
      });
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${title}.pdf"`);
      
      // Pipe PDF to response
      doc.pipe(res);

      // Add header with background
      doc.rect(0, 0, doc.page.width, 80).fill('#2563eb');
      doc.fillColor('#ffffff')
         .fontSize(24)
         .text(title, 0, 25, { align: 'center' });
      doc.fontSize(10)
         .text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 0, 55, { align: 'center' });
      
      doc.fillColor('#000000');
      doc.moveDown(3);

      if (Array.isArray(data) && data.length > 0) {
        // Get table headers
        const headers = Object.keys(data[0]);
        const startY = 100;
        let currentY = startY;

        // Calculate column widths
        const tableWidth = doc.page.width - 60;
        const colWidth = tableWidth / headers.length;

        // Draw table headers
        doc.fontSize(10).font('Helvetica-Bold');
        headers.forEach((header, i) => {
          const x = 30 + (i * colWidth);
          doc.rect(x, currentY, colWidth, 25).fillAndStroke('#f3f4f6', '#d1d5db');
          doc.fillColor('#000000').text(header, x + 5, currentY + 8, {
            width: colWidth - 10,
            align: 'left'
          });
        });

        currentY += 25;
        doc.font('Helvetica');

        // Draw table rows
        data.forEach((row, rowIndex) => {
          // Check if we need a new page
          if (currentY > doc.page.height - 60) {
            doc.addPage();
            currentY = 50;
          }

          const rowHeight = 20;
          const fillColor = rowIndex % 2 === 0 ? '#ffffff' : '#f9fafb';

          headers.forEach((header, i) => {
            const x = 30 + (i * colWidth);
            doc.rect(x, currentY, colWidth, rowHeight).fillAndStroke(fillColor, '#e5e7eb');
            doc.fillColor('#000000')
               .fontSize(9)
               .text(String(row[header] || ''), x + 5, currentY + 5, {
                 width: colWidth - 10,
                 align: 'left',
                 ellipsis: true
               });
          });

          currentY += rowHeight;
        });

        // Add summary
        doc.moveDown(2);
        doc.fontSize(10)
           .fillColor('#6b7280')
           .text(`Total Records: ${data.length}`, 30, currentY + 10);
      }

      // Footer on each page
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8)
           .fillColor('#9ca3af')
           .text(
             `Page ${i + 1} of ${range.count}`,
             0,
             doc.page.height - 30,
             { align: 'center' }
           );
      }

      doc.on('error', reject);
      doc.end();
      
      // Wait for the stream to finish
      doc.on('finish', resolve);
      doc.on('end', resolve);
    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
};

/**
 * Format daily sales data for export
 */
exports.formatDailySalesData = (bills) => {
  return bills.map(bill => {
    const itemsList = bill.items.map(i => `${i.name} x${i.quantity}`).join(' | ');
    const subtotal = (bill.subtotal || 0).toFixed(2);
    const tax = (bill.tax || 0).toFixed(2);
    const discount = (bill.discount || 0).toFixed(2);
    const total = (bill.totalAmount || bill.grandTotal || 0).toFixed(2);
    const time = new Date(bill.createdAt || bill.issuedAt).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return {
      'Bill Number': bill.billNumber,
      'Table Number': bill.tableNumber || 'N/A',
      'Items': itemsList,
      'Subtotal': subtotal,
      'Tax': tax,
      'Discount': discount,
      'Total Amount': total,
      'Payment Mode': bill.paymentMode || 'N/A',
      'Time': time
    };
  });
};

/**
 * Format monthly revenue data for export
 */
exports.formatMonthlyRevenueData = (dailyBreakdown) => {
  return dailyBreakdown.map(day => {
    const date = new Date(day.date).toLocaleDateString('en-IN');
    const orders = day.bills || day.orders || 0;
    const revenue = (day.sales || day.revenue || 0).toFixed(2);
    const avgOrder = (day.sales && day.bills ? (day.sales / day.bills).toFixed(2) : '0.00');

    return {
      'Date': date,
      'Orders': orders,
      'Revenue': revenue,
      'Avg Order Value': avgOrder
    };
  });
};

/**
 * Format item-wise sales data for export
 */
exports.formatItemWiseSalesData = (itemsData) => {
  const items = itemsData.items || itemsData;
  return items.map((item, index) => ({
    'Rank': index + 1,
    'Item Name': item.name,
    'Quantity Sold': item.quantity || item.quantitySold || 0,
    'Total Revenue': (item.revenue || 0).toFixed(2),
    'Avg Price': (item.averagePrice || 0).toFixed(2)
  }));
};

/**
 * Format table metrics data for export
 */
exports.formatTableMetricsData = (tablesData) => {
  const tables = tablesData.tables || tablesData;
  return tables.map(table => ({
    'Table Number': table.table || table.tableNumber,
    'Total Orders': table.totalOrders || 0,
    'Total Revenue': (table.totalRevenue || 0).toFixed(2),
    'Avg Order Value': (table.averageOrderValue || 0).toFixed(2),
    'Avg Prep Time (min)': (table.averagePrepTime || 0).toFixed(1)
  }));
};
