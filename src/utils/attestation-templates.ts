const PPS_LOGO_URL = "https://eyrxkirpubylgkkvcrlh.supabase.co/storage/v1/object/public/employee_documents/onboarding-attachments/pp-logo-black.png";

interface AttestationData {
    employeeName: string;
    country: "USA" | "Canada";
}

export function generateUSAAttestationHtml(data: AttestationData): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; line-height: 1.7; max-width: 800px; margin: 0 auto; padding: 40px; }
        h1 { text-align: center; font-size: 22px; margin-top: 40px; }
        h2 { text-align: center; font-size: 14px; font-weight: normal; color: #555; margin-top: -10px; }
        p { margin: 10px 0; }
        ul { margin: 8px 0; padding-left: 24px; list-style-type: disc; }
        li { margin: 6px 0; }
        .header-logo { text-align: center; margin-bottom: 10px; }
        .header-logo img { max-width: 200px; height: auto; }
        .employee-ref { background: #f5f5f5; padding: 12px 16px; border-radius: 6px; margin: 20px 0; font-size: 15px; }
        .signature-block { margin-top: 50px; }
        .legal-notice { font-size: 13px; color: #333; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 16px; }
    </style>
</head>
<body>

<div class="header-logo">
    <img src="${PPS_LOGO_URL}" alt="Pitch Perfect Solutions" />
</div>

<h1>Employment Eligibility &amp; Identity Verification Attestation</h1>
<h2>(High-Volume Hiring Version)</h2>

<div class="employee-ref">
    <strong>Employee:</strong> ${data.employeeName}
</div>

<p>I hereby certify that I have examined the original identity and employment authorization documentation presented by the individual named above for purposes of compliance with the Immigration Reform and Control Act (IRCA) and applicable federal regulations.</p>

<p><strong>I attest that:</strong></p>
<ul>
    <li>The document(s) presented appear on their face to be genuine and unaltered</li>
    <li>The document(s) reasonably appear to relate to the individual presenting them</li>
    <li>Verification was completed within the legally required timeframe</li>
    <li>The review was conducted in good faith and without unlawful discrimination</li>
    <li>All procedures were performed in accordance with Company policy and applicable federal and state law</li>
</ul>

<p>I understand that the Company relies on a reasonable, good faith visual inspection of documents and is not responsible for forensic authentication of government-issued identification.</p>

<p class="legal-notice">I further acknowledge that knowingly accepting fraudulent documents, failing to complete required verification steps, or misrepresenting completion of this review may subject me and/or the Company to civil or criminal penalties under applicable U.S. law.</p>

<p><strong>This attestation is made under penalty of perjury.</strong></p>

<p>By signing below, I confirm that the verification was completed honestly, accurately, and in compliance with Company policy.</p>

<div class="signature-block">
    <p>Verifier Name: <text-field name="Verifier Name" role="Verifier" readonly="true" style="width: 300px; height: 24px; display: inline-block;"></text-field></p>
    <p>Title: <text-field name="Title" role="Verifier" readonly="true" style="width: 300px; height: 24px; display: inline-block;"></text-field></p>
    <p>Signature: <signature-field name="Signature" role="Verifier" required="true" style="width: 300px; height: 60px; display: inline-block;"></signature-field></p>
    <p>Date: <date-field name="Date" role="Verifier" required="true" style="width: 200px; height: 24px; display: inline-block;"></date-field></p>
</div>

</body>
</html>
    `.trim();
}

export function generateCanadianAttestationHtml(data: AttestationData): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; line-height: 1.7; max-width: 800px; margin: 0 auto; padding: 40px; }
        h1 { text-align: center; font-size: 22px; margin-top: 40px; }
        h2 { text-align: center; font-size: 14px; font-weight: normal; color: #555; margin-top: -10px; }
        p { margin: 10px 0; }
        ul { margin: 8px 0; padding-left: 24px; list-style-type: disc; }
        li { margin: 6px 0; }
        .header-logo { text-align: center; margin-bottom: 10px; }
        .header-logo img { max-width: 200px; height: auto; }
        .employee-ref { background: #f5f5f5; padding: 12px 16px; border-radius: 6px; margin: 20px 0; font-size: 15px; }
        .signature-block { margin-top: 50px; }
        .legal-notice { font-size: 13px; color: #333; margin-top: 30px; border-top: 1px solid #ddd; padding-top: 16px; }
    </style>
</head>
<body>

<div class="header-logo">
    <img src="${PPS_LOGO_URL}" alt="Pitch Perfect Solutions" />
</div>

<h1>Identification Attestation</h1>
<h2>(High-Volume Hiring Version)</h2>

<div class="employee-ref">
    <strong>Employee:</strong> ${data.employeeName}
</div>

<p>I hereby certify that I have reviewed the Social Insurance Number (SIN) and supporting identification documentation presented by the individual named above for employment purposes.</p>

<p><strong>I attest that:</strong></p>
<ul>
    <li>The SIN and identification documents were reviewed in good faith</li>
    <li>The documents reasonably appear to relate to the individual presenting them</li>
    <li>The verification process was conducted in accordance with applicable federal and provincial employment legislation</li>
    <li>The review was completed in a non-discriminatory manner</li>
    <li>The Company relies on a reasonable visual review and is not responsible for forensic authentication of government-issued documents</li>
</ul>

<p class="legal-notice">I understand that knowingly accepting fraudulent documentation or failing to exercise reasonable due diligence may expose me and/or the Company to penalties under applicable Canadian law.</p>

<p>This attestation confirms that reasonable verification procedures were followed in accordance with Company policy and applicable legislation.</p>

<div class="signature-block">
    <p>Verifier Name: <text-field name="Verifier Name" role="Verifier" readonly="true" style="width: 300px; height: 24px; display: inline-block;"></text-field></p>
    <p>Title: <text-field name="Title" role="Verifier" readonly="true" style="width: 300px; height: 24px; display: inline-block;"></text-field></p>
    <p>Signature: <signature-field name="Signature" role="Verifier" required="true" style="width: 300px; height: 60px; display: inline-block;"></signature-field></p>
    <p>Date: <date-field name="Date" role="Verifier" required="true" style="width: 200px; height: 24px; display: inline-block;"></date-field></p>
</div>

</body>
</html>
    `.trim();
}

export function generateAttestationHtml(data: AttestationData): string {
    if (data.country === "Canada") {
        return generateCanadianAttestationHtml(data);
    }
    return generateUSAAttestationHtml(data);
}
