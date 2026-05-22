/**
 * PDF Service - Generate GST compliant invoices and reports
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

class PDFService {
    constructor() {
        this.uploadsDir = path.join(__dirname, '../../uploads/invoices');
        this.ensureDirectory();
    }

    ensureDirectory() {
        if (!fs.existsSync(this.uploadsDir)) {
            fs.mkdirSync(this.uploadsDir, { recursive: true });
        }
    }

    /**
     * Generate GST compliant invoice PDF
     */
    async generateInvoicePDF(bill, restaurant, order) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50,
                    info: {
                        Title: `Invoice ${bill.billNumber}`,
                        Author: restaurant.name
                    }
                });

                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // Header Section
                this.drawHeader(doc, restaurant, bill);

                // Customer & Invoice Details
                this.drawInvoiceDetails(doc, bill);

                // Items Table
                this.drawItemsTable(doc, bill);

                // Tax Breakdown
                this.drawTaxBreakdown(doc, bill);

                // Totals
                this.drawTotals(doc, bill);

                // Footer
                this.drawFooter(doc, restaurant);

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    drawHeader(doc, restaurant, bill) {
        // Restaurant Name
        doc.fontSize(20).font('Helvetica-Bold')
            .text(restaurant.name, { align: 'center' });

        doc.moveDown(0.3);

        // Restaurant Address
        if (restaurant.address) {
            let addrText = restaurant.address;
            // Handle object or JSON string address
            if (typeof addrText === 'object') {
                addrText = `${addrText.street || ''}, ${addrText.city || ''}, ${addrText.state || ''} - ${addrText.pincode || ''}`;
            } else if (typeof addrText === 'string' && addrText.trim().startsWith('{')) {
                try {
                    const addr = JSON.parse(addrText);
                    addrText = `${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}`;
                } catch (e) {
                    // fall back to original string if parse fails
                }
            }

            // Cleanup formatting
            addrText = addrText.replace(/^, /, '').replace(/, ,/g, ',').replace(/, -/, ' -');

            doc.fontSize(10).font('Helvetica')
                .text(addrText, { align: 'center' });
        }

        // GST Number
        if (restaurant.gstNumber) {
            doc.fontSize(10)
                .text(`GSTIN: ${restaurant.gstNumber}`, { align: 'center' });
        }

        // Contact Info
        const contactInfo = [];
        if (restaurant.phone) contactInfo.push(`Phone: ${restaurant.phone}`);
        if (restaurant.email) contactInfo.push(`Email: ${restaurant.email}`);
        if (contactInfo.length) {
            doc.fontSize(9)
                .text(contactInfo.join(' | '), { align: 'center' });
        }

        doc.moveDown();

        // Invoice Title
        doc.fontSize(14).font('Helvetica-Bold')
            .text('TAX INVOICE', { align: 'center' });

        doc.moveDown();

        // Horizontal Line
        this.drawLine(doc);
    }

    drawInvoiceDetails(doc, bill) {
        const leftCol = 50;
        const rightCol = 350;
        const startY = doc.y; // Start tracking Y
        let y = startY;

        // Left Column Header
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Invoice Details:', leftCol, y);
        y += 15;

        doc.font('Helvetica').fontSize(9);
        doc.text(`Invoice No: ${bill.billNumber}`, leftCol, y); y += 12;
        doc.text(`Date: ${this.formatDate(bill.createdAt)}`, leftCol, y); y += 12;
        doc.text(`Time: ${this.formatTime(bill.createdAt)}`, leftCol, y); y += 12;
        doc.text(`Financial Year: ${bill.financialYear || 'N/A'}`, leftCol, y); y += 12;
        doc.text(`Table: ${bill.tableNumber}`, leftCol, y); y += 12;
        if (bill.paymentMode) {
            doc.text(`Payment Mode: ${bill.paymentMode}`, leftCol, y); y += 12;
        }

        const leftBottomY = y;

        // Right Column
        y = startY; // Reset Y for right col
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Bill To:', rightCol, y);
        y += 15;

        doc.font('Helvetica').fontSize(9);
        if (bill.customerName) {
            doc.text(`Name: ${bill.customerName}`, rightCol, y); y += 12;
        } else {
            doc.text('Walk-in Customer', rightCol, y); y += 12;
        }
        if (bill.customerPhone) {
            doc.text(`Phone: ${bill.customerPhone}`, rightCol, y); y += 12;
        }
        if (bill.customerEmail) {
            doc.text(`Email: ${bill.customerEmail}`, rightCol, y); y += 12;
        }

        const rightBottomY = y;

        // Advance doc.y to the max of both columns so subsequent sections don't overlap
        doc.y = Math.max(leftBottomY, rightBottomY) + 10;

        this.drawLine(doc);
    }

    drawItemsTable(doc, bill) {
        const tableTop = doc.y + 10;
        const colWidths = {
            sno: 30,
            item: 170,
            hsn: 65,
            qty: 40,
            rate: 65,
            tax: 50,
            amount: 70
        };

        const drawHeader = (yPos) => {
            let x = 50;
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('S.No', x, yPos, { width: colWidths.sno });
            x += colWidths.sno;
            doc.text('Item Description', x, yPos, { width: colWidths.item });
            x += colWidths.item;
            doc.text('HSN/SAC', x, yPos, { width: colWidths.hsn });
            x += colWidths.hsn;
            doc.text('Qty', x, yPos, { width: colWidths.qty, align: 'center' });
            x += colWidths.qty;
            doc.text('Rate', x, yPos, { width: colWidths.rate, align: 'right' });
            x += colWidths.rate;
            doc.text('Tax%', x, yPos, { width: colWidths.tax, align: 'center' });
            x += colWidths.tax;
            doc.text('Amount', x, yPos, { width: colWidths.amount, align: 'right' });

            // Header underline
            doc.moveTo(50, yPos + 15).lineTo(545, yPos + 15).stroke();
        };

        // Draw initial header
        drawHeader(tableTop);

        // Table Rows
        let y = tableTop + 25;
        doc.font('Helvetica').fontSize(8);

        bill.items.forEach((item, index) => {
            // Check page break
            if (y > 700) {
                doc.addPage();
                y = 50;
                drawHeader(y);
                y += 25;
            }

            let x = 50;
            const rowHeight = 35; // Increased height to prevent overlap

            doc.text(String(index + 1), x, y, { width: colWidths.sno });
            x += colWidths.sno;

            // Item name with variant/modifiers
            let itemName = item.name;
            if (item.variant && item.variant.name) {
                itemName += ` (${item.variant.name})`;
            }
            doc.text(itemName, x, y, { width: colWidths.item });
            x += colWidths.item;

            doc.text(item.hsnCode || '-', x, y, { width: colWidths.hsn });
            x += colWidths.hsn;
            doc.text(String(item.quantity), x, y, { width: colWidths.qty, align: 'center' });
            x += colWidths.qty;
            doc.text(`Rs. ${item.price.toFixed(2)}`, x, y, { width: colWidths.rate, align: 'right' });
            x += colWidths.rate;
            doc.text(`${item.taxRate || 0}%`, x, y, { width: colWidths.tax, align: 'center' });
            x += colWidths.tax;
            doc.text(`Rs. ${item.itemTotal.toFixed(2)}`, x, y, { width: colWidths.amount, align: 'right' });

            y += rowHeight;
        });

        doc.y = y;
        this.drawLine(doc);
    }

    drawTaxBreakdown(doc, bill) {
        if (!bill.taxBreakdown) return;

        doc.moveDown();
        doc.fontSize(10).font('Helvetica-Bold')
            .text('Tax Breakdown:', 50);

        doc.font('Helvetica').fontSize(9);

        const taxTable = [];
        if (bill.taxBreakdown.cgst > 0) {
            taxTable.push({ name: 'CGST', amount: bill.taxBreakdown.cgst });
        }
        if (bill.taxBreakdown.sgst > 0) {
            taxTable.push({ name: 'SGST', amount: bill.taxBreakdown.sgst });
        }
        if (bill.taxBreakdown.igst > 0) {
            taxTable.push({ name: 'IGST', amount: bill.taxBreakdown.igst });
        }
        if (bill.taxBreakdown.cess > 0) {
            taxTable.push({ name: 'Cess', amount: bill.taxBreakdown.cess });
        }

        taxTable.forEach(tax => {
            doc.text(`${tax.name}: Rs. ${tax.amount.toFixed(2)}`, 350, doc.y, { align: 'right', width: 195 });
        });

        doc.moveDown();
    }

    drawTotals(doc, bill) {
        const rightAlign = 350;
        const valueAlign = 450;

        doc.font('Helvetica').fontSize(10);

        // Subtotal
        doc.text('Subtotal:', rightAlign, doc.y);
        doc.text(`Rs. ${bill.subtotal.toFixed(2)}`, valueAlign, doc.y - 12, { align: 'right', width: 95 });

        // Tax
        doc.text('Tax:', rightAlign, doc.y);
        doc.text(`Rs. ${(bill.tax || 0).toFixed(2)}`, valueAlign, doc.y - 12, { align: 'right', width: 95 });

        // Discount
        if (bill.discount > 0) {
            doc.text('Discount:', rightAlign, doc.y);
            doc.text(`-Rs. ${bill.discount.toFixed(2)}`, valueAlign, doc.y - 12, { align: 'right', width: 95 });

            if (bill.couponCode) {
                const pct = bill.subtotal ? ((bill.discount / bill.subtotal) * 100) : 0;
                const pctStr = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1);

                // Add coupon section as requested
                doc.font('Helvetica-Oblique').fontSize(8)
                    .text(`Coupon code ${bill.couponCode} was applied by owner (${pctStr}%)`, rightAlign - 50, doc.y - 2, { align: 'right', width: 245 });
                doc.font('Helvetica').fontSize(10);
            }
        }

        // Loyalty Points
        if (bill.loyaltyPointsRedeemed > 0) {
            doc.text('Loyalty Points:', rightAlign, doc.y);
            doc.text(`-Rs. ${bill.loyaltyPointsRedeemed.toFixed(2)}`, valueAlign, doc.y - 12, { align: 'right', width: 95 });
        }

        doc.moveDown(0.5);

        // Total
        doc.font('Helvetica-Bold').fontSize(12);
        doc.text('TOTAL:', rightAlign, doc.y);
        doc.text(`Rs. ${bill.totalAmount.toFixed(2)}`, valueAlign, doc.y - 14, { align: 'right', width: 95 });

        // Amount in words
        doc.moveDown();
        doc.font('Helvetica').fontSize(9);
        doc.text(`Amount in Words: ${this.numberToWords(bill.totalAmount)} Rupees Only`, 50);

        doc.moveDown();
        this.drawLine(doc);
    }

    drawFooter(doc, restaurant) {
        doc.moveDown();

        // Terms & Conditions
        doc.fontSize(8).font('Helvetica-Bold')
            .text('Terms & Conditions:', 50);
        doc.font('Helvetica').fontSize(7);
        doc.text('1. Goods once sold will not be taken back.', 50);
        doc.text('2. Subject to local jurisdiction.', 50);
        doc.text('3. E&OE (Errors and Omissions Excepted)', 50);

        doc.moveDown(2);

        // Thank you message
        doc.fontSize(10).font('Helvetica-Bold')
            .text('Thank you for dining with us!', { align: 'center' });

        doc.fontSize(8).font('Helvetica')
            .text('This is a computer generated invoice', { align: 'center' });
    }

    drawLine(doc) {
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
    }

    formatDate(date) {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    formatTime(date) {
        return new Date(date).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    numberToWords(num) {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

        const convertLessThanThousand = (n) => {
            if (n === 0) return '';
            if (n < 10) return ones[n];
            if (n < 20) return teens[n - 10];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
            return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertLessThanThousand(n % 100) : '');
        };

        const amount = Math.floor(num);
        if (amount === 0) return 'Zero';

        let result = '';

        // Crores (1,00,00,000)
        if (amount >= 10000000) {
            result += convertLessThanThousand(Math.floor(amount / 10000000)) + ' Crore ';
        }

        // Lakhs (1,00,000)
        const lakhs = Math.floor((amount % 10000000) / 100000);
        if (lakhs) {
            result += convertLessThanThousand(lakhs) + ' Lakh ';
        }

        // Thousands
        const thousands = Math.floor((amount % 100000) / 1000);
        if (thousands) {
            result += convertLessThanThousand(thousands) + ' Thousand ';
        }

        // Hundreds
        const remainder = amount % 1000;
        if (remainder) {
            result += convertLessThanThousand(remainder);
        }

        return result.trim();
    }

    /**
     * Generate GSTR-3B Summary Report PDF
     */
    async generateGSTR3BPDF(reportData, restaurant, month, year) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // Header
                doc.fontSize(16).font('Helvetica-Bold')
                    .text('GSTR-3B SUMMARY REPORT', { align: 'center' });
                doc.moveDown(0.5);

                doc.fontSize(12).font('Helvetica')
                    .text(restaurant.name, { align: 'center' });
                if (restaurant.gstNumber) {
                    doc.text(`GSTIN: ${restaurant.gstNumber}`, { align: 'center' });
                }
                doc.moveDown(0.5);
                doc.fontSize(10)
                    .text(`Period: ${this.getMonthName(month)} ${year}`, { align: 'center' });

                doc.moveDown(2);

                // Section 3.1 - Outward Supplies
                doc.fontSize(12).font('Helvetica-Bold')
                    .text('3.1 Details of Outward Supplies and Inward Supplies liable to reverse charge');
                doc.moveDown();

                this.drawGSTR3BTable(doc, [
                    ['Nature of Supplies', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess'],
                    ['(a) Outward taxable supplies (other than zero rated, nil rated)',
                        `Rs. ${reportData.taxableValue.toFixed(2)}`,
                        `Rs. ${reportData.igst.toFixed(2)}`,
                        `Rs. ${reportData.cgst.toFixed(2)}`,
                        `Rs. ${reportData.sgst.toFixed(2)}`,
                        `Rs. ${reportData.cess.toFixed(2)}`
                    ],
                    ['(b) Outward taxable supplies (zero rated)', 'Rs. 0.00', 'Rs. 0.00', 'Rs. 0.00', 'Rs. 0.00', 'Rs. 0.00'],
                    ['(c) Other outward supplies (Nil rated, exempted)', 'Rs. 0.00', '-', '-', '-', '-'],
                    ['(d) Inward supplies (liable to reverse charge)', 'Rs. 0.00', 'Rs. 0.00', 'Rs. 0.00', 'Rs. 0.00', 'Rs. 0.00'],
                    ['(e) Non-GST outward supplies', 'Rs. 0.00', '-', '-', '-', '-']
                ]);

                doc.moveDown(2);

                // Section 3.2 - Interstate Supplies
                doc.fontSize(12).font('Helvetica-Bold')
                    .text('3.2 Inter-State Supplies');
                doc.moveDown();

                this.drawGSTR3BTable(doc, [
                    ['Supplies', 'Taxable Value', 'IGST'],
                    ['Supplies to Unregistered Persons', 'Rs. 0.00', 'Rs. 0.00'],
                    ['Supplies to Composition Taxable Persons', 'Rs. 0.00', 'Rs. 0.00'],
                    ['Supplies to UIN holders', 'Rs. 0.00', 'Rs. 0.00']
                ]);

                doc.moveDown(2);

                // Section 5 - Tax Payable
                doc.fontSize(12).font('Helvetica-Bold')
                    .text('5. Values of exempt, nil-rated and non-GST inward supplies');
                doc.moveDown();

                const totalTax = reportData.cgst + reportData.sgst + reportData.igst + reportData.cess;
                this.drawGSTR3BTable(doc, [
                    ['Description', 'IGST', 'CGST', 'SGST', 'Cess'],
                    ['Tax Payable',
                        `Rs. ${reportData.igst.toFixed(2)}`,
                        `Rs. ${reportData.cgst.toFixed(2)}`,
                        `Rs. ${reportData.sgst.toFixed(2)}`,
                        `Rs. ${reportData.cess.toFixed(2)}`
                    ],
                    ['Tax Paid through Cash',
                        `Rs. ${reportData.igst.toFixed(2)}`,
                        `Rs. ${reportData.cgst.toFixed(2)}`,
                        `Rs. ${reportData.sgst.toFixed(2)}`,
                        `Rs. ${reportData.cess.toFixed(2)}`
                    ]
                ]);

                doc.moveDown(3);

                // Summary
                doc.fontSize(14).font('Helvetica-Bold')
                    .text(`Total Tax Liability: Rs. ${totalTax.toFixed(2)}`);

                // Footer
                doc.moveDown(3);
                doc.fontSize(8).font('Helvetica')
                    .text(`Generated on: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
                doc.text('This is a system generated report for reference only.', { align: 'center' });

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    drawGSTR3BTable(doc, rows) {
        const startX = 50;
        const colWidth = (545 - 50) / rows[0].length;
        let y = doc.y;
        const rowHeight = 45; // Increased height to prevent overlap

        rows.forEach((row, rowIndex) => {
            // Check page break
            if (y + rowHeight > 750) {
                doc.addPage();
                y = 50;
            }

            let x = startX;
            const isHeader = rowIndex === 0;

            doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);

            row.forEach((cell, cellIndex) => {
                doc.text(cell, x + 2, y + 6, {
                    width: colWidth - 4,
                    align: cellIndex === 0 ? 'left' : 'right'
                });

                // Draw cell border
                doc.rect(x, y, colWidth, rowHeight).stroke();
                x += colWidth;
            });

            y += rowHeight;
        });

        doc.y = y;
        doc.x = 50; // Reset X to left margin
    }

    getMonthName(month) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return months[month - 1] || '';
    }

    /**
     * Generate Year-End Financial Report PDF
     */
    async generateYearEndReportPDF(reportData, restaurant, financialYear) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                const chunks = [];
                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // Header
                doc.fontSize(18).font('Helvetica-Bold')
                    .text('ANNUAL FINANCIAL REPORT', { align: 'center' });
                doc.moveDown(0.5);

                doc.fontSize(14).font('Helvetica')
                    .text(restaurant.name, { align: 'center' });
                if (restaurant.gstNumber) {
                    doc.text(`GSTIN: ${restaurant.gstNumber}`, { align: 'center' });
                }
                doc.moveDown(0.5);
                doc.fontSize(12)
                    .text(`Financial Year: ${financialYear}`, { align: 'center' });

                doc.moveDown(2);
                this.drawLine(doc);

                // Executive Summary
                doc.fontSize(14).font('Helvetica-Bold')
                    .text('Executive Summary');
                doc.moveDown();

                const summaryData = [
                    ['Total Revenue', `Rs. ${reportData.totalRevenue.toFixed(2)}`],
                    ['Total Orders', reportData.totalOrders.toString()],
                    ['Total Bills', reportData.totalBills.toString()],
                    ['Average Order Value', `Rs. ${reportData.avgOrderValue.toFixed(2)}`],
                    ['Total Tax Collected', `Rs. ${reportData.totalTax.toFixed(2)}`],
                    ['Total Discounts Given', `Rs. ${reportData.totalDiscount.toFixed(2)}`]
                ];

                doc.font('Helvetica').fontSize(10);
                summaryData.forEach(([label, value]) => {
                    doc.text(`${label}: ${value}`, 50);
                });

                doc.moveDown(2);
                this.drawLine(doc);

                // Monthly Breakdown
                doc.fontSize(14).font('Helvetica-Bold')
                    .text('Monthly Revenue Breakdown');
                doc.moveDown();

                this.drawGSTR3BTable(doc, [
                    ['Month', 'Revenue', 'Orders', 'Avg Order', 'Tax Collected'],
                    ...reportData.monthlyData.map(m => [
                        m.month,
                        `Rs. ${m.revenue.toFixed(2)}`,
                        m.orders.toString(),
                        `Rs. ${m.avgOrder.toFixed(2)}`,
                        `Rs. ${m.tax.toFixed(2)}`
                    ])
                ]);

                doc.moveDown(2);

                // Category-wise Sales
                if (reportData.categoryData && reportData.categoryData.length > 0) {
                    doc.fontSize(14).font('Helvetica-Bold')
                        .text('Category-wise Sales');
                    doc.moveDown();

                    this.drawGSTR3BTable(doc, [
                        ['Category', 'Items Sold', 'Revenue', '% of Total'],
                        ...reportData.categoryData.map(c => [
                            c.category,
                            c.quantity.toString(),
                            `Rs. ${c.revenue.toFixed(2)}`,
                            `${c.percentage.toFixed(1)}%`
                        ])
                    ]);
                }

                doc.moveDown(2);

                // Tax Summary
                doc.fontSize(14).font('Helvetica-Bold')
                    .text('Tax Summary');
                doc.moveDown();

                doc.font('Helvetica').fontSize(10);
                doc.text(`Total CGST Collected: Rs. ${reportData.cgst.toFixed(2)}`);
                doc.text(`Total SGST Collected: Rs. ${reportData.sgst.toFixed(2)}`);
                doc.text(`Total IGST Collected: Rs. ${reportData.igst.toFixed(2)}`);
                doc.text(`Total Cess Collected: Rs. ${reportData.cess.toFixed(2)}`);

                // Footer
                doc.moveDown(3);
                doc.fontSize(8).font('Helvetica')
                    .text(`Report Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'center' });
                doc.text('This report is for internal use and tax filing reference.', { align: 'center' });

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = new PDFService();
