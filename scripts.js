const ENCRYPTION_KEY = 'FDRecordSecretKey';

console.log('scripts.js loaded at:', new Date()); // Debug log to confirm loading

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupDrawer();
});

function encryptData(data) { return CryptoJS.AES.encrypt(JSON.stringify(data), ENCRYPTION_KEY).toString(); }
function decryptData(encryptedData) {
    if (!encryptedData) return [];
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
        return JSON.parse(bytes.toString(CryptoJS.enc.Utf8)) || [];
    } catch (e) {
        console.error('Decryption error:', e);
        return [];
    }
}

function initializeApp() {
    console.log('Initializing app...'); // Debug log
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('fdStartDate')) document.getElementById('fdStartDate').setAttribute('max', today);
    loadAccountHolders();

    if (document.getElementById('addAccountHolderBtn')) {
        const addBtn = document.getElementById('addAccountHolderBtn');
        addBtn.addEventListener('click', addAccountHolder);
        console.log('Add Account Holder button listener added'); // Debug log
        document.getElementById('saveRecordBtn').addEventListener('click', saveRecord);
        document.getElementById('clearAllRecordsBtn').addEventListener('click', clearAllRecords);
        document.getElementById('exportToPDFBtn').addEventListener('click', exportToPDF);
        document.getElementById('exportToExcelBtn').addEventListener('click', exportToExcel);
        document.getElementById('importExcelBtn').addEventListener('click', importFromExcel);
        document.getElementById('bulkDeleteBtn').addEventListener('click', bulkDelete);
        document.getElementById('bulkExportBtn').addEventListener('click', bulkExport);
        document.getElementById('selectAll').addEventListener('change', toggleSelectAll);
        document.getElementById('generatePieChartBtn').addEventListener('click', () => generateChart('pie'));
        document.getElementById('generateBarChartBtn').addEventListener('click', () => generateChart('bar'));
        document.getElementById('accountHolderSelect').addEventListener('change', loadAccountRecords);
        document.getElementById('searchInput').addEventListener('input', filterRecords);
        document.getElementById('bankName').addEventListener('input', updateBankSuggestions);
        ['amount', 'duration', 'durationUnit', 'interestRate', 'fdStartDate'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', updateInterestPreview);
        });
    }

    if (document.getElementById('calculateInterestBtn')) {
        document.getElementById('calculateInterestBtn').addEventListener('click', calculateAndDisplayInterest);
        document.getElementById('clearAllSavedInterestBtn').addEventListener('click', clearAllSavedInterest);
        document.getElementById('exportSavedInterestToPDFBtn').addEventListener('click', exportSavedInterestToPDF);
        document.getElementById('exportSavedInterestToExcelBtn').addEventListener('click', exportSavedInterestToExcel);
        document.getElementById('fdRecordSelect').addEventListener('change', updateInterestFields);
        document.getElementById('interestCalculationPeriod').addEventListener('change', toggleCustomFields);
        document.getElementById('accountHolderSelect').addEventListener('change', loadAccountRecords);
        loadSavedInterest();
    }

    document.getElementById('backupBtn').addEventListener('click', backupAllData);
    document.getElementById('restoreBtn').addEventListener('click', restoreData);
    document.getElementById('interestLink').addEventListener('click', () => {
        const selectedHolder = document.getElementById('accountHolderSelect')?.value;
        if (selectedHolder) localStorage.setItem('selectedHolder', selectedHolder);
    });
    setInterval(() => {
        const name = document.getElementById('accountHolderSelect')?.value;
        if (name) loadAccountRecords();
    }, 86400000);
}

function setupDrawer() {
    const toggle = document.querySelector('.drawer-toggle');
    const drawer = document.querySelector('.drawer');
    toggle.addEventListener('click', () => drawer.classList.toggle('open'));
}

function formatCurrency(amount) { return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(amount); }
function getAccountHolders() { return decryptData(localStorage.getItem('accountHolders')); }
function saveAccountHolders(accountHolders) { localStorage.setItem('accountHolders', encryptData(accountHolders)); }
function getAccountRecords(accountHolderName) { return decryptData(localStorage.getItem(`records_${accountHolderName}`)); }
function saveAccountRecords(accountHolderName, records) { localStorage.setItem(`records_${accountHolderName}`, encryptData(records)); }
function formatDate(dateString) { return new Date(dateString).toISOString().split('T')[0]; }
function calculateMaturityDate(startDate, duration, unit) {
    const date = new Date(startDate);
    const durationValue = parseInt(duration);
    if (unit === 'Days') date.setDate(date.getDate() + durationValue);
    else if (unit === 'Months') date.setMonth(date.getMonth() + durationValue);
    else if (unit === 'Years') date.setFullYear(date.getFullYear() + durationValue);
    return date.toISOString().split('T')[0];
}
function calculateRenewalDaysRemaining(maturityDate) {
    const today = new Date();
    const maturity = new Date(maturityDate);
    return Math.ceil((maturity - today) / (1000 * 60 * 60 * 24));
}

function calculateInterest(amount, interestRate, duration, unit, interestType = 'simple', frequency = 'atMaturity', fromDate, toDate) {
    const principal = parseFloat(amount);
    const rate = parseFloat(interestRate) / 100;
    let days, years;

    if (fromDate && toDate) {
        const start = new Date(fromDate);
        const end = new Date(toDate);
        days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    } else {
        if (unit === 'Days') days = parseInt(duration);
        else if (unit === 'Months') days = Math.round(parseInt(duration) * 30.44);
        else if (unit === 'Years') days = Math.round(parseInt(duration) * 365.25);
    }
    years = days / 365.25;

    const frequencyMap = { 'daily': 365, 'monthly': 12, 'quarterly': 4, 'annually': 1, 'atMaturity': 1 };
    const n = frequencyMap[frequency] || 1;

    let interest;
    if (interestType === 'simple') {
        interest = principal * rate * years;
        if (frequency !== 'atMaturity') {
            const periods = years * n;
            interest = (principal * rate / n) * periods;
        }
    } else if (interestType === 'compound') {
        interest = principal * Math.pow(1 + rate / n, n * years) - principal;
        if (frequency !== 'atMaturity') {
            const periods = Math.floor(years * n);
            interest = 0;
            let balance = principal;
            const reinvest = confirm('For compound interest with periodic payments, reinvest interest? (Yes = Reinvest, No = Withdraw)');
            for (let i = 0; i < periods; i++) {
                const periodInterest = balance * (rate / n);
                interest += periodInterest;
                if (reinvest) balance += periodInterest;
            }
        }
    }
    return parseFloat(interest.toFixed(2));
}

function validateInputs(bankName, amount, duration, interestRate, fdStartDate, fdCertificate) {
    const today = new Date().toISOString().split('T')[0];
    if (!bankName || amount <= 0 || isNaN(amount) || duration <= 0 || isNaN(duration) || interestRate < 0 || isNaN(interestRate) || !fdStartDate || fdStartDate > today || !fdCertificate) {
        alert("Please enter valid values for all fields.");
        return false;
    }
    return true;
}

function loadAccountHolders() {
    const select = document.getElementById('accountHolderSelect');
    if (!select) return;
    select.innerHTML = '';
    const holders = getAccountHolders();
    holders.forEach(holder => {
        const option = document.createElement('option');
        option.value = option.textContent = holder;
        select.appendChild(option);
    });
    const selectedHolder = localStorage.getItem('selectedHolder') || (holders.length ? holders[0] : null);
    if (selectedHolder) {
        select.value = selectedHolder;
        loadAccountRecords();
    } else {
        if (document.getElementById('accountHolderNameDisplay')) document.getElementById('accountHolderNameDisplay').textContent = "No Account Holder Selected";
        document.getElementById('records')?.innerHTML = '';
        if (document.getElementById('fdRecordSelect')) document.getElementById('fdRecordSelect').innerHTML = '';
    }
    updateBankSuggestions();
}

function addAccountHolder() {
    const input = document.getElementById('newAccountHolder');
    const name = input.value.trim();
    console.log('Adding account holder:', name); // Debug log
    if (!name) return alert("Please enter a valid name.");
    const holders = getAccountHolders();
    if (!holders.includes(name)) {
        holders.push(name);
        saveAccountHolders(holders);
        loadAccountHolders();
        document.getElementById('accountHolderSelect').value = name;
    }
    input.value = '';
}

function loadAccountRecords() {
    const name = document.getElementById('accountHolderSelect')?.value;
    if (!name) return;
    if (document.getElementById('accountHolderNameDisplay')) document.getElementById('accountHolderNameDisplay').textContent = name;
    let records = getAccountRecords(name).map(record => ({
        ...record,
        fdRenewalDaysRemaining: calculateRenewalDaysRemaining(record.fdMaturityDate)
    }));
    saveAccountRecords(name, records);
    displayRecords(records, name);
    if (document.getElementById('fdRecordSelect')) populateFDRecordSelect(records);
}

function saveRecord() {
    const name = document.getElementById('accountHolderSelect').value;
    if (!name) return alert("Select an account holder first.");
    const bankName = document.getElementById('bankName').value;
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const duration = parseInt(document.getElementById('duration').value) || 0;
    const durationUnit = document.getElementById('durationUnit').value;
    const interestRate = parseFloat(document.getElementById('interestRate').value) || 0;
    const fdStartDate = document.getElementById('fdStartDate').value;
    const fdCertificate = document.getElementById('fdCertificate').value;

    if (!validateInputs(bankName, amount, duration, interestRate, fdStartDate, fdCertificate)) return;

    const fdMaturityDate = calculateMaturityDate(fdStartDate, duration, durationUnit);
    const fdRenewalDaysRemaining = calculateRenewalDaysRemaining(fdMaturityDate);
    const interest = calculateInterest(amount, interestRate, duration, durationUnit);
    const record = { bankName, amount, duration, durationUnit, interestRate, fdStartDate, fdMaturityDate, fdRenewalDaysRemaining, interest, fdCertificate };
    let records = getAccountRecords(name);
    const editIndex = document.getElementById('editIndex').value;
    if (editIndex !== '') records[editIndex] = record;
    else records.push(record);
    saveAccountRecords(name, records);
    loadAccountRecords();
    clearInputs();
}

function editRecord(accountHolderName, index) {
    if (confirm("Edit this record?")) {
        const records = getAccountRecords(accountHolderName);
        const record = records[index];
        document.getElementById('bankName').value = record.bankName;
        document.getElementById('amount').value = record.amount;
        document.getElementById('duration').value = record.duration;
        document.getElementById('durationUnit').value = record.durationUnit;
        document.getElementById('interestRate').value = record.interestRate;
        document.getElementById('fdStartDate').value = record.fdStartDate;
        document.getElementById('fdCertificate').value = record.fdCertificate;
        document.getElementById('editIndex').value = index;
    }
}

function deleteRecord(accountHolderName, index) {
    if (confirm("Delete this record?")) {
        let records = getAccountRecords(accountHolderName);
        records.splice(index, 1);
        saveAccountRecords(accountHolderName, records);
        loadAccountRecords();
    }
}

function clearInputs() {
    document.getElementById('bankName').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('duration').value = '';
    document.getElementById('durationUnit').value = 'Days';
    document.getElementById('interestRate').value = '5';
    document.getElementById('fdStartDate').value = '';
    document.getElementById('fdCertificate').value = 'obtained';
    document.getElementById('editIndex').value = '';
    updateInterestPreview();
}

function clearAllRecords() {
    const name = document.getElementById('accountHolderSelect').value;
    if (!name || !confirm("Clear all records?")) return;
    localStorage.removeItem(`records_${name}`);
    loadAccountRecords();
}

function exportToPDF() {
    const name = document.getElementById('accountHolderSelect').value;
    const records = getAccountRecords(name);
    if (!records.length) return alert("No records to export.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(`FD Records - ${name}`, 10, 10);
    const tableData = records.map(r => [
        r.bankName, formatCurrency(r.amount), r.duration, r.durationUnit, r.interestRate,
        formatDate(r.fdStartDate), formatDate(r.fdMaturityDate), r.fdRenewalDaysRemaining, formatCurrency(r.interest), r.fdCertificate, r.fdRenewalDaysRemaining > 0 ? 'Active' : 'Matured'
    ]);
    doc.autoTable({
        head: [['Bank', 'Amount', 'Duration', 'Unit', 'Rate', 'Start', 'Maturity', 'Days', 'Interest', 'Certificate', 'Status']],
        body: tableData,
        startY: 20
    });
    doc.save(`${name}_FD_Records.pdf`);
}

function exportToExcel() {
    const name = document.getElementById('accountHolderSelect').value;
    const records = getAccountRecords(name);
    if (!records.length) return alert("No records to export.");
    const data = records.map(r => ({
        'Bank Name': r.bankName, 'Amount': r.amount, 'Duration': r.duration, 'Unit': r.durationUnit, 'Interest Rate': r.interestRate,
        'Start Date': formatDate(r.fdStartDate), 'Maturity Date': formatDate(r.fdMaturityDate), 'Days Remaining': r.fdRenewalDaysRemaining,
        'Interest': r.interest, 'FD Certificate': r.fdCertificate, 'Status': r.fdRenewalDaysRemaining > 0 ? 'Active' : 'Matured'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'FD Records');
    XLSX.writeFile(wb, `${name}_FD_Records.xlsx`);
}

function importFromExcel() {
    const name = document.getElementById('accountHolderSelect').value;
    if (!name) return alert("Select an account holder first.");
    const file = document.getElementById('importExcelFile').files[0];
    if (!file) return alert("Select an Excel file.");
    const reader = new FileReader();
    reader.onload = e => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        const records = jsonData.map(row => {
            const bankName = row['Bank Name'] || '';
            const amount = parseFloat(row['Amount']) || 0;
            const duration = parseInt(row['Duration']) || 0;
            const durationUnit = row['Unit'] || 'Days';
            const interestRate = parseFloat(row['Interest Rate']) || 0;
            const fdStartDate = row['Start Date'] || '';
            const fdCertificate = row['FD Certificate'] || 'not obtained';
            if (!validateInputs(bankName, amount, duration, interestRate, fdStartDate, fdCertificate)) throw new Error('Invalid data');
            const fdMaturityDate = calculateMaturityDate(fdStartDate, duration, durationUnit);
            const fdRenewalDaysRemaining = calculateRenewalDaysRemaining(fdMaturityDate);
            const interest = calculateInterest(amount, interestRate, duration, durationUnit);
            return { bankName, amount, duration, durationUnit, interestRate, fdStartDate, fdMaturityDate, fdRenewalDaysRemaining, interest, fdCertificate };
        });
        let existingRecords = getAccountRecords(name);
        existingRecords = existingRecords.concat(records);
        saveAccountRecords(name, existingRecords);
        loadAccountRecords();
        updateBankSuggestions();
        alert("Imported successfully!");
        document.getElementById('importExcelFile').value = '';
    };
    reader.readAsArrayBuffer(file);
}

function populateFDRecordSelect(records) {
    const select = document.getElementById('fdRecordSelect');
    if (!select) return;
    select.innerHTML = '';
    records.forEach((record, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${record.bankName} - ${formatCurrency(record.amount)}`;
        select.appendChild(option);
    });
    if (records.length) updateInterestFields();
}

function updateInterestFields() {
    const name = document.getElementById('accountHolderSelect')?.value;
    const records = getAccountRecords(name);
    const index = document.getElementById('fdRecordSelect')?.value;
    if (records && records[index]) {
        document.getElementById('interestBankName').value = records[index].bankName;
        document.getElementById('interestAmount').value = records[index].amount;
    } else {
        document.getElementById('interestBankName').value = '';
        document.getElementById('interestAmount').value = '';
    }
}

let calculatedInterestValue = 0;
let calculatedInterestRecord = {};
function calculateAndDisplayInterest() {
    const name = document.getElementById('accountHolderSelect')?.value;
    if (!name) return document.getElementById('calculatedInterest').textContent = "No account holder selected.";
    const records = getAccountRecords(name);
    const index = document.getElementById('fdRecordSelect').value;
    if (!records || !records[index]) return document.getElementById('calculatedInterest').textContent = "No FD selected.";
    const record = records[index];
    let amount = record.amount;
    let interestRate = record.interestRate;
    let duration = record.duration;
    let unit = record.durationUnit;
    const period = document.getElementById('interestCalculationPeriod').value;
    const interestType = document.getElementById('interestType').value;
    const frequency = document.getElementById('interestFrequency').value;
    const fromDate = document.getElementById('interestFromDate').value;
    const toDate = document.getElementById('interestToDate').value;

    if (period === 'fullCustom') {
        amount = parseFloat(document.getElementById('customInterestAmount').value) || 0;
        interestRate = parseFloat(document.getElementById('customInterestRate').value) || 0;
        duration = parseFloat(document.getElementById('customInterestDuration').value) || 0;
        unit = document.getElementById('customInterestDurationUnit').value;
        if (amount <= 0 || interestRate < 0 || duration <= 0) return document.getElementById('calculatedInterest').textContent = "Invalid values.";
    }

    let interest;
    if (period === 'whole') interest = calculateInterest(amount, interestRate, duration, unit, interestType, frequency);
    else if (period === 'custom') {
        if (!fromDate || !toDate || new Date(fromDate) > new Date(toDate)) return document.getElementById('calculatedInterest').textContent = "Invalid dates.";
        interest = calculateInterest(amount, interestRate, duration, unit, interestType, frequency, fromDate, toDate);
    } else if (period === 'fullCustom') interest = calculateInterest(amount, interestRate, duration, unit, interestType, frequency);

    calculatedInterestValue = interest;
    document.getElementById('calculatedInterest').textContent = formatCurrency(interest);
    calculatedInterestRecord = {
        accountHolderName: name,
        bankName: document.getElementById('interestBankName').value,
        amount, interestRate, interestType, frequency,
        fdStartDate: fromDate || record.fdStartDate,
        fdMaturityDate: toDate || record.fdMaturityDate,
        interest: calculatedInterestValue,
        interestCalculationPeriod: period
    };
    saveCalculatedInterest();
}

function getSavedInterest() { return decryptData(localStorage.getItem('savedInterest')); }
function saveCalculatedInterest() {
    let records = getSavedInterest();
    records.push(calculatedInterestRecord);
    localStorage.setItem('savedInterest', encryptData(records));
    loadSavedInterest();
    document.getElementById('calculatedInterest').textContent = '0';
}

function loadSavedInterest() {
    const list = document.getElementById('savedInterestList');
    if (!list) return;
    list.innerHTML = '';
    const records = getSavedInterest();
    records.forEach((record, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.accountHolderName}</td><td>${record.bankName}</td><td>${formatCurrency(record.amount)}</td>
            <td>${record.interestRate}</td><td>${record.interestType}</td><td>${record.frequency}</td>
            <td>${formatDate(record.fdStartDate)}</td><td>${formatDate(record.fdMaturityDate)}</td>
            <td>${record.interestCalculationPeriod}</td><td>${formatCurrency(record.interest)}</td>
            <td><button class="editSavedBtn" data-index="${index}">Edit</button><button class="deleteSavedBtn" data-index="${index}">Delete</button></td>
        `;
        list.appendChild(row);
    });
    document.querySelectorAll('.editSavedBtn').forEach(btn => btn.addEventListener('click', () => editSavedInterest(btn.dataset.index)));
    document.querySelectorAll('.deleteSavedBtn').forEach(btn => btn.addEventListener('click', () => deleteSavedInterest(btn.dataset.index)));
}

function editSavedInterest(index) {
    if (!confirm("Edit this interest record?")) return;
    const records = getSavedInterest();
    const record = records[index];
    document.getElementById('accountHolderSelect').value = record.accountHolderName;
    loadAccountRecords();
    document.getElementById('interestBankName').value = record.bankName;
    document.getElementById('interestAmount').value = record.amount;
    document.getElementById('customInterestAmount').value = record.amount;
    document.getElementById('customInterestRate').value = record.interestRate;
    document.getElementById('interestFromDate').value = record.fdStartDate;
    document.getElementById('interestToDate').value = record.fdMaturityDate;
    document.getElementById('interestCalculationPeriod').value = record.interestCalculationPeriod;
    document.getElementById('interestType').value = record.interestType;
    document.getElementById('interestFrequency').value = record.frequency;
    calculatedInterestValue = record.interest;
    document.getElementById('calculatedInterest').textContent = formatCurrency(calculatedInterestValue);
    records.splice(index, 1);
    localStorage.setItem('savedInterest', encryptData(records));
    loadSavedInterest();
}

function deleteSavedInterest(index) {
    if (!confirm("Delete this interest record?")) return;
    let records = getSavedInterest();
    records.splice(index, 1);
    localStorage.setItem('savedInterest', encryptData(records));
    loadSavedInterest();
}

function clearAllSavedInterest() {
    if (!confirm("Clear all saved interest records?")) return;
    localStorage.removeItem('savedInterest');
    loadSavedInterest();
}

function exportSavedInterestToPDF() {
    const records = getSavedInterest();
    if (!records.length) return alert("No saved interest records.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Saved Interest Records", 10, 10);
    const tableData = records.map(r => [
        r.accountHolderName, r.bankName, formatCurrency(r.amount), r.interestRate, r.interestType, r.frequency,
        formatDate(r.fdStartDate), formatDate(r.fdMaturityDate), r.interestCalculationPeriod, formatCurrency(r.interest)
    ]);
    doc.autoTable({
        head: [['Holder', 'Bank', 'Amount', 'Rate', 'Type', 'Frequency', 'Start', 'End', 'Period', 'Interest']],
        body: tableData,
        startY: 20
    });
    doc.save('Saved_Interest_Records.pdf');
}

function exportSavedInterestToExcel() {
    const records = getSavedInterest();
    if (!records.length) return alert("No saved interest records.");
    const data = records.map(r => ({
        'Holder': r.accountHolderName, 'Bank': r.bankName, 'Amount': r.amount, 'Rate': r.interestRate, 'Type': r.interestType,
        'Frequency': r.frequency, 'Start': formatDate(r.fdStartDate), 'End': formatDate(r.fdMaturityDate), 'Period': r.interestCalculationPeriod, 'Interest': r.interest
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Saved Interest');
    XLSX.writeFile(wb, 'Saved_Interest_Records.xlsx');
}

function sortTable(field, accountHolderName) {
    let records = getAccountRecords(accountHolderName);
    const isNumeric = ['amount', 'duration', 'interestRate', 'fdRenewalDaysRemaining', 'interest'].includes(field);
    records.sort((a, b) => isNumeric ? a[field] - b[field] : a[field].localeCompare(b[field]));
    if (records[0][field] === getAccountRecords(accountHolderName)[0][field]) records.reverse();
    saveAccountRecords(accountHolderName, records);
    loadAccountRecords();
}

function filterRecords() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const name = document.getElementById('accountHolderSelect').value;
    const records = getAccountRecords(name).filter(r => r.bankName.toLowerCase().includes(search) || r.amount.toString().includes(search));
    displayRecords(records, name);
}

function displayRecords(records, accountHolderName) {
    const tbody = document.getElementById('records');
    if (!tbody) return;
    tbody.innerHTML = '';
    records.forEach((record, index) => {
        const days = record.fdRenewalDaysRemaining;
        const renewalClass = days > 15 ? 'renewal-green' : days >= 10 ? 'renewal-yellow' : days >= 1 ? 'renewal-red' : 'renewal-expired expired-circle';
        const certClass = record.fdCertificate === 'obtained' ? 'certificate-obtained' : 'certificate-not-obtained';
        const status = days > 0 ? 'Active' : 'Matured';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="recordCheckbox" data-index="${index}"></td>
            <td class="${renewalClass}">${record.bankName}</td><td class="${renewalClass}">${formatCurrency(record.amount)}</td>
            <td>${record.duration}</td><td>${record.durationUnit}</td><td>${record.interestRate}</td>
            <td>${formatDate(record.fdStartDate)}</td><td>${formatDate(record.fdMaturityDate)}</td>
            <td class="${renewalClass}">${days}</td><td>${formatCurrency(record.interest)}</td>
            <td class="${certClass}">${record.fdCertificate}</td><td>${status}</td>
            <td><button class="editBtn" data-account="${accountHolderName}" data-index="${index}">Edit</button>
            <button class="deleteBtn" data-account="${accountHolderName}" data-index="${index}">Delete</button></td>
        `;
        tbody.appendChild(row);
    });
    document.querySelectorAll('.editBtn').forEach(btn => btn.addEventListener('click', () => editRecord(btn.dataset.account, btn.dataset.index)));
    document.querySelectorAll('.deleteBtn').forEach(btn => btn.addEventListener('click', () => deleteRecord(btn.dataset.account, btn.dataset.index)));
    document.querySelectorAll('.sortable').forEach(header => header.addEventListener('click', () => sortTable(header.dataset.sort, accountHolderName)));
    updateSummary(records);
    updateMaturityCalendar(records);
}

function updateSummary(records) {
    if (!document.getElementById('totalInvestment')) return;
    const totalInvestment = records.reduce((sum, r) => sum + r.amount, 0);
    const totalInterest = records.reduce((sum, r) => sum + r.interest, 0);
    const activeFDs = records.filter(r => r.fdRenewalDaysRemaining > 0).length;
    const maturedFDs = records.filter(r => r.fdRenewalDaysRemaining <= 0).length;
    document.getElementById('totalInvestment').textContent = formatCurrency(totalInvestment);
    document.getElementById('totalInterest').textContent = formatCurrency(totalInterest);
    document.getElementById('activeFDs').textContent = activeFDs;
    document.getElementById('maturedFDs').textContent = maturedFDs;

    const bankBreakdown = {};
    records.forEach(r => {
        bankBreakdown[r.bankName] = bankBreakdown[r.bankName] || { count: 0, totalAmount: 0 };
        bankBreakdown[r.bankName].count++;
        bankBreakdown[r.bankName].totalAmount += r.amount;
    });
    const tbody = document.getElementById('bankBreakdown');
    tbody.innerHTML = '';
    for (const [bank, data] of Object.entries(bankBreakdown)) {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${bank}</td><td>${data.count}</td><td>${formatCurrency(data.totalAmount)}</td>`;
        tbody.appendChild(row);
    }
}

function updateMaturityCalendar(records) {
    const list = document.getElementById('maturityCalendar');
    if (!list) return;
    list.innerHTML = '';
    const upcoming = records.filter(r => r.fdRenewalDaysRemaining >= 0 && r.fdRenewalDaysRemaining <= 30);
    const expired = records.filter(r => r.fdRenewalDaysRemaining < 0);
    const allMaturities = [...upcoming, ...expired].sort((a, b) => a.fdRenewalDaysRemaining - b.fdRenewalDaysRemaining);
    allMaturities.forEach(record => {
        const days = record.fdRenewalDaysRemaining;
        const className = days > 20 ? 'renewal-green' : days > 10 ? 'renewal-yellow' : days >= 0 ? 'renewal-red' : 'renewal-expired expired-circle';
        const li = document.createElement('li');
        li.className = className;
        li.textContent = `${record.bankName} - ${formatDate(record.fdMaturityDate)} (${days} days)`;
        list.appendChild(li);
    });
    if (!allMaturities.length) list.innerHTML = '<li>No upcoming maturities within 30 days or expired FDs.</li>';
}

function updateInterestPreview() {
    if (!document.getElementById('interestPreview')) return;
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const duration = parseInt(document.getElementById('duration').value) || 0;
    const unit = document.getElementById('durationUnit').value;
    const interestRate = parseFloat(document.getElementById('interestRate').value) || 0;
    const fdStartDate = document.getElementById('fdStartDate').value;
    const interest = (amount > 0 && duration > 0 && interestRate >= 0 && fdStartDate) ? calculateInterest(amount, interestRate, duration, unit) : 0;
    document.getElementById('interestPreview').textContent = formatCurrency(interest);
}

function generateChart(type) {
    const name = document.getElementById('accountHolderSelect').value;
    const records = getAccountRecords(name);
    if (!records.length) return alert("No records to chart.");
    const bankTotals = {};
    records.forEach(r => bankTotals[r.bankName] = (bankTotals[r.bankName] || 0) + r.amount);
    const labels = Object.keys(bankTotals);
    const data = Object.values(bankTotals);
    const colors = labels.map(() => '#' + Math.floor(Math.random() * 16777215).toString(16));
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    document.getElementById('chartContainer').classList.remove('hidden');
    if (window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type,
        data: {
            labels,
            datasets: [{
                label: 'Total Investment',
                data,
                backgroundColor: type === 'pie' ? colors : '#3498db',
                borderColor: '#2c3e50',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top' }, title: { display: true, text: `Portfolio by Bank (${type})` } }
        }
    });
}

function backupAllData() {
    const allData = { accountHolders: getAccountHolders(), accountRecords: {}, savedInterest: getSavedInterest() };
    getAccountHolders().forEach(holder => allData.accountRecords[holder] = getAccountRecords(holder));
    const blob = new Blob([JSON.stringify(allData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'FD_Full_Backup.json';
    a.click();
    URL.revokeObjectURL(url);
}

function restoreData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const data = JSON.parse(e.target.result);
            localStorage.setItem('accountHolders', encryptData(data.accountHolders));
            for (const [holder, records] of Object.entries(data.accountRecords)) saveAccountRecords(holder, records);
            localStorage.setItem('savedInterest', encryptData(data.savedInterest));
            loadAccountHolders();
            alert('Data restored!');
        };
        reader.readAsText(file);
    };
    input.click();
}

function updateBankSuggestions() {
    const suggestions = document.getElementById('bankSuggestions');
    if (!suggestions) return;
    suggestions.innerHTML = '';
    const allRecords = [];
    getAccountHolders().forEach(holder => allRecords.push(...getAccountRecords(holder)));
    const uniqueBanks = [...new Set(allRecords.map(r => r.bankName))];
    uniqueBanks.forEach(bank => {
        const option = document.createElement('option');
        option.value = bank;
        suggestions.appendChild(option);
    });
}

function bulkDelete() {
    const name = document.getElementById('accountHolderSelect').value;
    const selected = getSelectedIndices();
    if (!name || !selected.length || !confirm(`Delete ${selected.length} records?`)) return;
    let records = getAccountRecords(name);
    selected.sort((a, b) => b - a).forEach(index => records.splice(index, 1));
    saveAccountRecords(name, records);
    loadAccountRecords();
}

function bulkExport() {
    const name = document.getElementById('accountHolderSelect').value;
    const selected = getSelectedIndices();
    if (!name || !selected.length) return alert("Select records to export.");
    const records = getAccountRecords(name).filter((_, i) => selected.includes(i));
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(`Selected FD Records - ${name}`, 10, 10);
    const tableData = records.map(r => [
        r.bankName, formatCurrency(r.amount), r.duration, r.durationUnit, r.interestRate,
        formatDate(r.fdStartDate), formatDate(r.fdMaturityDate), r.fdRenewalDaysRemaining, formatCurrency(r.interest), r.fdCertificate, r.fdRenewalDaysRemaining > 0 ? 'Active' : 'Matured'
    ]);
    doc.autoTable({
        head: [['Bank', 'Amount', 'Duration', 'Unit', 'Rate', 'Start', 'Maturity', 'Days', 'Interest', 'Certificate', 'Status']],
        body: tableData,
        startY: 20
    });
    doc.save(`${name}_Selected_FD_Records.pdf`);
}

function getSelectedIndices() {
    return Array.from(document.querySelectorAll('.recordCheckbox:checked')).map(cb => parseInt(cb.dataset.index));
}

function toggleSelectAll() {
    const checked = document.getElementById('selectAll').checked;
    document.querySelectorAll('.recordCheckbox').forEach(cb => cb.checked = checked);
}

function toggleCustomFields() {
    const period = document.getElementById('interestCalculationPeriod').value;
    const customFields = ['customInterestAmountLabel', 'customInterestRateLabel', 'customInterestDurationLabel', 'customInterestDurationUnitLabel'];
    const dateFields = ['interestFromDate', 'interestToDate'].map(id => document.getElementById(id).parentElement);
    customFields.forEach(id => document.getElementById(id).classList.toggle('hidden', period !== 'fullCustom'));
    dateFields.forEach(field => field.classList.toggle('hidden', period !== 'custom'));
}
