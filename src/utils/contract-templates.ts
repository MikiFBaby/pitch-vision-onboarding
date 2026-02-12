const PPS_LOGO_URL = "https://eyrxkirpubylgkkvcrlh.supabase.co/storage/v1/object/public/employee_documents/onboarding-attachments/pp-logo-black.png";

interface ContractData {
    firstName: string;
    lastName: string;
    effectiveDate: string; // YYYY-MM-DD format
    hourlyWage: string;
    country: "USA" | "Canada";
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "2-digit"
    });
}

export function generateUSAContractHtml(data: ContractData): string {
    const formattedDate = formatDate(data.effectiveDate);
    const currency = "USD";

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; line-height: 1.7; max-width: 800px; margin: 0 auto; padding: 40px; }
        h1 { text-align: center; font-size: 24px; margin-top: 40px; }
        h2 { font-size: 16px; margin-top: 30px; }
        p { margin: 10px 0; }
        ul { margin: 8px 0; padding-left: 24px; }
        li { margin: 4px 0; }
        .header-logo { text-align: center; margin-bottom: 10px; }
        .header-logo img { max-width: 200px; height: auto; }
        .signature-block { margin-top: 50px; }

        .bold { font-weight: bold; }
    </style>
</head>
<body>

<div class="header-logo">
    <img src="${PPS_LOGO_URL}" alt="Pitch Perfect Solutions" />
</div>

<h1>EMPLOYMENT CONTRACT (UNITED STATES)</h1>

<p>This Employment Contract (the "Agreement") is made effective as of <strong>${formattedDate}</strong>, between <strong>Pitch Perfect Solutions</strong> (the "Employer") and the undersigned Employee. This Agreement is governed by applicable United States federal and state employment laws.</p>

<h2>1. POSITION AND DUTIES</h2>
<p>Job Title: Customer Service Representative / Transfer Agent</p>
<p>The Employee agrees to perform all duties professionally and diligently, including but not limited to:</p>
<ul>
    <li>Being available and ready to work for the entire scheduled shift</li>
    <li>Maintaining a professional demeanor with customers and colleagues</li>
    <li>Making outbound calls as directed by the Employer</li>
    <li>Accurately and efficiently dispositioning all calls</li>
    <li>Achieving required sales and quality targets</li>
</ul>
<p>If a customer requests to be placed on a Do Not Call list, the Employee must immediately comply, read the approved DNC disclosure, and properly disposition the call.</p>

<h2>2. COMPENSATION AND BENEFITS</h2>
<p>The Employee shall be compensated as follows:</p>
<ul>
    <li>Hourly Wage: <strong>$${data.hourlyWage} ${currency} per hour</strong></li>
    <li>Commission: Average of $3.00 per billable transfer, subject to change</li>
    <li>Bonuses: Performance-based bonuses may apply at the Employer's discretion</li>
    <li>Paid Meetings: Mandatory 15-minute paid Zoom meeting</li>
</ul>

<h2>3. HOURS OF WORK & COMMISSION ELIGIBILITY</h2>
<ul>
    <li>Monday to Friday, scheduled campaign hours until 6:00 PM EST</li>
    <li>Two (2) paid 15-minute breaks and one (1) unpaid 30-minute lunch</li>
    <li>The Employee is expected to work a minimum of <strong>33 hours per week</strong></li>
</ul>
<p><strong>Commission Eligibility Condition:</strong><br>
Commissions will not be paid for any week in which the Employee both (a) works fewer than <strong>33 hours</strong> and (b) maintains a weekly SLA below <strong>3.0</strong>.</p>

<h2>4. PAUSED & WRAP-UP TIME</h2>
<p>The Employer will compensate the Employee for up to a combined maximum of <strong>thirty (30) minutes per workday</strong> for paused time and wrap-up time. Any paused or wrap-up time exceeding thirty (30) minutes in a single workday will be deducted from the Employee's total compensable working hours.</p>

<h2>5. EQUIPMENT & EXPENSES</h2>
<p>Employees are responsible for providing and maintaining all required equipment, including:</p>
<ul>
    <li>Windows-based desktop or laptop (minimum i5 processor, 8GB RAM)</li>
    <li>USB headset</li>
    <li>High-speed wired internet connection</li>
</ul>
<p>The Employer is not responsible for lost wages due to equipment or connectivity failures.</p>

<h2>6. MONITORING & RECORDINGS</h2>
<p>Calls may be recorded and monitored for quality assurance, compliance, and training purposes. Screen monitoring may occur during working hours only and will not access personal files.</p>

<h2>7. AT-WILL EMPLOYMENT</h2>
<p>Employment with Pitch Perfect Solutions is strictly <strong>at-will</strong>. Either the Employee or Employer may terminate employment at any time, with or without cause or notice, subject to applicable law.</p>

<h2>8. ACKNOWLEDGEMENT</h2>
<p>By signing below, the Employee confirms they have read, understood, and agree to the terms of this Agreement.</p>

<div class="signature-block">
    <p>Employee Name (Printed): <text-field name="Employee Name (Printed)" role="First Party" default="${data.firstName} ${data.lastName}" readonly="true" style="width: 300px; height: 24px; display: inline-block;"></text-field></p>
    <p>Employee Signature: <signature-field name="Employee Signature" role="First Party" required="true" style="width: 300px; height: 60px; display: inline-block;"></signature-field></p>
    <p>Date: <date-field name="Date Signed" role="First Party" required="true" style="width: 200px; height: 24px; display: inline-block;"></date-field></p>
    <br>
    <p>Employer Representative: Alisha Missen</p>
    <p>Title: HR Manager</p>
</div>

</body>
</html>
    `.trim();
}

export function generateCanadianContractHtml(data: ContractData): string {
    const formattedDate = formatDate(data.effectiveDate);
    const currency = "CAD";

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; line-height: 1.7; max-width: 800px; margin: 0 auto; padding: 40px; }
        h1 { text-align: center; font-size: 24px; margin-top: 40px; }
        h2 { font-size: 16px; margin-top: 30px; }
        p { margin: 10px 0; }
        ul { margin: 8px 0; padding-left: 24px; }
        li { margin: 4px 0; }
        .header-logo { text-align: center; margin-bottom: 10px; }
        .header-logo img { max-width: 200px; height: auto; }
        .signature-block { margin-top: 50px; }

        .bold { font-weight: bold; }
    </style>
</head>
<body>

<div class="header-logo">
    <img src="${PPS_LOGO_URL}" alt="Pitch Perfect Solutions" />
</div>

<h1>EMPLOYMENT CONTRACT (CANADA)</h1>

<p>This Employment Contract (the "Agreement") is made effective as of <strong>${formattedDate}</strong>, between <strong>Pitch Perfect Solutions</strong> (the "Employer") and the undersigned Employee.</p>

<h2>1. POSITION AND DUTIES</h2>
<p>Job Title: Customer Service Representative / Transfer Agent</p>
<p>The Employee agrees to perform all duties professionally and diligently, including but not limited to:</p>
<ul>
    <li>Being available and ready to work for the entire scheduled shift</li>
    <li>Maintaining a professional demeanor with customers and colleagues</li>
    <li>Making outbound calls as directed by the Employer</li>
    <li>Accurately and efficiently dispositioning all calls</li>
    <li>Achieving required sales and quality targets</li>
</ul>
<p>If a customer requests to be placed on a Do Not Call list, the Employee must immediately comply, read the approved DNC disclosure, and properly disposition the call.</p>

<h2>2. COMPENSATION AND BENEFITS</h2>
<p>The Employee shall be compensated as follows:</p>
<ul>
    <li>Hourly Wage: <strong>$${data.hourlyWage} ${currency} per hour</strong></li>
    <li>Commission: Average of $3.00 per billable transfer, subject to change</li>
    <li>Bonuses: Performance-based bonuses may apply at the Employer's discretion</li>
    <li>Paid Meetings: Mandatory 15-minute paid Zoom meeting</li>
</ul>
<p>Raises may be considered after three (3) months based on performance, compliance, attendance, teamwork, and overall job knowledge.</p>

<h2>3. HOURS OF WORK & COMMISSION ELIGIBILITY</h2>
<ul>
    <li>Monday to Friday, scheduled campaign hours until 6:00 PM EST</li>
    <li>Two (2) paid 15-minute breaks and one (1) unpaid 30-minute lunch</li>
    <li>The Employee is expected to work a minimum of <strong>33 hours per week</strong></li>
</ul>
<p><strong>Commission Eligibility Condition:</strong><br>
Commissions will not be paid for any week in which the Employee both (a) works fewer than <strong>33 hours</strong> and (b) maintains a weekly SLA below <strong>3.0</strong>.</p>

<h2>4. PAUSED & WRAP-UP TIME</h2>
<p>The Employer will compensate the Employee for up to a combined maximum of <strong>thirty (30) minutes per workday</strong> for paused time and wrap-up time. Any paused or wrap-up time exceeding thirty (30) minutes in a single workday will be deducted from the Employee's total compensable working hours.</p>

<h2>5. EQUIPMENT & EXPENSES</h2>
<p>Employees are responsible for providing and maintaining all required equipment, including:</p>
<ul>
    <li>Windows-based desktop or laptop (minimum i5 processor, 8GB RAM)</li>
    <li>USB headset</li>
    <li>High-speed wired internet connection</li>
</ul>
<p>The Employer is not responsible for lost wages due to equipment or connectivity failures.</p>

<h2>6. PERFORMANCE EXPECTATIONS</h2>
<ul>
    <li>Minimum of three (3) transfers per hour</li>
    <li>Minimum weekly SLA of 3.0</li>
    <li>To qualify for weekly bonuses, the Employee must maintain an SLA of 4.0+ and work at least 33 hours per week</li>
</ul>

<h2>7. MONITORING & RECORDINGS</h2>
<p>Calls may be recorded and monitored for quality assurance, compliance, and training purposes. Screen monitoring may occur during working hours only and will not access personal files.</p>

<h2>8. TERMINATION</h2>
<p>The first ninety (90) days of employment constitute a probationary period. During this time, employment may be terminated without cause, subject to applicable Canadian employment standards. Termination may also occur for misconduct, dishonesty, policy violations, or failure to meet performance expectations.</p>

<h2>9. ACKNOWLEDGEMENT</h2>
<p>By signing below, the Employee confirms they have read, understood, and agree to the terms of this Agreement.</p>

<div class="signature-block">
    <p>Employee Name (Printed): <text-field name="Employee Name (Printed)" role="First Party" default="${data.firstName} ${data.lastName}" readonly="true" style="width: 300px; height: 24px; display: inline-block;"></text-field></p>
    <p>Employee Signature: <signature-field name="Employee Signature" role="First Party" required="true" style="width: 300px; height: 60px; display: inline-block;"></signature-field></p>
    <p>Date: <date-field name="Date Signed" role="First Party" required="true" style="width: 200px; height: 24px; display: inline-block;"></date-field></p>
    <br>
    <p>Employer Representative: Alisha Missen</p>
    <p>Title: HR Manager</p>
</div>

</body>
</html>
    `.trim();
}

export function generateContractHtml(data: ContractData): string {
    if (data.country === "Canada") {
        return generateCanadianContractHtml(data);
    }
    return generateUSAContractHtml(data);
}
