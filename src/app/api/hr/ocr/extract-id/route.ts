import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { US_STATE_NAMES } from '@/lib/decisionhr-config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const visionApiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;

interface ExtractedAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/**
 * POST /api/hr/ocr/extract-id
 *
 * Extracts address from a Photo ID image using Google Cloud Vision OCR.
 * Called automatically when Photo ID is uploaded during onboarding.
 *
 * Body: { imageUrl: string, employeeId: string }
 * Returns: { extractedAddress, confidence, rawText }
 */
export async function POST(req: NextRequest) {
  try {
    if (!visionApiKey) {
      return NextResponse.json(
        { error: 'Google Cloud Vision API key not configured', extractedAddress: null },
        { status: 200 } // not a 500 — feature just not enabled
      );
    }

    const { imageUrl, employeeId } = await req.json();

    if (!imageUrl || !employeeId) {
      return NextResponse.json({ error: 'imageUrl and employeeId required' }, { status: 400 });
    }

    // Download the image from Supabase Storage
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Failed to download image' }, { status: 400 });
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // Call Google Cloud Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
            },
          ],
        }),
      }
    );

    if (!visionResponse.ok) {
      const errText = await visionResponse.text();
      console.error('[OCR] Vision API error:', errText);
      return NextResponse.json(
        { error: 'Vision API request failed', extractedAddress: null },
        { status: 200 }
      );
    }

    const visionData = await visionResponse.json();
    const fullText: string =
      visionData.responses?.[0]?.fullTextAnnotation?.text || '';

    if (!fullText) {
      return NextResponse.json({
        extractedAddress: { street: null, city: null, state: null, zip: null },
        confidence: 0,
        rawText: '',
      });
    }

    // Parse address from OCR text
    const extracted = parseAddressFromOCR(fullText);
    const confidence = calculateConfidence(extracted);

    // Save to employee_directory
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const updateFields: Record<string, string> = {};
    if (extracted.street) updateFields.street_address = extracted.street;
    if (extracted.city) updateFields.city = extracted.city;
    if (extracted.state) updateFields.state = extracted.state;
    if (extracted.zip) updateFields.zip_code = extracted.zip;

    if (Object.keys(updateFields).length > 0) {
      const { error: updateError } = await supabase
        .from('employee_directory')
        .update(updateFields)
        .eq('id', employeeId);

      if (updateError) {
        console.error('[OCR] Failed to update employee address:', updateError.message);
      }
    }

    return NextResponse.json({
      extractedAddress: extracted,
      confidence,
      rawText: fullText,
    });
  } catch (err) {
    console.error('[OCR] Unexpected error:', err);
    return NextResponse.json(
      { error: 'OCR processing failed', extractedAddress: null },
      { status: 200 }
    );
  }
}

// ---------------------------------------------------------------------------
// Address parsing utilities
// ---------------------------------------------------------------------------

/** Build a reverse map: state name (lowercase) → abbreviation */
const stateNameToAbbr: Record<string, string> = {};
for (const [abbr, name] of Object.entries(US_STATE_NAMES)) {
  stateNameToAbbr[name.toLowerCase()] = abbr;
}

/** All 2-letter state abbreviations */
const stateAbbreviations = new Set(Object.keys(US_STATE_NAMES));

function parseAddressFromOCR(text: string): ExtractedAddress {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let street: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  // Strategy 1: Look for city/state/zip pattern on a single line
  // Patterns: "City, ST 12345" or "City ST 12345" or "City, State 12345-6789"
  const cityStateZipRegex =
    /([A-Za-z\s.'-]+)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(cityStateZipRegex);
    if (match) {
      city = match[1].trim().replace(/,\s*$/, '');
      const stateCandidate = match[2].toUpperCase();
      if (stateAbbreviations.has(stateCandidate)) {
        state = stateCandidate;
      }
      zip = match[3];

      // The line above the city/state/zip is likely the street address
      if (i > 0) {
        const prevLine = lines[i - 1];
        // Street address typically starts with a number
        if (/^\d+\s/.test(prevLine)) {
          street = prevLine;
        }
      }
      break;
    }
  }

  // Strategy 2: Look for standalone zip code and work backwards
  if (!zip) {
    for (let i = 0; i < lines.length; i++) {
      const zipMatch = lines[i].match(/\b(\d{5}(?:-\d{4})?)\b/);
      if (zipMatch) {
        zip = zipMatch[1];

        // Try to extract state from same line or nearby
        const stateMatch = lines[i].match(/\b([A-Z]{2})\b/);
        if (stateMatch && stateAbbreviations.has(stateMatch[1])) {
          state = stateMatch[1];
        }
        break;
      }
    }
  }

  // Strategy 3: Look for full state name
  if (!state) {
    const textLower = text.toLowerCase();
    for (const [name, abbr] of Object.entries(stateNameToAbbr)) {
      if (textLower.includes(name)) {
        state = abbr;
        break;
      }
    }
  }

  // Strategy 4: Look for street address pattern (number + street name)
  if (!street) {
    for (const line of lines) {
      if (/^\d+\s+[A-Za-z]/.test(line) && /\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|way|pl|place|cir|circle)\b/i.test(line)) {
        street = line;
        break;
      }
    }
  }

  return { street, city, state, zip };
}

function calculateConfidence(addr: ExtractedAddress): number {
  let score = 0;
  if (addr.street) score += 25;
  if (addr.city) score += 25;
  if (addr.state) score += 30; // state is the most critical field
  if (addr.zip) score += 20;
  return score;
}
