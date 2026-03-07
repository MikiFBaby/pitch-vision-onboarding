import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  DECISIONHR_DEFAULTS,
  SSN_ITEM_ID,
  PAYROLL_USA_ITEM_ID,
  type DecisionHRPayload,
  getWorkCompCode,
  formatDateMMDDYYYY,
  normalizeSSN,
} from '@/lib/decisionhr-config';
import { generateDecisionHRWorkbook } from '@/utils/decisionhr-xlsx';

const fileRequestUrl = process.env.DECISIONHR_FILE_REQUEST_URL;

/**
 * POST /api/hr/decisionhr/push
 *
 * Generate DecisionHR Bulk EE Import xlsx and upload to shared drive.
 *
 * Body: { newHireId, employeeId, reportsTo, submittedBy }
 */
export async function POST(req: NextRequest) {
  try {
    const { newHireId, employeeId, reportsTo, submittedBy } = await req.json();

    if (!employeeId || !submittedBy) {
      return NextResponse.json({ error: 'employeeId and submittedBy required' }, { status: 400 });
    }

    // 1. Fetch employee data
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employee_directory')
      .select(
        'id, first_name, last_name, email, hourly_wage, hired_at, contract_effective_date, state, street_address, city, zip_code'
      )
      .eq('id', employeeId)
      .maybeSingle();

    if (empError || !employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // 2. Fetch SSN from onboarding_progress
    let ssnRaw: string | null = null;
    if (newHireId) {
      const { data: ssnProgress } = await supabaseAdmin
        .from('onboarding_progress')
        .select('notes')
        .eq('new_hire_id', newHireId)
        .eq('checklist_item_id', SSN_ITEM_ID)
        .maybeSingle();
      ssnRaw = ssnProgress?.notes ?? null;
    }

    // 3. Validate required fields
    const errors: string[] = [];
    if (!ssnRaw) errors.push('SSN not entered');
    if (!employee.state) errors.push('State not set (upload Photo ID for OCR or enter manually)');
    if (!employee.hourly_wage) errors.push('Hourly wage not set');

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Missing required data', details: errors }, { status: 400 });
    }

    // 4. Build payload
    const hireDate = employee.contract_effective_date || employee.hired_at;
    const hireDateFormatted = formatDateMMDDYYYY(hireDate);
    const ssn = normalizeSSN(ssnRaw!);
    const workCompCode = getWorkCompCode(employee.state) ?? '';

    const payload: DecisionHRPayload = {
      firstName: employee.first_name || '',
      lastName: employee.last_name || '',
      authentication: DECISIONHR_DEFAULTS.authentication,
      employeeIdentification: DECISIONHR_DEFAULTS.employeeIdentification,
      ssn,
      loginEmail: employee.email || '',
      employeeId: '',
      clockNumber: '',
      originalHireDate: hireDateFormatted,
      liabilityStart: hireDateFormatted,
      distributionCode: '',
      benefitsWaitingPeriodStart: hireDateFormatted,
      unionMember: DECISIONHR_DEFAULTS.unionMember,
      union: '',
      effectiveDate: hireDateFormatted,
      status: DECISIONHR_DEFAULTS.status,
      pullIntoPayroll: DECISIONHR_DEFAULTS.pullIntoPayroll,
      position: DECISIONHR_DEFAULTS.position,
      socCode: '',
      homeDivision: '',
      workLocation: DECISIONHR_DEFAULTS.workLocation,
      department: '',
      reportsTo: reportsTo || '',
      workCompCode,
      certifiedCode: '',
      benefitGroup: '',
      benefitGroupAssignmentDate: '',
      eeoClass: '',
      timeOffGroup: '',
      employmentType: '',
      compensationType: DECISIONHR_DEFAULTS.compensationType,
      payrollRule: DECISIONHR_DEFAULTS.payrollRule,
      payPeriod: DECISIONHR_DEFAULTS.payPeriod,
      workerType: DECISIONHR_DEFAULTS.workerType,
      compensableHours: '',
      hourlyRate: String(employee.hourly_wage ?? ''),
      numberOfUnits: '',
      jobCosting1: '',
      jobCosting2: '',
      jobCosting3: '',
      jobCosting4: '',
      jobCosting5: '',
      jobCosting6: '',
      jobCosting7: '',
      jobCosting8: '',
      jobCosting9: '',
    };

    // 5. Generate xlsx
    const xlsxBuffer = generateDecisionHRWorkbook(payload);
    const fileName = `${employee.first_name}_${employee.last_name}_DecisionHR_${Date.now()}.xlsx`;

    // 6. Upload to Supabase Storage
    const storagePath = `decisionhr/${employeeId}/${fileName}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('employee_documents')
      .upload(storagePath, xlsxBuffer, {
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      });

    if (uploadError) {
      console.error('[DecisionHR] Storage upload failed:', uploadError.message);
      return NextResponse.json({ error: 'File upload to storage failed' }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('employee_documents')
      .getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;

    // 7. Attempt OneDrive File Request upload
    let sharepointStatus: 'uploaded' | 'failed' | 'manual' = 'manual';
    let sharepointError: string | null = null;

    if (fileRequestUrl) {
      try {
        const formData = new FormData();
        const blob = new Blob([xlsxBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        formData.append('file', blob, fileName);

        const uploadResponse = await fetch(fileRequestUrl, {
          method: 'POST',
          body: formData,
        });

        if (uploadResponse.ok) {
          sharepointStatus = 'uploaded';
        } else {
          sharepointStatus = 'failed';
          sharepointError = `HTTP ${uploadResponse.status}: ${await uploadResponse.text().catch(() => 'Unknown error')}`;
          console.error('[DecisionHR] OneDrive upload failed:', sharepointError);
        }
      } catch (err) {
        sharepointStatus = 'failed';
        sharepointError = err instanceof Error ? err.message : 'Upload failed';
        console.error('[DecisionHR] OneDrive upload error:', sharepointError);
      }
    }

    // 8. Insert submission record
    const { data: submission, error: subError } = await supabaseAdmin
      .from('decisionhr_submissions')
      .insert({
        employee_id: employeeId,
        new_hire_id: newHireId || null,
        submitted_by: submittedBy,
        payload,
        file_storage_path: storagePath,
        file_url: fileUrl,
        sharepoint_status: sharepointStatus,
        sharepoint_error: sharepointError,
      })
      .select('id')
      .single();

    if (subError) {
      console.error('[DecisionHR] Submission insert failed:', subError.message);
    }

    // 9. Mark payroll checklist item as completed
    if (newHireId) {
      await supabaseAdmin
        .from('onboarding_progress')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('new_hire_id', newHireId)
        .eq('checklist_item_id', PAYROLL_USA_ITEM_ID);
    }

    return NextResponse.json({
      success: true,
      fileUrl,
      submissionId: submission?.id ?? null,
      sharepointStatus,
      sharepointError,
    });
  } catch (err) {
    console.error('[DecisionHR] Push error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
